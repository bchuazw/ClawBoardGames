"use client";

import React from "react";
import { usePathname, useParams, useRouter } from "next/navigation";
import { formatEther } from "ethers";
import { lamportsToSol } from "@/lib/chess-escrow";
import Link from "next/link";
import { useChess } from "./ChessContext";
import { useNetwork } from "@/context/NetworkContext";
import Landing from "@/components/chess/Landing";
import LobbyList from "@/components/chess/LobbyList";
import CreateLobby from "@/components/chess/CreateLobby";
import GameView from "@/components/chess/GameView";
import SpectateView from "@/components/chess/SpectateView";
import RulesModal from "@/components/chess/RulesModal";
import WalletBar from "@/components/chess/WalletBar";
import ErrorBoundary from "@/components/chess/ErrorBoundary";

export default function ChessApp() {
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const lobbyId = params?.lobbyId as string | undefined;
  const { config } = useNetwork();
  const {
    wallet,
    setWallet,
    chain,
    socket,
    showRulesModal,
    setShowRulesModal,
    rulesAccepted,
    openGame,
    backToLobbies,
    openSpectate,
    onGameEnd,
    rejoinBanner,
    toast,
    setToast,
    openLobbyFromToast,
    rejoinGame,
    dismissRejoin,
    handleLobbyTabChange,
    acceptRules,
    lastOpenedLobby,
  } = useChess();

  const isInGame = pathname?.startsWith("/chess/game/");

  const mainContent = () => {
    if (pathname === "/chess" || pathname === "/chess/") {
      return (
        <Landing
          onPlayNow={() => router.push("/chess/lobbies")}
          onShowRules={() => setShowRulesModal(true)}
        />
      );
    }
    if (pathname === "/chess/lobbies") {
      return (
        <LobbyList
          wallet={wallet}
          chain={chain}
          rulesAccepted={rulesAccepted}
          onShowRules={() => setShowRulesModal(true)}
          onJoinLobby={openGame}
          onCreateClick={() => {
            if (!rulesAccepted) {
              setShowRulesModal(true);
              return;
            }
            router.push("/chess/create");
          }}
          onSpectate={openSpectate}
          activeTab="open"
          onTabChange={handleLobbyTabChange}
        />
      );
    }
    if (pathname === "/chess/livegames") {
      return (
        <LobbyList
          wallet={wallet}
          chain={chain}
          rulesAccepted={rulesAccepted}
          onShowRules={() => setShowRulesModal(true)}
          onJoinLobby={openGame}
          onCreateClick={() => {
            if (!rulesAccepted) { setShowRulesModal(true); return; }
            router.push("/chess/create");
          }}
          onSpectate={openSpectate}
          activeTab="live"
          onTabChange={handleLobbyTabChange}
        />
      );
    }
    if (pathname === "/chess/history") {
      return (
        <LobbyList
          wallet={wallet}
          chain={chain}
          rulesAccepted={rulesAccepted}
          onShowRules={() => setShowRulesModal(true)}
          onJoinLobby={openGame}
          onCreateClick={() => {
            if (!rulesAccepted) { setShowRulesModal(true); return; }
            router.push("/chess/create");
          }}
          onSpectate={openSpectate}
          activeTab="history"
          onTabChange={handleLobbyTabChange}
        />
      );
    }
    if (pathname === "/chess/leaderboard") {
      return (
        <LobbyList
          wallet={wallet}
          chain={chain}
          rulesAccepted={rulesAccepted}
          onShowRules={() => setShowRulesModal(true)}
          onJoinLobby={openGame}
          onCreateClick={() => {
            if (!rulesAccepted) { setShowRulesModal(true); return; }
            router.push("/chess/create");
          }}
          onSpectate={openSpectate}
          activeTab="leaderboard"
          onTabChange={handleLobbyTabChange}
        />
      );
    }
    if (pathname === "/chess/create") {
      return (
        <CreateLobby
          wallet={wallet}
          chain={chain}
          rulesAccepted={rulesAccepted}
          onShowRules={() => setShowRulesModal(true)}
          onCreated={openGame}
          onBack={() => router.push("/chess/lobbies")}
        />
      );
    }
    if (pathname?.startsWith("/chess/watch/") && lobbyId) {
      return (
        <SpectateView
          lobbyId={lobbyId}
          socket={socket!}
          onBack={() => router.push("/chess/livegames")}
        />
      );
    }
    if (pathname?.startsWith("/chess/game/") && lobbyId && socket) {
      const initial = lastOpenedLobby?.lobbyId === lobbyId ? lastOpenedLobby.lobby : null;
      return (
        <GameView
          lobbyId={lobbyId}
          lobby={initial}
          wallet={wallet}
          socket={socket}
          onBack={backToLobbies}
          onGameEnd={onGameEnd}
          isTestGame={false}
        />
      );
    }
    return (
      <div className="main" style={{ padding: 24, textAlign: "center" }}>
        <p>Loading…</p>
      </div>
    );
  };

  return (
    <div className="chess-app-wrap clawgig-style">
      <div className="app clawgig-style">
        <header className="header">
          <Link href="/chess" className="header-logo" style={{ textDecoration: "none", color: "inherit" }}>
            <span style={{ color: config.accentColor }}>Claw</span>Mate
          </Link>
          <nav className="header-nav">
            {pathname === "/chess" && (
              <Link href="/chess/lobbies" className="btn btn-nav" style={{ textDecoration: "none", color: "inherit" }}>
                Play
              </Link>
            )}
            <WalletBar wallet={wallet} setWallet={setWallet} chain={chain} />
          </nav>
        </header>

        {showRulesModal && (
          <RulesModal
            onClose={() => setShowRulesModal(false)}
            onAccept={acceptRules}
          />
        )}

        {toast && (
          <div className="toast toast-bottom-right" role="status">
            <p className="toast-title">Someone joined your lobby</p>
            <p className="toast-desc">
              Bet: {chain === "solana"
                ? lamportsToSol(toast.betAmount || "0")
                : (() => {
                    try { return formatEther(toast.betAmount || "0"); } catch { return "0"; }
                  })()} {chain === "solana" ? "SOL" : chain === "bnb" ? "tBNB" : "MON"}
            </p>
            <div className="toast-actions">
              <button type="button" className="btn btn-toast-rejoin" onClick={openLobbyFromToast}>
                Rejoin
              </button>
              <button type="button" className="btn btn-toast-dismiss" onClick={() => setToast(null)}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        {rejoinBanner && !isInGame && (
          <div className="rejoin-banner" role="region" aria-label="Active match">
            <span className="rejoin-banner-text">You have an active match. Rejoin to continue.</span>
            <div className="rejoin-banner-actions">
              <button type="button" className="btn btn-rejoin" onClick={rejoinGame}>
                Rejoin
              </button>
              <button type="button" className="btn btn-dismiss-rejoin" onClick={dismissRejoin}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        <main className="main">
          <ErrorBoundary onReset={backToLobbies}>
            {mainContent()}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
