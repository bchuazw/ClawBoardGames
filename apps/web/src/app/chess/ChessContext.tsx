"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import { ClawmateClient } from "clawmate-sdk";
import { getApiUrl } from "@/lib/chess-api";
import { getBrowserSigner } from "@/lib/chess-signer";

const CURRENT_GAME_KEY = "clawmate_current_game";
const RULES_ACCEPTED_KEY = "clawmate_rules_accepted";

function loadRulesAccepted() {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(RULES_ACCEPTED_KEY) === "1";
  } catch {
    return false;
  }
}

function saveRulesAccepted() {
  try {
    localStorage.setItem(RULES_ACCEPTED_KEY, "1");
  } catch (_) {}
}

type ChessContextValue = {
  wallet: string | null;
  setWallet: (w: string | null) => void;
  /** ClawMate SDK client (platform logic). Null when wallet not connected. */
  client: ClawmateClient | null;
  /** Socket from client; same as client?.socket. Kept for components that expect socket. */
  socket: Socket | null;
  showRulesModal: boolean;
  setShowRulesModal: (v: boolean) => void;
  rulesAccepted: boolean;
  setRulesAccepted: (v: boolean) => void;
  rejoinBanner: { lobbyId: string; lobby: unknown } | null;
  toast: { lobbyId: string; betAmount?: string; player2Wallet?: string } | null;
  lastOpenedLobby: { lobbyId: string; lobby: unknown } | null;
  openGame: (id: string, lobbyData?: unknown, opts?: { testMode?: boolean }) => void;
  backToLobbies: () => void;
  openSpectate: (id: string) => void;
  onGameEnd: () => void;
  clearCurrentGame: () => void;
  dismissRejoin: () => void;
  rejoinGame: () => void;
  openLobbyFromToast: () => void;
  setToast: (t: typeof initialContext.toast) => void;
  handleLobbyTabChange: (tab: string) => void;
  acceptRules: () => void;
};

const initialContext: ChessContextValue = {
  wallet: null,
  setWallet: () => {},
  client: null,
  socket: null,
  showRulesModal: false,
  setShowRulesModal: () => {},
  rulesAccepted: false,
  setRulesAccepted: () => {},
  rejoinBanner: null,
  toast: null,
  setToast: () => {},
  lastOpenedLobby: null,
  openGame: () => {},
  backToLobbies: () => {},
  openSpectate: () => {},
  onGameEnd: () => {},
  clearCurrentGame: () => {},
  dismissRejoin: () => {},
  rejoinGame: () => {},
  openLobbyFromToast: () => {},
  handleLobbyTabChange: () => {},
  acceptRules: () => {},
};

const ChessContext = createContext<ChessContextValue>(initialContext);

export function useChess() {
  const ctx = useContext(ChessContext);
  if (!ctx) throw new Error("useChess must be used within ChessProvider");
  return ctx;
}

