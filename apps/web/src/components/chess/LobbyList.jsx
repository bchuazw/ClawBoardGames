"use client";
import React, { useState, useEffect } from "react";
import { formatEther } from "ethers";
import { useChess } from "@/app/chess/ChessContext";
import { api } from "@/lib/chess-api";
import { hasEscrow, getEscrowAddress, getContractBalance, toCancelErrorMessage } from "@/lib/chess-escrow";
import { joinLobbyOnChain, cancelLobbyOnChain, getGameStateOnChain } from "clawmate-sdk";
import { getBrowserSigner, getBrowserProvider } from "@/lib/chess-signer";

const REFUND_CLAIMED_STORAGE_KEY = "clawmate_refund_claimed";

function loadRefundClaimedIds() {
  try {
    const raw = localStorage.getItem(REFUND_CLAIMED_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.map((id) => Number(id)).filter((n) => !Number.isNaN(n) && n > 0) : []);
  } catch {
    return new Set();
  }
}

function saveRefundClaimedIds(ids) {
  try {
    localStorage.setItem(REFUND_CLAIMED_STORAGE_KEY, JSON.stringify([...ids]));
  } catch (_) {}
}

function betWeiToMon(weiStr) {
  if (!weiStr || weiStr === "0") return "0";
  try {
    return formatEther(weiStr);
  } catch {
    return weiStr;
  }
}

/** Get fullmove number from FEN (6th field). 1-based; 1 = after white's first move. */
function getTurnCount(fen) {
  if (!fen || typeof fen !== "string") return 0;
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 6) return 0;
  const n = parseInt(parts[5], 10);
  return Number.isNaN(n) ? 0 : n;
}

const TAB_OPEN = "open";
const TAB_LIVE = "live";
const TAB_HISTORY = "history";
const TAB_LEADERBOARD = "leaderboard";

