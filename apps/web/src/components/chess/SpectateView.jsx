"use client";
import React, { useState, useEffect, useRef } from "react";
import { useChess } from "@/app/chess/ChessContext";
import { api } from "@/lib/chess-api";
import ThreeChessBoard from "./ThreeChessBoard";
import GameOverModal from "./GameOverModal";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const INITIAL_TIME_SEC = 10 * 60;

function shortAddr(addr) {
  if (!addr || typeof addr !== "string") return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatTime(sec) {
  const safe = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function SpectateView({ lobbyId, socket, onBack }) {
  const { client } = useChess();
  const [lobby, setLobby] = useState(null);
  const [fen, setFen] = useState(START_FEN);
  const [status, setStatus] = useState("playing");
  const [winner, setWinner] = useState(null);
  const [whiteTime, setWhiteTime] = useState(INITIAL_TIME_SEC);
  const [blackTime, setBlackTime] = useState(INITIAL_TIME_SEC);
  const [gameOverReason, setGameOverReason] = useState(null);
  const [showGameOverModal, setShowGameOverModal] = useState(false);
  const [spectateError, setSpectateError] = useState(null);

  // Refs for polling/timer checks (avoid stale closures)
  const statusRef = useRef(status);
  const winnerRef = useRef(winner);
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { winnerRef.current = winner; }, [winner]);

  /** Derive game-over reason from a socket move/game_state payload. */
  function deriveGameOverReason(payload) {
    if (payload.concede) return "concede_spectator";
    if (payload.timeout) return "timeout";
    if (payload.reason === "inactivity") return "timeout";
    // finishReason from game_state (spectate reconnect) or enriched move payloads
    if (payload.finishReason === "concede") return "concede_spectator";
    if (payload.finishReason === "timeout") return "timeout";
    if (payload.finishReason) return payload.finishReason;
    if (payload.winner === "draw") return payload.reason || "draw";
    return "checkmate";
  }

  /** Derive game-over reason from a REST lobby response (uses persisted finishReason). */
  function deriveRestGameOverReason(data) {
    if (data.finishReason === "concede") return "concede_spectator";
    if (data.finishReason === "timeout") return "timeout";
    if (data.finishReason) return data.finishReason; // checkmate, stalemate, 50-move, threefold, insufficient, agreement
    // Fallback for lobbies without finishReason (pre-update data)
    if (data.winner === "draw") return data.drawReason || "draw";
    return "checkmate";
  }

  /** Apply a game state or move payload to component state. */
  function applyPayload(payload) {
    if (payload.fen) setFen(payload.fen);
    if (payload.status) setStatus(payload.status);
    if (payload.whiteTimeSec != null) setWhiteTime(payload.whiteTimeSec);
    if (payload.blackTimeSec != null) setBlackTime(payload.blackTimeSec);
    if (payload.winner != null) {
      setWinner(payload.winner);
      setGameOverReason(deriveGameOverReason(payload));
      setShowGameOverModal(true);
    }
  }

  // --- Socket: spectate room + listen for moves (platform: client.spectateGame or raw socket) ---
  useEffect(() => {
    if (!lobbyId || !socket) return;
    if (client) {
      client.spectateGame(lobbyId);
    } else {
      socket.emit("spectate_lobby", lobbyId);
    }

    const onGameState = (payload) => applyPayload(payload);
    const onMove = (payload) => applyPayload(payload);
    const onError = (payload) => {
      setSpectateError(payload?.reason || "Could not spectate this game.");
    };

    const onReconnect = () => {
      if (client) client.spectateGame(lobbyId);
      else socket.emit("spectate_lobby", lobbyId);
    };

    socket.on("game_state", onGameState);
    socket.on("move", onMove);
    socket.on("spectate_error", onError);
    socket.on("connect", onReconnect);

    return () => {
      socket.off("game_state", onGameState);
      socket.off("move", onMove);
      socket.off("spectate_error", onError);
      socket.off("connect", onReconnect);
      if (client) client.leaveGame(lobbyId);
      else socket.emit("leave_lobby", lobbyId);
    };
  }, [lobbyId, socket, client]);

  // --- Initial fetch on mount ---
  useEffect(() => {
    if (!lobbyId || lobby) return;
    api(`/api/lobbies/${lobbyId}`)
      .then((r) => r.json())
      .then((data) => {
        setLobby(data);
        if (data.fen) setFen(data.fen);
        if (data.status) setStatus(data.status);
        if (data.whiteTimeSec != null) setWhiteTime(data.whiteTimeSec);
        if (data.blackTimeSec != null) setBlackTime(data.blackTimeSec);
        if (data.winner != null) {
          setWinner(data.winner);
          setGameOverReason(deriveRestGameOverReason(data));
          setShowGameOverModal(true);
        }
      })
      .catch(() => {});
  }, [lobbyId, lobby]);

  // --- Polling fallback: catch up if socket drops. Stops once finished. ---
  useEffect(() => {
    if (!lobbyId) return;
    const poll = setInterval(() => {
      // Stop polling once game is finished
      if (statusRef.current === "finished") return;
      api(`/api/lobbies/${lobbyId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.fen) setFen(data.fen);
          if (data.status) setStatus(data.status);
          if (data.whiteTimeSec != null) setWhiteTime(data.whiteTimeSec);
          if (data.blackTimeSec != null) setBlackTime(data.blackTimeSec);
          if (data.player1Wallet || data.player2Wallet) {
            setLobby((prev) => (prev ? { ...prev, ...data } : data));
          }
          if (data.winner != null && data.status === "finished") {
            setWinner(data.winner);
            setGameOverReason(deriveRestGameOverReason(data));
            setShowGameOverModal(true);
          }
        })
        .catch(() => {});
    }, 10_000);
    return () => clearInterval(poll);
  }, [lobbyId]);

  // --- Local timer countdown (display only; server is source of truth) ---
  useEffect(() => {
    if (status !== "playing" || winner != null) return;
    const turn = typeof fen === "string" ? (fen.split(" ")[1] || "w") : "w";
    const interval = setInterval(() => {
      if (turn === "w") {
        setWhiteTime((t) => Math.max(0, t - 1));
      } else {
        setBlackTime((t) => Math.max(0, t - 1));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [status, winner, fen]);

  const turn = typeof fen === "string" ? (fen.split(" ")[1] || "w") : "w";
  const whiteToMove = turn === "w";

  if (spectateError) {
    return (
      <section className="game-view spectate-view">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          ← Back
        </button>
        <div className="spectate-badge" style={{ background: "rgba(255,80,80,0.2)", borderColor: "rgba(255,80,80,0.5)", color: "#ff8080" }}>
          {spectateError}
        </div>
      </section>
    );
  }

  return (
    <section className="game-view spectate-view">
      <button type="button" className="btn btn-ghost" onClick={onBack}>
        ← Back
      </button>

      <div className="spectate-badge">Spectating</div>

      <div className="turn-and-timers">
        <div className={`turn-tile turn-white ${whiteToMove && status === "playing" ? "active" : ""}`}>
          <span className="turn-label">Blue</span>
          <span className="turn-addr">{shortAddr(lobby?.player1Wallet)}</span>
          <span className="turn-time">{formatTime(whiteTime)}</span>
          {whiteToMove && status === "playing" && <span className="turn-badge">To move</span>}
        </div>
        <div className={`turn-tile turn-black ${!whiteToMove && status === "playing" ? "active" : ""}`}>
          <span className="turn-label">Pink</span>
          <span className="turn-addr">{shortAddr(lobby?.player2Wallet)}</span>
          <span className="turn-time">{formatTime(blackTime)}</span>
          {!whiteToMove && status === "playing" && <span className="turn-badge">To move</span>}
        </div>
      </div>

      <div className="game-meta">
        <span>Lobby: {lobbyId?.slice(0, 8)}…</span>
        {status === "playing" && (
          <span className="status playing">{whiteToMove ? "Blue to move" : "Pink to move"}</span>
        )}
        {status === "finished" && !showGameOverModal && (
          <span className="status finished">
            Game over · {winner === "draw" ? "Draw" : winner === "white" ? "Blue wins" : "Pink wins"}
          </span>
        )}
      </div>

      <div className="board-with-captured">
        <div className="board-window">
          <ThreeChessBoard
            gameId={`spectate-${lobbyId}`}
            fen={fen}
            onMove={() => {}}
            orientation="white"
            disabled
          />
        </div>
      </div>

      {showGameOverModal && status === "finished" && (
        <GameOverModal
          winner={winner}
          reason={gameOverReason ?? (winner === "draw" ? "draw" : "checkmate")}
          spectator
          onClose={() => {
            setShowGameOverModal(false);
            onBack();
          }}
        />
      )}
    </section>
  );
}