export function ChessProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [wallet, setWallet] = useState<string | null>(null);
  const [client, setClient] = useState<ClawmateClient | null>(null);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [rulesAccepted, setRulesAccepted] = useState(loadRulesAccepted);
  const [rejoinBanner, setRejoinBanner] = useState<{ lobbyId: string; lobby: unknown } | null>(null);
  const [toast, setToast] = useState<{ lobbyId: string; betAmount?: string; player2Wallet?: string } | null>(null);
  const [lastOpenedLobby, setLastOpenedLobby] = useState<{ lobbyId: string; lobby: unknown } | null>(null);
  const [rawSocket, setRawSocket] = useState<Socket | null>(null);
  const isInGame = pathname?.startsWith("/chess/game/") ?? false;
  const socket = client?.socket ?? rawSocket;

  // Raw socket for spectate / read-only when wallet not connected
  useEffect(() => {
    if (client) return;
    const baseUrl = getApiUrl();
    if (!baseUrl) return;
    const s = io(baseUrl, { path: "/socket.io", transports: ["websocket", "polling"] });
    setRawSocket(s);
    return () => {
      s.close();
      setRawSocket(null);
    };
  }, [client]);

  // Connect ClawMate SDK when wallet is set (platform logic)
  useEffect(() => {
    if (!wallet) {
      setClient((prev) => {
        if (prev) prev.disconnect();
        return null;
      });
      return;
    }
    let cancelled = false;
    const baseUrl = getApiUrl();
    if (!baseUrl) return;
    setClient((prev) => {
      if (prev) prev.disconnect();
      return null;
    });
    getBrowserSigner()
      .then((signer) => {
        if (!signer || cancelled) return;
        const c = new ClawmateClient({ baseUrl, signer });
        c.connect()
          .then(() => {
            if (!cancelled) setClient(c);
          })
          .catch(() => {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  // Forward lobby_joined_yours from SDK socket to toast
  useEffect(() => {
    if (!client) return;
    const onLobbyJoinedYours = (...args: unknown[]) => {
      const data = args[0] as { lobbyId: string; betAmount?: string; player2Wallet?: string };
      setToast({ lobbyId: data.lobbyId, betAmount: data.betAmount, player2Wallet: data.player2Wallet });
    };
    client.on("lobby_joined_yours", onLobbyJoinedYours);
    return () => {
      client.off("lobby_joined_yours", onLobbyJoinedYours);
    };
  }, [client]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  // Rejoin banner: check stored game when wallet connected and not in game
  useEffect(() => {
    if (!wallet || !client || isInGame) return;
    const raw = typeof window !== "undefined" ? localStorage.getItem(CURRENT_GAME_KEY) : null;
    if (!raw) return;
    let stored: { lobbyId?: string };
    try {
      stored = JSON.parse(raw);
    } catch {
      return;
    }
    if (!stored?.lobbyId) return;
    const pw = wallet.toLowerCase();
    client
      .getLobby(stored.lobbyId)
      .then((data: unknown) => {
        const d = data as { status?: string; player1Wallet?: string; player2Wallet?: string; lobbyId?: string };
        if (d?.status === "playing" && (d.player1Wallet?.toLowerCase() === pw || d.player2Wallet?.toLowerCase() === pw)) {
          setRejoinBanner({ lobbyId: d.lobbyId ?? stored.lobbyId!, lobby: d });
        } else {
          setRejoinBanner(null);
          try {
            localStorage.removeItem(CURRENT_GAME_KEY);
          } catch (_) {}
        }
      })
      .catch(() => setRejoinBanner(null));
  }, [wallet, client, isInGame]);

  const openGame = (id: string, lobbyData?: unknown, opts?: { testMode?: boolean }) => {
    const lobby = lobbyData as { status?: string } | undefined;
    if (lobby?.status === "playing" && !opts?.testMode) {
      try {
        localStorage.setItem(CURRENT_GAME_KEY, JSON.stringify({ lobbyId: id, ...lobby }));
      } catch (_) {}
    }
    router.push(`/chess/game/${id}`);
  };

  const backToLobbies = () => router.push("/chess/lobbies");
  const openSpectate = (id: string) => router.push(`/chess/watch/${id}`);
  const clearCurrentGame = () => {
    try {
      localStorage.removeItem(CURRENT_GAME_KEY);
    } catch (_) {}
    setRejoinBanner(null);
  };
  const onGameEnd = () => {
    clearCurrentGame();
    router.push("/chess/lobbies");
  };
  const dismissRejoin = () => clearCurrentGame();
  const rejoinGame = () => {
    if (rejoinBanner) {
      openGame(rejoinBanner.lobbyId, rejoinBanner.lobby, {});
      setRejoinBanner(null);
    }
  };
  const openLobbyFromToast = () => {
    if (!toast || !client) return;
    client
      .getLobby(toast.lobbyId)
      .then((data: unknown) => {
        openGame(toast!.lobbyId, data, {});
        setToast(null);
      })
      .catch(() => setToast(null));
  };
  const handleLobbyTabChange = (tab: string) => {
    if (tab === "live") router.push("/chess/livegames");
    else if (tab === "history") router.push("/chess/history");
    else if (tab === "leaderboard") router.push("/chess/leaderboard");
    else router.push("/chess/lobbies");
  };
  const acceptRules = () => {
    saveRulesAccepted();
    setRulesAccepted(true);
  };

  const value: ChessContextValue = {
    wallet,
    setWallet,
    client,
    socket,
    showRulesModal,
    setShowRulesModal,
    rulesAccepted,
    setRulesAccepted,
    rejoinBanner,
    toast,
    setToast,
    lastOpenedLobby,
    openGame,
    backToLobbies,
    openSpectate,
    onGameEnd,
    clearCurrentGame,
    dismissRejoin,
    rejoinGame,
    openLobbyFromToast,
    handleLobbyTabChange,
    acceptRules,
  };

  return <ChessContext.Provider value={value}>{children}</ChessContext.Provider>;
}