export default function LobbyList({ wallet, rulesAccepted, onShowRules, onJoinLobby, onCreateClick, onSpectate, activeTab: activeTabProp, onTabChange }) {
  const { client } = useChess();
  const [internalTab, setInternalTab] = useState(TAB_OPEN);
  const activeTab = activeTabProp != null ? activeTabProp : internalTab;
  const setActiveTab = (t) => {
    if (onTabChange) onTabChange(t);
    else setInternalTab(t);
  };

  const [liveSearchWallet, setLiveSearchWallet] = useState("");
  const [lobbies, setLobbies] = useState([]);
  const [liveGames, setLiveGames] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [liveLoading, setLiveLoading] = useState(true);
  const [lbLoading, setLbLoading] = useState(true);
  const [joiningLobbyId, setJoiningLobbyId] = useState(null);
  const [joinError, setJoinError] = useState(null);
  const [cancellingLobbyId, setCancellingLobbyId] = useState(null);
  const [cancelError, setCancelError] = useState(null);
  const [failedCancelLobby, setFailedCancelLobby] = useState(null); // lobby that failed on-chain cancel, so we can offer "Remove from list anyway"
  const [contractCancelReason, setContractCancelReason] = useState(null); // reason from reading contract state after cancel failed
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [claimingRefundId, setClaimingRefundId] = useState(null);
  const [refundError, setRefundError] = useState(null);
  const [refundSuccessId, setRefundSuccessId] = useState(null);
  const [refundClaimedContractGameIds, setRefundClaimedContractGameIds] = useState(() => loadRefundClaimedIds());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        if (client) {
          const list = await client.getLobbies();
          if (!cancelled) setLobbies(Array.isArray(list) ? list : []);
        } else {
          const res = await api("/api/lobbies");
          const data = await res.json();
          if (!cancelled) setLobbies(data.lobbies || []);
        }
      } catch (_) {}
      if (!cancelled) setLoading(false);
    };
    load();
    const t = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, [client]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        if (client) {
          const list = await client.getLiveGames();
          if (!cancelled) setLiveGames(Array.isArray(list) ? list : []);
        } else {
          const res = await api("/api/lobbies?status=playing");
          const data = await res.json();
          if (!cancelled) setLiveGames(data.lobbies || []);
        }
      } catch (_) {}
      if (!cancelled) setLiveLoading(false);
    };
    load();
    const t = setInterval(load, 3000);
    return () => { cancelled = true; clearInterval(t); };
  }, [client]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await api("/api/leaderboard");
        const data = await res.json();
        if (!cancelled) setLeaderboard(data.leaderboard || []);
      } catch (_) {}
      if (!cancelled) setLbLoading(false);
    };
    load();
    const t = setInterval(load, 10000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // History: load finished + cancelled lobbies for the connected wallet
  useEffect(() => {
    if (!wallet || activeTab !== TAB_HISTORY) return;
    let cancelled = false;
    const load = async () => {
      setHistoryLoading(true);
      try {
        const res = await api(`/api/lobbies/history?wallet=${encodeURIComponent(wallet)}`);
        const data = await res.json();
        if (!cancelled) setHistory(data.lobbies || []);
      } catch (_) {}
      if (!cancelled) setHistoryLoading(false);
    };
    load();
    // Refresh every 15s while on the history tab
    const t = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, [wallet, activeTab]);

  // Your active games (playing, you are player1 or player2) — show in Open tab so you can rejoin without relying on banner/localStorage
  const myActiveGames = (liveGames || []).filter(
    (l) =>
      wallet &&
      (l.player1Wallet?.toLowerCase() === wallet.toLowerCase() || l.player2Wallet?.toLowerCase() === wallet.toLowerCase())
  );

  const join = async (lobby) => {
    if (!wallet) return;
    if (!rulesAccepted) {
      onShowRules?.();
      return;
    }
    const lobbyId = lobby?.lobbyId;
    if (!lobbyId || typeof lobbyId !== "string") {
      setJoinError("Invalid lobby: missing lobby id");
      return;
    }
    const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidV4.test(lobbyId)) {
      setJoinError("Invalid lobby: lobby id format is invalid");
      return;
    }
    setJoiningLobbyId(lobbyId);
    setJoinError(null);
    try {
      const betWei = lobby.betAmount ? String(lobby.betAmount) : "0";
      const needsOnChain = hasEscrow() && lobby.contractGameId != null && BigInt(betWei) > 0n;
      if (needsOnChain) {
        const signer = await getBrowserSigner();
        const contractAddress = getEscrowAddress();
        if (!signer || !contractAddress) {
          setJoinError("Wallet or escrow not configured");
          setJoiningLobbyId(null);
          return;
        }
        try {
          await joinLobbyOnChain({ signer, contractAddress, gameId: lobby.contractGameId, betWei });
        } catch (e) {
          setJoinError(e?.reason ?? e?.message ?? "Transaction failed or was rejected");
          setJoiningLobbyId(null);
          return;
        }
      }
      if (!client) {
        setJoinError("Wallet not connected");
        setJoiningLobbyId(null);
        return;
      }
      const data = await client.joinLobby(lobbyId);
      onJoinLobby(lobbyId, { ...lobby, fen: data?.fen, status: "playing", player2Wallet: wallet });
    } catch (e) {
      setJoinError(e?.reason || e?.message || "Failed to join");
    } finally {
      setJoiningLobbyId(null);
    }
  };

  // When cancel failed and we have a lobby with contractGameId, read on-chain state to show why (platform: SDK getGameStateOnChain)
  useEffect(() => {
    if (!failedCancelLobby || failedCancelLobby.contractGameId == null || !wallet) {
      setContractCancelReason(null);
      return;
    }
    const provider = getBrowserProvider();
    const contractAddress = getEscrowAddress();
    if (!provider || !contractAddress) {
      setContractCancelReason(null);
      return;
    }
    setContractCancelReason("Reading contract state…");
    let cancelled = false;
    Promise.all([
      getGameStateOnChain({ provider, contractAddress, gameId: failedCancelLobby.contractGameId }),
      getContractBalance(),
    ])
      .then(([state, balance]) => {
        if (cancelled) return;
        if (!state) {
          setContractCancelReason("Could not read contract state. Check you're on the correct Monad network and the contract address in .env is correct.");
          return;
        }
        const w = wallet.toLowerCase();
        const zero = "0x0000000000000000000000000000000000000000";
        if (!state.active) setContractCancelReason("Contract says: this lobby was already cancelled on-chain.");
        else if (state.player2 !== zero) setContractCancelReason("Contract says: someone already joined; you cannot cancel.");
        else if (state.player1 !== w) setContractCancelReason("Contract says: your wallet is not the creator on-chain.");
        else if (balance != null && state.betAmount && BigInt(balance) < BigInt(state.betAmount)) setContractCancelReason("Contract balance is too low to refund—contract may have been redeployed. Your bet may be in an old deployment. Use 'Remove from list anyway'.");
        else setContractCancelReason("Contract state: lobby is active and you're the creator. If the tx still reverts, the contract may not have enough balance to refund (e.g. after redeploy)—use 'Remove from list anyway'.");
      })
      .catch(() => setContractCancelReason("Could not read contract state. Check you're on the correct Monad network and the contract address in .env is correct."));
    return () => { cancelled = true; };
  }, [failedCancelLobby?.lobbyId, failedCancelLobby?.contractGameId, wallet]);

  const loadLobbies = async () => {
    try {
      if (client) {
        const list = await client.getLobbies();
        setLobbies(Array.isArray(list) ? list : []);
      } else {
        const res = await api("/api/lobbies");
        const data = await res.json();
        setLobbies(data.lobbies || []);
      }
    } catch (_) {}
  };

  const cancelLobby = async (lobby) => {
    if (!wallet || lobby.player1Wallet?.toLowerCase() !== wallet.toLowerCase()) return;
    const needsOnChain = hasEscrow() && lobby.contractGameId != null;
    setCancellingLobbyId(lobby.lobbyId);
    setCancelError(null);
    setFailedCancelLobby(null);
    setContractCancelReason(null);
    try {
      if (needsOnChain) {
        const signer = await getBrowserSigner();
        const contractAddress = getEscrowAddress();
        if (!signer || !contractAddress) {
          setCancelError("Wallet or escrow not configured");
          setCancellingLobbyId(null);
          return;
        }
        await cancelLobbyOnChain({ signer, contractAddress, gameId: lobby.contractGameId });
      }
      if (!client) {
        setCancelError("Wallet not connected");
        setCancellingLobbyId(null);
        return;
      }
      await client.cancelLobby(lobby.lobbyId);
      await loadLobbies();
      setFailedCancelLobby(null);
    } catch (e) {
      setCancelError(needsOnChain ? toCancelErrorMessage(e) : (e?.message || e?.reason || "Failed to cancel"));
      setFailedCancelLobby(needsOnChain ? lobby : null);
    } finally {
      setCancellingLobbyId(null);
    }
  };

  const removeLobbyFromListOnly = async () => {
    if (!failedCancelLobby || !wallet || !client) return;
    setCancelError(null);
    try {
      await client.cancelLobby(failedCancelLobby.lobbyId);
      setFailedCancelLobby(null);
      setContractCancelReason(null);
      await loadLobbies();
    } catch (e) {
      setCancelError(e?.message || e?.reason || "Failed to remove from list");
    }
  };

  const claimRefund = async (lobbyId, contractGameId) => {
    if (!contractGameId || !wallet || !hasEscrow()) return;
    const gameId = typeof contractGameId === "number" ? contractGameId : parseInt(String(contractGameId), 10);
    if (Number.isNaN(gameId) || gameId < 1) return;
    const signer = await getBrowserSigner();
    const contractAddress = getEscrowAddress();
    if (!signer || !contractAddress) {
      setRefundError("Wallet or escrow not configured");
      return;
    }
    setClaimingRefundId(lobbyId);
    setRefundError(null);
    setRefundSuccessId(null);
    try {
      await cancelLobbyOnChain({ signer, contractAddress, gameId });
      setRefundClaimedContractGameIds((prev) => {
        const next = new Set(prev).add(gameId);
        saveRefundClaimedIds(next);
        return next;
      });
      setRefundSuccessId(lobbyId);
      setTimeout(() => setRefundSuccessId(null), 5000);
    } catch (e) {
      setRefundError(e?.message || e?.reason || "Failed to claim refund");
    } finally {
      setClaimingRefundId(null);
    }
  };

  return (
    <section className="lobby-list lobby-page">
      <div className="lobby-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === TAB_OPEN}
          className={`lobby-tab ${activeTab === TAB_OPEN ? "active" : ""}`}
          onClick={() => setActiveTab(TAB_OPEN)}
        >
          Open lobbies
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === TAB_LIVE}
          className={`lobby-tab ${activeTab === TAB_LIVE ? "active" : ""}`}
          onClick={() => setActiveTab(TAB_LIVE)}
        >
          Live games
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === TAB_HISTORY}
          className={`lobby-tab ${activeTab === TAB_HISTORY ? "active" : ""}`}
          onClick={() => setActiveTab(TAB_HISTORY)}
        >
          History
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === TAB_LEADERBOARD}
          className={`lobby-tab ${activeTab === TAB_LEADERBOARD ? "active" : ""}`}
          onClick={() => setActiveTab(TAB_LEADERBOARD)}
        >
          Leaderboard
        </button>
      </div>

      {activeTab === TAB_OPEN && (
        <>
          {!rulesAccepted && (
            <div className="lobby-rules-gate" role="alert">
              <p>You must accept the FIDE rules before creating or joining a game.</p>
              <button type="button" className="btn btn-rules-inline" onClick={onShowRules}>
                View &amp; accept rules
              </button>
            </div>
          )}
          <div className="lobby-actions-card">
            <div className="lobby-actions">
              <button
                type="button"
                className="btn btn-create"
                onClick={onCreateClick}
                disabled={!wallet || !rulesAccepted}
              >
                <span className="lobby-btn-icon">+</span>
                Create lobby
              </button>
            </div>
          </div>

          {(joinError || cancelError) && (
            <div className="lobby-error" role="alert">
              <p className="lobby-error-text">{joinError || cancelError}</p>
              {contractCancelReason && <p className="lobby-error-contract-reason">{contractCancelReason}</p>}
              {failedCancelLobby && (
                <div className="lobby-error-actions">
                  <p className="lobby-error-hint">
                    You can remove this lobby from the list so it no longer appears. Your bet may still be in the contract—try cancelling again, or call <code>cancelLobby({failedCancelLobby.contractGameId})</code> on the contract via a Monad block explorer.
                  </p>
                  <button
                    type="button"
                    className="btn btn-remove-from-list"
                    onClick={removeLobbyFromListOnly}
                  >
                    Remove from list anyway
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="lobby-content">
        {loading ? (
          <div className="lobby-empty">
            <span className="lobby-empty-icon">⋯</span>
            <p className="lobby-empty-title">Loading lobbies</p>
          </div>
        ) : myActiveGames.length === 0 && lobbies.length === 0 ? (
          <div className="lobby-empty">
            <span className="lobby-empty-icon">♟</span>
            <p className="lobby-empty-title">No open lobbies</p>
            <p className="lobby-empty-desc">Create one to get started. Others can join and play.</p>
            <button
              type="button"
              className="btn btn-create btn-empty-cta"
              onClick={onCreateClick}
              disabled={!wallet}
            >
              Create lobby
            </button>
          </div>
        ) : (
          <ul className="lobby-cards lobby-cards-open">
            {myActiveGames.map((l) => (
              <li key={l.lobbyId} className="lobby-card lobby-card-my-game">
                <span className="lobby-card-icon">♟</span>
                <div className="lobby-card-body">
                  <span className="lobby-card-bet">Bet: {betWeiToMon(l.betAmount)} MON</span>
                  <span className="lobby-card-creator">
                    {l.player1Wallet ? `${l.player1Wallet.slice(0, 6)}…${l.player1Wallet.slice(-4)}` : "—"} vs {l.player2Wallet ? `${l.player2Wallet.slice(0, 6)}…${l.player2Wallet.slice(-4)}` : "—"}
                  </span>
                  <span className="lobby-card-my-game-label">Your active match</span>
                </div>
                <div className="lobby-card-actions">
                  <button
                    type="button"
                    className="btn btn-rejoin-lobby"
                    onClick={() => onJoinLobby(l.lobbyId, { ...l, fen: l.fen, status: "playing" })}
                    title="Rejoin this game"
                  >
                    Rejoin
                  </button>
                </div>
              </li>
            ))}
            {lobbies.map((l) => {
              const isCreator = wallet && l.player1Wallet?.toLowerCase() === wallet.toLowerCase();
              const canCancel = isCreator;
              return (
                <li key={l.lobbyId} className="lobby-card">
                  <span className="lobby-card-icon">♟</span>
                  <div className="lobby-card-body">
                    <span className="lobby-card-bet">Bet: {betWeiToMon(l.betAmount)} MON</span>
                    <span className="lobby-card-creator">
                      {l.player1Wallet ? `${l.player1Wallet.slice(0, 6)}…${l.player1Wallet.slice(-4)}` : "—"}
                    </span>
                  </div>
                  <div className="lobby-card-actions">
                    {canCancel && (
                      <button
                        type="button"
                        className="btn btn-cancel-lobby"
                        onClick={() => cancelLobby(l)}
                        disabled={cancellingLobbyId === l.lobbyId}
                        title="Cancel lobby and get your bet back (no opponent yet)"
                      >
                        {cancellingLobbyId === l.lobbyId ? "Cancelling…" : "Cancel"}
                      </button>
                    )}
                    {isCreator ? (
                      <button
                        type="button"
                        className="btn btn-rejoin-lobby"
                        onClick={() => onJoinLobby(l.lobbyId, { ...l, status: "waiting", fen: l.fen })}
                        title="Return to your lobby and wait for an opponent"
                      >
                        Rejoin
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-join"
                        onClick={() => join(l)}
                        disabled={!wallet || !rulesAccepted || joiningLobbyId === l.lobbyId}
                      >
                        {joiningLobbyId === l.lobbyId ? "Joining…" : "Join"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
          </div>
        </>
      )}

      {activeTab === TAB_LIVE && (
        <div className="lobby-live-section">
          <p className="lobby-live-subtitle">Spectate games in progress</p>
          <div className="lobby-live-search">
            <label htmlFor="live-search-wallet" className="lobby-live-search-label">Search by wallet</label>
            <input
              id="live-search-wallet"
              type="text"
              className="lobby-live-search-input"
              placeholder="e.g. 0x1234…abcd"
              value={liveSearchWallet}
              onChange={(e) => setLiveSearchWallet(e.target.value)}
              aria-label="Filter live games by wallet address"
            />
          </div>
          {liveLoading ? (
            <div className="lobby-empty">
              <span className="lobby-empty-icon">⋯</span>
              <p className="lobby-empty-title">Loading live games</p>
            </div>
          ) : (() => {
            const search = liveSearchWallet.trim().toLowerCase();
            const filtered = search
              ? liveGames.filter(
                  (l) =>
                    (l.player1Wallet || "").toLowerCase().includes(search) ||
                    (l.player2Wallet || "").toLowerCase().includes(search)
                )
              : liveGames;
            return filtered.length === 0 ? (
              <div className="lobby-empty">
                <span className="lobby-empty-icon">♟</span>
                <p className="lobby-empty-title">{liveGames.length === 0 ? "No live games" : "No games match wallet"}</p>
                <p className="lobby-empty-desc">
                  {liveGames.length === 0
                    ? "Games in progress will appear here. Create or join a game to start playing."
                    : "Try a different wallet search."}
                </p>
              </div>
            ) : (
              <ul className="lobby-cards lobby-cards-live">
                {filtered.map((l) => {
                  const turnCount = getTurnCount(l.fen);
                  return (
                    <li key={l.lobbyId} className="lobby-card lobby-card-live">
                      <span className="lobby-card-icon">♟</span>
                      <div className="lobby-card-body">
                        <span className="lobby-card-bet">Bet: {betWeiToMon(l.betAmount)} MON</span>
                        <span className="lobby-card-creator">
                          {l.player1Wallet ? `${l.player1Wallet.slice(0, 6)}…${l.player1Wallet.slice(-4)}` : "—"} vs {l.player2Wallet ? `${l.player2Wallet.slice(0, 6)}…${l.player2Wallet.slice(-4)}` : "—"}
                        </span>
                        <span className="lobby-card-turn">Turn {turnCount}</span>
                      </div>
                      <div className="lobby-card-actions">
                        <button
                          type="button"
                          className="btn btn-spectate"
                          onClick={() => onSpectate?.(l.lobbyId)}
                          title="Watch this game live"
                        >
                          Spectate
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            );
          })()}
        </div>
      )}

      {activeTab === TAB_HISTORY && (
        <div className="history-section">
          <p className="lobby-live-subtitle">Your finished &amp; cancelled games</p>
          {!wallet ? (
            <div className="lobby-empty">
              <span className="lobby-empty-icon">🔌</span>
              <p className="lobby-empty-title">Connect your wallet</p>
              <p className="lobby-empty-desc">Connect a wallet to view your game history.</p>
            </div>
          ) : historyLoading && history.length === 0 ? (
            <div className="lobby-empty">
              <span className="lobby-empty-icon">⋯</span>
              <p className="lobby-empty-title">Loading history</p>
            </div>
          ) : history.length === 0 ? (
            <div className="lobby-empty">
              <span className="lobby-empty-icon">♟</span>
              <p className="lobby-empty-title">No past games found</p>
              <p className="lobby-empty-desc">Your finished and cancelled games will appear here.</p>
            </div>
          ) : (
            <>
              {refundError && (
                <p className="lobby-refund-error" role="alert">{refundError}</p>
              )}
              <ul className="lobby-cards lobby-cards-history">
                {history.map((l) => {
                  const isCancelled = l.status === "cancelled";
                  const isFinished = l.status === "finished";
                  const w = wallet.toLowerCase();
                  const isP1 = l.player1Wallet?.toLowerCase() === w;
                  const myColor = isP1 ? "white" : "black";
                  const opponentWallet = isP1 ? l.player2Wallet : l.player1Wallet;

                  let resultLabel = "";
                  let resultClass = "";
                  if (isCancelled) {
                    resultLabel = "Cancelled";
                    resultClass = "history-cancelled";
                  } else if (l.winner === "draw") {
                    resultLabel = "Draw";
                    resultClass = "history-draw";
                  } else if (l.winner === myColor) {
                    resultLabel = "Won";
                    resultClass = "history-won";
                  } else {
                    resultLabel = "Lost";
                    resultClass = "history-lost";
                  }

                  let reasonLabel = "";
                  if (isFinished) {
                    const r = l.finishReason || l.drawReason;
                    if (r === "checkmate") reasonLabel = "Checkmate";
                    else if (r === "timeout") reasonLabel = "Timeout";
                    else if (r === "concede") reasonLabel = "Concession";
                    else if (r === "agreement") reasonLabel = "By agreement";
                    else if (r === "stalemate") reasonLabel = "Stalemate";
                    else if (r === "threefold") reasonLabel = "Threefold repetition";
                    else if (r === "insufficient") reasonLabel = "Insufficient material";
                    else if (r === "50-move") reasonLabel = "50-move rule";
                    else if (r) reasonLabel = r.charAt(0).toUpperCase() + r.slice(1);
                  }

                  const canRefund = isCancelled && hasEscrow() && l.contractGameId != null;
                  const contractId = l.contractGameId != null ? Number(l.contractGameId) : null;
                  const refundAlreadyClaimed = contractId != null && refundClaimedContractGameIds.has(contractId);

                  const resultIcon =
                    resultClass === "history-won" ? "♔" : resultClass === "history-lost" ? "♟" : resultClass === "history-draw" ? "=" : "⊗";

                  return (
                    <li key={l.lobbyId} className={`lobby-card lobby-card-history ${resultClass}`}>
                      <div className="history-card-accent" aria-hidden />
                      <span className="history-card-icon" aria-hidden>{resultIcon}</span>
                      <div className="lobby-card-body history-card-body">
                        <div className="history-card-top">
                          <span className="lobby-card-bet history-card-bet">{betWeiToMon(l.betAmount)} MON</span>
                          {l.contractGameId != null && (
                            <span className="history-game-id">#{l.contractGameId}</span>
                          )}
                        </div>
                        <span className="lobby-card-creator history-card-opponent">
                          vs {opponentWallet ? `${opponentWallet.slice(0, 6)}…${opponentWallet.slice(-4)}` : "No opponent"}
                        </span>
                        <div className="history-card-meta">
                          <span className={`history-result-label ${resultClass}`}>{resultLabel}</span>
                          {reasonLabel && <span className="history-reason-label">{reasonLabel}</span>}
                        </div>
                      </div>
                      <div className="lobby-card-actions history-card-actions">
                        {canRefund && !refundAlreadyClaimed && (
                          <button
                            type="button"
                            className="btn btn-claim-refund"
                            onClick={() => claimRefund(l.lobbyId, l.contractGameId)}
                            disabled={claimingRefundId === l.lobbyId}
                            title="Claim your bet refund from the escrow contract"
                          >
                            {claimingRefundId === l.lobbyId ? "Claiming…" : "Claim refund"}
                          </button>
                        )}
                        {(refundAlreadyClaimed || refundSuccessId === l.lobbyId) && (
                          <span className="history-refund-ok">Refund claimed</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}

      {activeTab === TAB_LEADERBOARD && (
        <div className="leaderboard-section">
          <p className="lobby-live-subtitle">All-time standings by PnL</p>
          {lbLoading ? (
            <div className="lobby-empty">
              <span className="lobby-empty-icon">⋯</span>
              <p className="lobby-empty-title">Loading leaderboard</p>
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="lobby-empty">
              <span className="lobby-empty-icon">🏆</span>
              <p className="lobby-empty-title">No games finished yet</p>
              <p className="lobby-empty-desc">Play a game and the leaderboard will appear here.</p>
            </div>
          ) : (
            <div className="leaderboard-table-wrap">
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th className="lb-rank">#</th>
                    <th className="lb-wallet">Name</th>
                    <th className="lb-pnl">PnL (MON)</th>
                    <th className="lb-stat">Played</th>
                    <th className="lb-stat">Won</th>
                    <th className="lb-stat">Lost</th>
                    <th className="lb-stat">Drawn</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry, i) => {
                    const pnlMon = (() => { try { return formatEther(entry.pnl); } catch { return entry.pnl; } })();
                    const pnlNum = parseFloat(pnlMon);
                    const pnlClass = pnlNum > 0 ? "lb-positive" : pnlNum < 0 ? "lb-negative" : "";
                    const isMe = wallet && entry.wallet?.toLowerCase() === wallet.toLowerCase();
                    const played = (entry.wins || 0) + (entry.losses || 0) + (entry.draws || 0);
                    return (
                      <tr key={entry.wallet} className={isMe ? "lb-row-me" : ""}>
                        <td className="lb-rank">{i + 1}</td>
                        <td className="lb-wallet" title={entry.wallet}>
                          {entry.username || (entry.wallet ? `${entry.wallet.slice(0, 6)}…${entry.wallet.slice(-4)}` : "—")}
                          {isMe && <span className="lb-you-badge">You</span>}
                        </td>
                        <td className={`lb-pnl ${pnlClass}`}>{pnlNum > 0 ? "+" : ""}{pnlMon}</td>
                        <td className="lb-stat">{played}</td>
                        <td className="lb-stat">{entry.wins}</td>
                        <td className="lb-stat">{entry.losses}</td>
                        <td className="lb-stat">{entry.draws}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
