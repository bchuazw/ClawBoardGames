"use client";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { Chess } from "chess.js";
import { useChess } from "@/app/chess/ChessContext";
import ThreeChessBoard from "./ThreeChessBoard";
import GameOverModal from "./GameOverModal";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const INITIAL_TIME_SEC = 10 * 60; // 10 minutes
const TIMER_STORAGE_KEY = "clawmate_timer";

function formatTime(sec) {
  const safe = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getStoredTimer(lobbyId) {
  try {
    const raw = localStorage.getItem(`${TIMER_STORAGE_KEY}_${lobbyId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getInitialTimes(lobbyId) {
  const defaultTimes = { white: INITIAL_TIME_SEC, black: INITIAL_TIME_SEC, fromStorage: false };
  if (!lobbyId) return defaultTimes;
  const stored = getStoredTimer(lobbyId);
  if (!stored || stored.whiteTime == null || stored.blackTime == null) return defaultTimes;
  const elapsed = Math.floor((Date.now() - (stored.updatedAt || 0)) / 1000);
  const turn = stored.turn || "w";
  let white = Math.max(0, Math.floor(stored.whiteTime));
  let black = Math.max(0, Math.floor(stored.blackTime));
  if (turn === "w") white = Math.max(0, white - elapsed);
  else black = Math.max(0, black - elapsed);
  return { white, black, fromStorage: true };
}

export default function GameView({ lobbyId, lobby: initialLobby, wallet, socket, onBack, onGameEnd, isTestGame }) {
  const { client } = useChess();
  const initialTimes = useMemo(() => getInitialTimes(lobbyId), [lobbyId]);
  const [lobby, setLobby] = useState(initialLobby || null);
  const [fen, setFen] = useState(() => {
    const f = initialLobby?.fen;
    return typeof f === "string" && f.length > 0 ? f : START_FEN;
  });
  const [status, setStatus] = useState(initialLobby?.status || "waiting");
  const [winner, setWinner] = useState(initialLobby?.winner ?? null);
  const [whiteTime, setWhiteTime] = useState(() =>
    initialLobby?.whiteTimeSec != null ? initialLobby.whiteTimeSec : initialTimes.white
  );
  const [blackTime, setBlackTime] = useState(() =>
    initialLobby?.blackTimeSec != null ? initialLobby.blackTimeSec : initialTimes.black
  );
  const [gameOverReason, setGameOverReason] = useState(null);
  const [showGameOverModal, setShowGameOverModal] = useState(false);
  const [showConcedeConfirm, setShowConcedeConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [concedeLoading, setConcedeLoading] = useState(false);
  const [drawOfferBy, setDrawOfferBy] = useState(null); // "white" | "black" | null (who offered draw)
  const [drawActionLoading, setDrawActionLoading] = useState(false);
  const timersInitialized = useRef(false);
  const lobbyRef = useRef(initialLobby);
  useEffect(() => {
    lobbyRef.current = lobby ?? initialLobby;
  }, [lobby, initialLobby]);

  useEffect(() => {
    if (isTestGame || !client || !socket) return;
    client.joinGame(lobbyId);
    const onJoinError = () => {
      client.connect().then(() => client.joinGame(lobbyId)).catch(() => {});
    };
    socket.on("join_lobby_error", onJoinError);
    return () => {
      socket.off("join_lobby_error", onJoinError);
      client.leaveGame(lobbyId);
      timersInitialized.current = false;
    };
  }, [lobbyId, client, socket, isTestGame]);

  useEffect(() => {
    if (status === "playing" && !timersInitialized.current) {
      const hasServerClock = initialLobby?.whiteTimeSec != null || initialLobby?.blackTimeSec != null;
      if (!initialTimes.fromStorage && !hasServerClock) {
        setWhiteTime(INITIAL_TIME_SEC);
        setBlackTime(INITIAL_TIME_SEC);
      }
      timersInitialized.current = true;
    }
    if (status !== "playing") timersInitialized.current = false;
  }, [status, initialTimes.fromStorage, initialLobby?.whiteTimeSec, initialLobby?.blackTimeSec]);

  // Persist timer so it survives refresh
  useEffect(() => {
    if (status !== "playing" || !lobbyId || winner != null) return;
    const turn = typeof fen === "string" ? (fen.split(" ")[1] || "w") : "w";
    try {
      localStorage.setItem(
        `${TIMER_STORAGE_KEY}_${lobbyId}`,
        JSON.stringify({ whiteTime, blackTime, updatedAt: Date.now(), turn })
      );
    } catch (_) {}
  }, [status, lobbyId, whiteTime, blackTime, fen, winner]);

  // Clear stored timer when game ends
  useEffect(() => {
    if ((status === "finished" || winner != null) && lobbyId) {
      try {
        localStorage.removeItem(`${TIMER_STORAGE_KEY}_${lobbyId}`);
      } catch (_) {}
    }
  }, [status, winner, lobbyId]);

  useEffect(() => {
    const onMove = (payload) => {
      setFen(payload.fen);
      if (payload.status) setStatus(payload.status);
      if (payload.whiteTimeSec != null) setWhiteTime(payload.whiteTimeSec);
      if (payload.blackTimeSec != null) setBlackTime(payload.blackTimeSec);
      if (payload.status === "finished") {
        setDrawOfferBy(null);
        setDrawActionLoading(false);
      }
      if (payload.winner != null) {
        setWinner(payload.winner);
        if (payload.concede) {
          const l = lobbyRef.current;
          const isWhite = l?.player1Wallet === wallet;
          const weWon = (payload.winner === "white" && isWhite) || (payload.winner === "black" && !isWhite);
          setGameOverReason(weWon ? "opponent_concede" : "concede");
        } else if (payload.timeout) {
          setGameOverReason("timeout");
        } else {
          setGameOverReason(payload.winner === "draw" ? (payload.reason || "draw") : "checkmate");
        }
        setShowGameOverModal(true);
      }
    };
    const onLobbyJoined = (payload) => {
      setFen(payload.fen);
      setStatus("playing");
    };
    const onDrawOffered = (payload) => setDrawOfferBy(payload?.by ?? null);
    const onDrawDeclined = () => setDrawOfferBy(null);
    const onDrawError = () => {
      setDrawOfferBy(null);
      setDrawActionLoading(false);
    };
    socket.on("move", onMove);
    socket.on("lobby_joined", onLobbyJoined);
    socket.on("draw_offered", onDrawOffered);
    socket.on("draw_declined", onDrawDeclined);
    socket.on("draw_error", onDrawError);
    return () => {
      socket.off("move", onMove);
      socket.off("lobby_joined", onLobbyJoined);
      socket.off("draw_offered", onDrawOffered);
      socket.off("draw_declined", onDrawDeclined);
      socket.off("draw_error", onDrawError);
    };
  }, [socket]);

  useEffect(() => {
    if (isTestGame || !lobbyId || lobby) return;
    api(`/api/lobbies/${lobbyId}`)
      .then((r) => r.json())
      .then((data) => {
        setLobby(data);
        const f = data.fen;
        if (typeof f === "string" && f.length > 0) setFen(f);
        if (data.status) setStatus(data.status);
        if (data.winner != null) {
          setWinner(data.winner);
          setGameOverReason(data.winner === "draw" ? (data.drawReason || "draw") : "checkmate");
          setShowGameOverModal(true);
        }
        if (data.status === "playing" && data.drawOfferBy != null) setDrawOfferBy(data.drawOfferBy);
        if (data.status === "playing" && (data.whiteTimeSec != null || data.blackTimeSec != null)) {
          if (data.whiteTimeSec != null) setWhiteTime(data.whiteTimeSec);
          if (data.blackTimeSec != null) setBlackTime(data.blackTimeSec);
        }
      })
      .catch(() => {});
  }, [lobbyId, lobby, isTestGame]);

  // Local timer for display only; server is source of truth and auto-declares timeout.
  useEffect(() => {
    if (status !== "playing" || winner != null) return;
    const turn = typeof fen === "string" ? (fen.split(" ")[1] || "w") : "w";
    const interval = setInterval(() => {
      if (turn === "w") {
        setWhiteTime((t) => {
          if (t <= 1) {
            setWinner("black");
            setStatus("finished");
            setGameOverReason("timeout");
            setShowGameOverModal(true);
            return 0;
          }
          return t - 1;
        });
      } else {
        setBlackTime((t) => {
          if (t <= 1) {
            setWinner("white");
            setStatus("finished");
            setGameOverReason("timeout");
            setShowGameOverModal(true);
            return 0;
          }
          return t - 1;
        });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [status, winner, fen]);

  const handleMove = (from, to, promotion) => {
    if (isTestGame) {
      try {
        const chess = new Chess(fen);
        const move = chess.move({ from, to, promotion: promotion || "q" });
        if (move) setFen(chess.fen());
      } catch (_) {}
      return;
    }
    if (client) client.makeMove(lobbyId, from, to, promotion || "q");
  };

  const handleBackClick = () => {
    if (!isTestGame && status === "playing" && (lobby?.player1Wallet === wallet || lobby?.player2Wallet === wallet)) {
      setShowLeaveConfirm(true);
    } else {
      onBack();
    }
  };

  const handleConcedeConfirm = async () => {
    if (!wallet || isTestGame || !client) return;
    setConcedeLoading(true);
    try {
      await client.concede(lobbyId);
      setWinner(lobby?.player1Wallet === wallet ? "black" : "white");
      setStatus("finished");
      setGameOverReason("concede");
      setShowGameOverModal(true);
      setShowConcedeConfirm(false);
    } catch (_) {}
    setConcedeLoading(false);
  };

  const isWhite = lobby?.player1Wallet === wallet;
  const isBlack = lobby?.player2Wallet === wallet;
  const turn = typeof fen === "string" ? (fen.split(" ")[1] || "w") : "w";
  const myTurn = isTestGame ? true : (status === "playing" && ((turn === "b" && isBlack) || (turn === "w" && isWhite)));
  const whiteToMove = turn === "w";

  return (
    <section className="game-view">
      <button type="button" className="btn btn-ghost" onClick={handleBackClick}>← Back</button>

      <div className="turn-and-timers">
        <div className={`turn-tile turn-white ${whiteToMove && status === "playing" ? "active" : ""}`}>
          <span className="turn-label">Blue</span>
          <span className="turn-time">{formatTime(whiteTime)}</span>
          {whiteToMove && status === "playing" && <span className="turn-badge">To move</span>}
        </div>
        <div className={`turn-tile turn-black ${!whiteToMove && status === "playing" ? "active" : ""}`}>
          <span className="turn-label">Pink</span>
          <span className="turn-time">{formatTime(blackTime)}</span>
          {!whiteToMove && status === "playing" && <span className="turn-badge">To move</span>}
        </div>
      </div>

      <div className="game-meta">
        <span>Lobby: {lobbyId?.slice(0, 8)}…</span>
        {status === "waiting" && <span className="status waiting">Waiting for opponent</span>}
        {status === "playing" && (
          <span className="status playing">
            {isTestGame ? "Test mode · Move any piece" : myTurn ? "Your turn" : "Opponent's turn"}
          </span>
        )}
        {status === "finished" && !showGameOverModal && (
          <span className="status finished">
            Game over · {winner === "draw" ? "Draw" : winner === "white" ? "Blue wins" : "Pink wins"}
          </span>
        )}
        {status === "playing" && !isTestGame && wallet && (
          <>
            {drawOfferBy === (isWhite ? "black" : "white") ? (
              <>
                <span className="status draw-offer-label">Opponent offered a draw</span>
                <button
                  type="button"
                  className="btn btn-draw-accept"
                  onClick={() => {
                    setDrawActionLoading(true);
                    if (client) client.acceptDraw(lobbyId);
                  }}
                  disabled={drawActionLoading}
                  title="Accept draw"
                >
                  {drawActionLoading ? "Accepting…" : "Accept draw"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    if (client) client.declineDraw(lobbyId);
                    setDrawOfferBy(null);
                  }}
                  disabled={drawActionLoading}
                  title="Decline draw"
                >
                  Decline
                </button>
              </>
            ) : drawOfferBy === (isWhite ? "white" : "black") ? (
              <>
                <span className="status draw-offer-label">Draw offer sent</span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    if (client) client.withdrawDraw(lobbyId);
                    setDrawOfferBy(null);
                  }}
                  disabled={drawActionLoading}
                  title="Withdraw draw offer"
                >
                  Withdraw offer
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-offer-draw"
                onClick={() => {
                  if (client) client.offerDraw(lobbyId);
                  setDrawOfferBy(isWhite ? "white" : "black");
                }}
                title="Offer a draw to your opponent"
              >
                Offer draw
              </button>
            )}
            <button
              type="button"
              className="btn btn-concede"
              onClick={() => setShowConcedeConfirm(true)}
              title="Concede and lose the game"
            >
              Concede
            </button>
          </>
        )}
      </div>

      <div className="board-with-captured">
        <div className="board-window">
          <ThreeChessBoard
            key={isTestGame ? "test" : "game"}
            gameId={lobbyId}
            fen={fen}
            onMove={handleMove}
            orientation={isBlack ? "black" : "white"}
            disabled={!isTestGame && (!myTurn || status !== "playing")}
            isTestGame={!!isTestGame}
          />
        </div>
      </div>

      {showGameOverModal && status === "finished" && (
        <GameOverModal
          winner={winner}
          reason={gameOverReason}
          onClose={() => {
            setShowGameOverModal(false);
            onGameEnd?.();
            onBack();
          }}
        />
      )}

      {showConcedeConfirm && (
        <div className="modal-overlay" onClick={() => !concedeLoading && setShowConcedeConfirm(false)}>
          <div className="modal concede-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Concede defeat?</h3>
            <p>Are you sure you want to concede? This will count as a loss.</p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => !concedeLoading && setShowConcedeConfirm(false)}
                disabled={concedeLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-concede-confirm"
                onClick={handleConcedeConfirm}
                disabled={concedeLoading}
              >
                {concedeLoading ? "Conceding…" : "Concede defeat"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showLeaveConfirm && (
        <div className="modal-overlay" onClick={() => setShowLeaveConfirm(false)}>
          <div className="modal leave-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Leave match?</h3>
            <p>You&apos;re in a match. Leave anyway? You can rejoin later from the main page.</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowLeaveConfirm(false)}>
                Stay
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setShowLeaveConfirm(false);
                  onBack();
                }}
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
