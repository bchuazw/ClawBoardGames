'use client';

import { Suspense, useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { PLAYER_COLORS, PLAYER_NAMES, TILE_DATA } from '@/lib/boardPositions';

// Dynamic import — Three.js must not run on server
const MonopolyScene = dynamic(() => import('@/components/MonopolyScene'), {
  ssr: false,
  loading: () => (
    <div style={{
      width: '100%', height: '100%', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: '#050510', color: '#4fc3f7', fontSize: 16,
      fontFamily: 'var(--font-mono)',
    }}>
      Initializing 3D Board...
    </div>
  ),
});

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface PlayerInfo {
  index: number; address: string; cash: number; position: number;
  tileName: string; inJail: boolean; jailTurns: number; alive: boolean;
}
interface PropertyInfo {
  index: number; tileName: string; ownerIndex: number; mortgaged: boolean;
}
interface Snapshot {
  status: string; phase: string; turn: number; round: number;
  currentPlayerIndex: number; aliveCount: number;
  players: PlayerInfo[]; properties: PropertyInfo[];
  lastDice: { d1: number; d2: number; sum: number; isDoubles: boolean } | null;
  auction: { active: boolean; propertyIndex: number; highBidder: number; highBid: number } | null;
  winner: number;
}
interface GameEvent { type: string; [key: string]: any; }

/* ------------------------------------------------------------------ */
/*  Helper: format event for display                                   */
/* ------------------------------------------------------------------ */
function formatEvent(e: GameEvent): string {
  const p = e.player !== undefined ? `P${e.player}` : '';
  switch (e.type) {
    case 'DICE_ROLLED': return `${p} rolled ${e.d1}+${e.d2}=${e.sum}${e.isDoubles ? ' DOUBLES' : ''}`;
    case 'MOVED': return `${p} moved to ${e.tileName || `tile ${e.newPosition}`}`;
    case 'PASSED_GO': return `${p} passed GO, collected $200`;
    case 'BOUGHT_PROPERTY': return `${p} bought ${e.tileName} for $${e.price}`;
    case 'PAID_RENT': return `${p} paid $${e.amount} rent to P${e.toPlayer}`;
    case 'PAID_TAX': return `${p} paid $${e.amount} tax`;
    case 'DREW_CARD': return `${p} drew: ${e.description || e.cardType}`;
    case 'SENT_TO_JAIL': return `${p} sent to JAIL`;
    case 'LEFT_JAIL': return `${p} left jail`;
    case 'AUCTION_STARTED': return `Auction started for ${e.tileName}`;
    case 'AUCTION_BID': return `${p} bid $${e.amount}`;
    case 'AUCTION_WON': return `${p} won auction for $${e.amount}`;
    case 'BANKRUPT': return `${p} went BANKRUPT`;
    case 'GAME_OVER': return `GAME OVER - Winner: ${e.winner}`;
    default: return `${e.type}${p ? ` (${p})` : ''}${e.description ? ` - ${e.description}` : ''}`;
  }
}

/* ------------------------------------------------------------------ */
/*  Watch Page                                                         */
/* ------------------------------------------------------------------ */
export default function WatchPageWrapper() {
  return (
    <Suspense fallback={
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050510', color: '#4fc3f7' }}>
        Loading...
      </div>
    }>
      <WatchPage />
    </Suspense>
  );
}

function WatchPage() {
  const params = useSearchParams();

  const [gmUrl, setGmUrl] = useState(
    process.env.NEXT_PUBLIC_GM_WS_URL || 'wss://clawboardgames-gm.onrender.com/ws'
  );
  const [gameId, setGameId] = useState(params.get('gameId') || '');
  const [connected, setConnected] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  // Auto-connect if gameId in URL
  useEffect(() => {
    const gid = params.get('gameId');
    const gm = params.get('gm');
    if (gid) { setGameId(gid); }
    if (gm) { setGmUrl(gm); }
  }, [params]);

  const connect = useCallback(() => {
    if (!gameId) return;
    disconnect();
    const ws = new WebSocket(`${gmUrl}?gameId=${gameId}`);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'snapshot') {
        setSnapshot(msg.snapshot);
      } else if (msg.type === 'events') {
        setEvents(prev => [...prev.slice(-300), ...msg.events]);
      } else if (msg.type === 'gameEnded') {
        setSnapshot(msg.snapshot);
        setEvents(prev => [...prev, { type: 'GAME_OVER', winner: msg.winnerAddress }]);
      }
    };
  }, [gameId, gmUrl]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
  }, []);

  // Auto-scroll events
  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  // Count properties per player
  const propertyCounts = snapshot?.properties.reduce((acc, p) => {
    if (p.ownerIndex >= 0) acc[p.ownerIndex] = (acc[p.ownerIndex] || 0) + 1;
    return acc;
  }, {} as Record<number, number>) || {};

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      {/* Full-screen 3D board */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <MonopolyScene snapshot={snapshot} />
      </div>

      {/* Top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
        background: 'linear-gradient(to bottom, rgba(5,5,16,0.95) 0%, rgba(5,5,16,0) 100%)',
      }}>
        <a href="/" style={{
          fontSize: 18, fontWeight: 800, color: '#fff', textDecoration: 'none',
          letterSpacing: '-0.02em',
        }}>
          CLAW<span style={{ color: '#4fc3f7' }}>BOARD</span>
        </a>

        <div style={{ flex: 1 }} />

        <input
          placeholder="GM WebSocket URL"
          value={gmUrl}
          onChange={(e) => setGmUrl(e.target.value)}
          style={{
            width: 280, padding: '6px 10px', borderRadius: 6, fontSize: 12,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#ccc', fontFamily: 'var(--font-mono)',
          }}
        />
        <input
          placeholder="Game ID"
          value={gameId}
          onChange={(e) => setGameId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && connect()}
          style={{
            width: 80, padding: '6px 10px', borderRadius: 6, fontSize: 13,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#fff', textAlign: 'center', fontFamily: 'var(--font-mono)',
          }}
        />
        <button
          onClick={connected ? disconnect : connect}
          style={{
            padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
            fontWeight: 600, fontSize: 13, color: '#fff',
            background: connected ? '#c62828' : '#1565c0',
          }}
        >
          {connected ? 'Disconnect' : 'Watch'}
        </button>
        {connected && (
          <span style={{
            padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
            background: '#2e7d32', color: '#fff', animation: 'livePulse 2s infinite',
          }}>
            LIVE
          </span>
        )}
      </div>

      {/* Right sidebar HUD */}
      <div style={{
        position: 'absolute', top: 56, right: 12, bottom: 12, width: 300,
        display: 'flex', flexDirection: 'column', gap: 8, zIndex: 10,
        pointerEvents: 'none',
      }}>
        {/* Game status */}
        {snapshot && (
          <div className="glass" style={{
            borderRadius: 10, padding: '10px 14px', pointerEvents: 'auto',
            animation: 'fadeIn 0.3s ease',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11, color: '#8b949e' }}>
              <span>Round {snapshot.round} / Turn {snapshot.turn}</span>
              <span>{snapshot.phase}</span>
            </div>
            {/* Dice */}
            {snapshot.lastDice && (
              <div style={{
                textAlign: 'center', fontSize: 22, fontWeight: 800, letterSpacing: 2,
                color: snapshot.lastDice.isDoubles ? '#ffd54f' : '#fff',
                padding: '6px 0',
              }}>
                {snapshot.lastDice.d1} + {snapshot.lastDice.d2} = {snapshot.lastDice.sum}
                {snapshot.lastDice.isDoubles && (
                  <span style={{ fontSize: 11, marginLeft: 8, color: '#ffd54f' }}>DOUBLES</span>
                )}
              </div>
            )}
            {/* Winner banner */}
            {snapshot.winner >= 0 && (
              <div style={{
                padding: '8px 12px', borderRadius: 8, textAlign: 'center', marginTop: 6,
                background: 'linear-gradient(135deg, #1b5e20, #2e7d32)',
                fontSize: 15, fontWeight: 800,
              }}>
                WINNER: P{snapshot.winner} ({PLAYER_NAMES[snapshot.winner]})
              </div>
            )}
          </div>
        )}

        {/* Player cards */}
        {snapshot?.players.map((p) => (
          <div key={p.index} className={p.index === snapshot.currentPlayerIndex ? 'glass-bright' : 'glass'} style={{
            borderRadius: 10, padding: '10px 14px', pointerEvents: 'auto',
            opacity: p.alive ? 1 : 0.4,
            borderLeft: `3px solid ${PLAYER_COLORS[p.index]}`,
            animation: `slideInRight 0.3s ease ${p.index * 0.1}s both`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: PLAYER_COLORS[p.index],
                boxShadow: `0 0 8px ${PLAYER_COLORS[p.index]}`,
              }} />
              <span style={{ fontWeight: 700, fontSize: 14, color: PLAYER_COLORS[p.index] }}>
                P{p.index}
              </span>
              <span style={{ fontSize: 11, color: '#666' }}>
                {PLAYER_NAMES[p.index]}
              </span>
              {p.index === snapshot.currentPlayerIndex && p.alive && (
                <span style={{
                  marginLeft: 'auto', fontSize: 10, padding: '1px 6px',
                  borderRadius: 3, background: PLAYER_COLORS[p.index], color: '#000',
                  fontWeight: 700,
                }}>
                  TURN
                </span>
              )}
              {!p.alive && (
                <span style={{
                  marginLeft: 'auto', fontSize: 10, padding: '1px 6px',
                  borderRadius: 3, background: '#c62828', color: '#fff', fontWeight: 700,
                }}>
                  OUT
                </span>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#aaa' }}>
              <span style={{ fontWeight: 600, color: '#fff', fontFamily: 'var(--font-mono)' }}>
                ${p.cash.toLocaleString()}
              </span>
              <span>{p.tileName || TILE_DATA[p.position]?.name || `Tile ${p.position}`}</span>
            </div>
            <div style={{ fontSize: 10, color: '#666', marginTop: 2, display: 'flex', gap: 8 }}>
              <span>{propertyCounts[p.index] || 0} properties</span>
              {p.inJail && <span style={{ color: '#ff8a65' }}>JAIL ({p.jailTurns}/3)</span>}
            </div>
          </div>
        ))}

        {/* Event log */}
        <div className="glass" style={{
          borderRadius: 10, padding: '10px 14px', flex: 1, overflow: 'hidden',
          display: 'flex', flexDirection: 'column', pointerEvents: 'auto',
          minHeight: 120,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8b949e', marginBottom: 6, letterSpacing: 1 }}>
            EVENT LOG
          </div>
          <div style={{ flex: 1, overflowY: 'auto', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
            {events.length === 0 && (
              <div style={{ color: '#444', padding: '12px 0', textAlign: 'center' }}>
                {connected ? 'Waiting for events...' : 'Connect to a game to start'}
              </div>
            )}
            {events.slice(-50).map((e, i) => (
              <div key={i} style={{
                padding: '3px 0', color: '#999', borderBottom: '1px solid rgba(255,255,255,0.03)',
              }}>
                {e.player !== undefined && (
                  <span style={{ color: PLAYER_COLORS[e.player], fontWeight: 600 }}>
                    P{e.player}{' '}
                  </span>
                )}
                <span>{formatEvent(e)}</span>
              </div>
            ))}
            <div ref={eventsEndRef} />
          </div>
        </div>
      </div>

      {/* Empty state overlay */}
      {!snapshot && !connected && (
        <div style={{
          position: 'absolute', bottom: 80, left: 0, right: 300, zIndex: 10,
          textAlign: 'center', pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 18, color: '#4fc3f7', fontWeight: 700, marginBottom: 8 }}>
            Enter a Game ID and click Watch
          </div>
          <div style={{ fontSize: 13, color: '#666' }}>
            The 3D board will come alive when connected to a live game
          </div>
        </div>
      )}
    </div>
  );
}
