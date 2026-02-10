"use client";

import { useEffect, useState, useRef } from "react";

interface PlayerInfo {
  index: number;
  address: string;
  cash: number;
  position: number;
  tileName: string;
  inJail: boolean;
  jailTurns: number;
  alive: boolean;
}

interface PropertyInfo {
  index: number;
  tileName: string;
  ownerIndex: number;
  mortgaged: boolean;
}

interface Snapshot {
  status: string;
  phase: string;
  turn: number;
  round: number;
  currentPlayerIndex: number;
  aliveCount: number;
  players: PlayerInfo[];
  properties: PropertyInfo[];
  lastDice: { d1: number; d2: number; sum: number; isDoubles: boolean } | null;
  auction: { active: boolean; propertyIndex: number; highBidder: number; highBid: number } | null;
  winner: number;
}

interface GameEvent {
  type: string;
  [key: string]: any;
}

const PLAYER_COLORS = ["#4fc3f7", "#81c784", "#ffb74d", "#e57373"];

export default function Home() {
  const [gameId, setGameId] = useState("");
  const [connected, setConnected] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [gmUrl, setGmUrl] = useState("ws://localhost:3001/ws");
  const wsRef = useRef<WebSocket | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  const connect = () => {
    if (!gameId) return;
    const ws = new WebSocket(`${gmUrl}?gameId=${gameId}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "snapshot") {
        setSnapshot(msg.snapshot);
      } else if (msg.type === "events") {
        setEvents(prev => [...prev.slice(-200), ...msg.events]);
      } else if (msg.type === "gameEnded") {
        setSnapshot(msg.snapshot);
        setEvents(prev => [...prev, { type: "GAME_OVER", winner: msg.winnerAddress }]);
      }
    };
  };

  const disconnect = () => {
    wsRef.current?.close();
    setConnected(false);
    setSnapshot(null);
    setEvents([]);
  };

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: "#fff" }}>
          ClawBoardGames
        </h1>
        <span style={{
          fontSize: 12, padding: "2px 8px", borderRadius: 4,
          background: connected ? "#2e7d32" : "#555", color: "#fff"
        }}>
          {connected ? "LIVE" : "OFFLINE"}
        </span>
      </div>

      {/* Connection Bar */}
      <div style={{
        display: "flex", gap: 8, marginBottom: 24, padding: 16,
        background: "#1a1a1a", borderRadius: 8, border: "1px solid #333",
      }}>
        <input
          placeholder="GM WebSocket URL"
          value={gmUrl}
          onChange={(e) => setGmUrl(e.target.value)}
          style={{
            flex: 1, padding: "8px 12px", borderRadius: 6,
            background: "#0a0a0a", border: "1px solid #444", color: "#fff", fontSize: 14,
          }}
        />
        <input
          placeholder="Game ID"
          value={gameId}
          onChange={(e) => setGameId(e.target.value)}
          style={{
            width: 100, padding: "8px 12px", borderRadius: 6,
            background: "#0a0a0a", border: "1px solid #444", color: "#fff", fontSize: 14,
          }}
        />
        <button
          onClick={connected ? disconnect : connect}
          style={{
            padding: "8px 20px", borderRadius: 6, border: "none", cursor: "pointer",
            background: connected ? "#c62828" : "#1565c0", color: "#fff", fontWeight: 600,
          }}
        >
          {connected ? "Disconnect" : "Watch"}
        </button>
      </div>

      {!snapshot && (
        <div style={{ textAlign: "center", padding: 80, color: "#666" }}>
          Enter a Game ID and click Watch to spectate a live game.
        </div>
      )}

      {snapshot && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Game Info */}
          <div style={{ background: "#1a1a1a", borderRadius: 8, padding: 16, border: "1px solid #333" }}>
            <h3 style={{ margin: "0 0 12px", color: "#fff" }}>Game Status</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 14 }}>
              <div>Status: <b>{snapshot.status}</b></div>
              <div>Phase: <b>{snapshot.phase}</b></div>
              <div>Turn: <b>{snapshot.turn}</b></div>
              <div>Round: <b>{snapshot.round}</b></div>
              <div>Current Player: <b style={{ color: PLAYER_COLORS[snapshot.currentPlayerIndex] }}>
                P{snapshot.currentPlayerIndex}
              </b></div>
              <div>Alive: <b>{snapshot.aliveCount}/4</b></div>
            </div>
            {snapshot.lastDice && (
              <div style={{ marginTop: 12, fontSize: 20, textAlign: "center" }}>
                Dice: {snapshot.lastDice.d1} + {snapshot.lastDice.d2} = {snapshot.lastDice.sum}
                {snapshot.lastDice.isDoubles && <span style={{ color: "#ffd54f" }}> DOUBLES!</span>}
              </div>
            )}
            {snapshot.winner >= 0 && (
              <div style={{
                marginTop: 12, padding: 12, borderRadius: 8, textAlign: "center",
                background: "#1b5e20", fontSize: 18, fontWeight: 700,
              }}>
                WINNER: Player {snapshot.winner} ({snapshot.players[snapshot.winner]?.address.slice(0, 10)}...)
              </div>
            )}
          </div>

          {/* Players */}
          <div style={{ background: "#1a1a1a", borderRadius: 8, padding: 16, border: "1px solid #333" }}>
            <h3 style={{ margin: "0 0 12px", color: "#fff" }}>Players</h3>
            {snapshot.players.map((p) => (
              <div key={p.index} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 0", borderBottom: "1px solid #222",
                opacity: p.alive ? 1 : 0.4,
              }}>
                <div>
                  <span style={{
                    display: "inline-block", width: 12, height: 12, borderRadius: "50%",
                    background: PLAYER_COLORS[p.index], marginRight: 8,
                  }} />
                  <span style={{ fontWeight: p.index === snapshot.currentPlayerIndex ? 700 : 400 }}>
                    P{p.index}
                  </span>
                  <span style={{ fontSize: 12, color: "#888", marginLeft: 8 }}>
                    {p.address.slice(0, 8)}...
                  </span>
                </div>
                <div style={{ textAlign: "right", fontSize: 13 }}>
                  <div>${p.cash} | {p.tileName}</div>
                  <div style={{ fontSize: 11, color: "#888" }}>
                    {!p.alive && "BANKRUPT"}
                    {p.inJail && `JAIL (${p.jailTurns}/3)`}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Event Log */}
          <div style={{
            gridColumn: "1 / -1", background: "#1a1a1a", borderRadius: 8,
            padding: 16, border: "1px solid #333", maxHeight: 300, overflowY: "auto",
          }}>
            <h3 style={{ margin: "0 0 12px", color: "#fff" }}>Event Log</h3>
            {events.length === 0 && <div style={{ color: "#666" }}>Waiting for events...</div>}
            {events.map((e, i) => (
              <div key={i} style={{ fontSize: 12, padding: "2px 0", color: "#aaa", fontFamily: "monospace" }}>
                <span style={{ color: "#666" }}>[{i}]</span> {e.type}
                {e.player !== undefined && <span style={{ color: PLAYER_COLORS[e.player] }}> P{e.player}</span>}
                {e.amount !== undefined && <span> ${e.amount}</span>}
                {e.description && <span style={{ color: "#888" }}> - {e.description}</span>}
              </div>
            ))}
            <div ref={eventsEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}
