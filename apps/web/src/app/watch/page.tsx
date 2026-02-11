'use client';

import { Suspense, useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { PLAYER_COLORS, PLAYER_NAMES, TILE_DATA } from '@/lib/boardPositions';

const MonopolyScene = dynamic(() => import('@/components/MonopolyScene'), {
  ssr: false,
  loading: () => (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
      background: '#050510', color: '#4fc3f7',
    }}>
      <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 2 }}>LOADING 3D BOARD</div>
      <div style={{ width: 120, height: 3, background: '#1a1a2a', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: '60%', height: '100%', background: '#4fc3f7', animation: 'pulse 1s infinite' }} />
      </div>
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
  auction: any; winner: number;
}
interface GameEvent { type: string; [key: string]: any; }

/* ------------------------------------------------------------------ */
/*  Event formatting                                                   */
/* ------------------------------------------------------------------ */
function formatEvent(e: GameEvent): { text: string; icon: string; color: string } {
  const p = e.player !== undefined ? `P${e.player}` : '';
  const pc = e.player !== undefined ? PLAYER_COLORS[e.player] : '#fff';
  switch (e.type) {
    case 'DICE_ROLLED':
      return { text: `${p} rolled ${e.d1} + ${e.d2} = ${e.sum}${e.isDoubles ? '  DOUBLES!' : ''}`, icon: 'DICE', color: e.isDoubles ? '#ffd54f' : pc };
    case 'MOVED':
      return { text: `${p} moved to ${e.tileName || `tile ${e.newPosition}`}`, icon: 'MOVE', color: pc };
    case 'PASSED_GO':
      return { text: `${p} passed GO — collected $200`, icon: '$', color: '#00E676' };
    case 'BOUGHT_PROPERTY':
      return { text: `${p} bought ${e.tileName} for $${e.price}`, icon: 'BUY', color: pc };
    case 'PAID_RENT':
      return { text: `${p} paid $${e.amount} rent to P${e.toPlayer}`, icon: 'RENT', color: '#FF9100' };
    case 'PAID_TAX':
      return { text: `${p} paid $${e.amount} tax`, icon: 'TAX', color: '#f44336' };
    case 'DREW_CARD':
      return { text: `${p}: ${e.description || e.cardType}`, icon: 'CARD', color: '#E91E63' };
    case 'SENT_TO_JAIL':
      return { text: `${p} sent to JAIL`, icon: 'JAIL', color: '#f44336' };
    case 'LEFT_JAIL':
      return { text: `${p} escaped jail`, icon: 'FREE', color: '#00E676' };
    case 'AUCTION_STARTED':
      return { text: `Auction: ${e.tileName}`, icon: 'AUC', color: '#FFEB3B' };
    case 'AUCTION_BID':
      return { text: `${p} bid $${e.amount}`, icon: 'BID', color: pc };
    case 'AUCTION_WON':
      return { text: `${p} won auction — $${e.amount}`, icon: 'WON', color: '#00E676' };
    case 'BANKRUPT':
      return { text: `${p} is BANKRUPT`, icon: 'OUT', color: '#f44336' };
    case 'GAME_OVER':
      return { text: `GAME OVER — ${e.winner}`, icon: 'WIN', color: '#ffd54f' };
    default:
      return { text: `${e.type}${p ? ` (${p})` : ''}`, icon: '...', color: '#666' };
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
  const [gmUrl, setGmUrl] = useState(process.env.NEXT_PUBLIC_GM_WS_URL || 'wss://clawboardgames-gm.onrender.com/ws');
  const [gameId, setGameId] = useState(params.get('gameId') || '');
  const [connected, setConnected] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [latestEvents, setLatestEvents] = useState<GameEvent[]>([]);
  const [notification, setNotification] = useState<{ text: string; icon: string; color: string } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);
  const notifTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const gid = params.get('gameId');
    const gm = params.get('gm');
    if (gid) setGameId(gid);
    if (gm) setGmUrl(gm);
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
        setLatestEvents(msg.events);
        // Show biggest event as notification
        const notable = msg.events.find((ev: GameEvent) =>
          ['DICE_ROLLED', 'BOUGHT_PROPERTY', 'PAID_RENT', 'SENT_TO_JAIL', 'BANKRUPT', 'PASSED_GO'].includes(ev.type)
        ) || msg.events[0];
        if (notable) {
          const fmt = formatEvent(notable);
          setNotification(fmt);
          clearTimeout(notifTimer.current);
          notifTimer.current = setTimeout(() => setNotification(null), 2200);
        }
      } else if (msg.type === 'gameEnded') {
        setSnapshot(msg.snapshot);
        const endEvt: GameEvent = { type: 'GAME_OVER', winner: msg.winnerAddress };
        setEvents(prev => [...prev, endEvt]);
        setNotification({ text: `GAME OVER — P${msg.winner} WINS!`, icon: 'WIN', color: '#ffd54f' });
      }
    };
  }, [gameId, gmUrl]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
  }, []);

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  const propertyCounts = snapshot?.properties.reduce((acc, p) => {
    if (p.ownerIndex >= 0) acc[p.ownerIndex] = (acc[p.ownerIndex] || 0) + 1;
    return acc;
  }, {} as Record<number, number>) || {};

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      {/* Full-screen 3D board */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <MonopolyScene snapshot={snapshot} latestEvents={latestEvents} />
      </div>

      {/* === TOP BAR === */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
        background: 'linear-gradient(to bottom, rgba(5,5,16,0.95) 0%, rgba(5,5,16,0) 100%)',
      }}>
        <a href="/" style={{ fontSize: 18, fontWeight: 900, color: '#fff', textDecoration: 'none', letterSpacing: '-0.02em' }}>
          CLAW<span style={{ color: '#4fc3f7' }}>BOARD</span>
        </a>
        <div style={{ flex: 1 }} />
        <input placeholder="GM WS URL" value={gmUrl} onChange={(e) => setGmUrl(e.target.value)}
          style={{ width: 250, padding: '5px 8px', borderRadius: 6, fontSize: 11, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#aaa', fontFamily: 'var(--font-mono)' }} />
        <input placeholder="Game ID" value={gameId} onChange={(e) => setGameId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && connect()}
          style={{ width: 70, padding: '5px 8px', borderRadius: 6, fontSize: 13, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', textAlign: 'center', fontFamily: 'var(--font-mono)' }} />
        <button onClick={connected ? disconnect : connect}
          style={{ padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12, color: '#fff', background: connected ? '#c62828' : '#1565c0' }}>
          {connected ? 'Disconnect' : 'Watch'}
        </button>
        {connected && (
          <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 800, background: '#2e7d32', color: '#fff', animation: 'livePulse 2s infinite' }}>
            LIVE
          </span>
        )}
      </div>

      {/* === NOTIFICATION BANNER (center-bottom) === */}
      {notification && (
        <div style={{
          position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
          zIndex: 20, pointerEvents: 'none', animation: 'fadeInUp 0.25s ease',
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 28px', borderRadius: 14,
          background: 'rgba(5,5,16,0.88)', backdropFilter: 'blur(12px)',
          border: `1.5px solid ${notification.color}40`,
          boxShadow: `0 0 30px ${notification.color}30`,
        }}>
          <span style={{
            fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 5,
            background: `${notification.color}25`, color: notification.color,
            fontFamily: 'var(--font-mono)', letterSpacing: 1,
          }}>
            {notification.icon}
          </span>
          <span style={{ fontSize: 17, fontWeight: 700, color: notification.color, letterSpacing: 0.3 }}>
            {notification.text}
          </span>
        </div>
      )}

      {/* === RIGHT SIDEBAR HUD === */}
      <div style={{
        position: 'absolute', top: 52, right: 12, bottom: 12, width: 300,
        display: 'flex', flexDirection: 'column', gap: 6, zIndex: 10, pointerEvents: 'none',
      }}>
        {/* Game status bar */}
        {snapshot && (
          <div className="glass" style={{ borderRadius: 10, padding: '8px 14px', pointerEvents: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8b949e' }}>
              <span>Round {snapshot.round}</span>
              <span>Turn {snapshot.turn}</span>
              <span>{snapshot.aliveCount}/4 alive</span>
            </div>
            {snapshot.lastDice && (
              <div style={{
                textAlign: 'center', fontSize: 26, fontWeight: 900, letterSpacing: 3, padding: '4px 0',
                color: snapshot.lastDice.isDoubles ? '#ffd54f' : '#fff',
                textShadow: snapshot.lastDice.isDoubles ? '0 0 16px #ffd54f' : 'none',
              }}>
                {snapshot.lastDice.d1} + {snapshot.lastDice.d2} = {snapshot.lastDice.sum}
                {snapshot.lastDice.isDoubles && <span style={{ fontSize: 12, marginLeft: 8 }}>DOUBLES</span>}
              </div>
            )}
            {snapshot.winner >= 0 && (
              <div style={{
                padding: '10px', borderRadius: 8, textAlign: 'center', marginTop: 4,
                background: 'linear-gradient(135deg, #1b5e20, #2e7d32)',
                fontSize: 16, fontWeight: 900, letterSpacing: 1,
              }}>
                WINNER: P{snapshot.winner} ({PLAYER_NAMES[snapshot.winner]})
              </div>
            )}
          </div>
        )}

        {/* Player cards */}
        {snapshot?.players.map((p) => (
          <div key={p.index} className={p.index === snapshot.currentPlayerIndex ? 'glass-bright' : 'glass'} style={{
            borderRadius: 10, padding: '8px 12px', pointerEvents: 'auto',
            opacity: p.alive ? 1 : 0.35,
            borderLeft: `3px solid ${PLAYER_COLORS[p.index]}`,
            transition: 'all 0.3s ease',
            boxShadow: p.index === snapshot.currentPlayerIndex ? `0 0 12px ${PLAYER_COLORS[p.index]}30` : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%', background: PLAYER_COLORS[p.index],
                boxShadow: `0 0 8px ${PLAYER_COLORS[p.index]}`,
              }} />
              <span style={{ fontWeight: 800, fontSize: 13, color: PLAYER_COLORS[p.index] }}>P{p.index}</span>
              <span style={{ fontSize: 10, color: '#555' }}>{PLAYER_NAMES[p.index]}</span>
              {p.index === snapshot.currentPlayerIndex && p.alive && (
                <span style={{
                  marginLeft: 'auto', fontSize: 9, padding: '1px 6px', borderRadius: 3,
                  background: PLAYER_COLORS[p.index], color: '#000', fontWeight: 800, letterSpacing: 0.5,
                }}>TURN</span>
              )}
              {!p.alive && (
                <span style={{
                  marginLeft: 'auto', fontSize: 9, padding: '1px 6px', borderRadius: 3,
                  background: '#c62828', color: '#fff', fontWeight: 800,
                }}>OUT</span>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ fontWeight: 700, color: '#fff', fontFamily: 'var(--font-mono)' }}>${p.cash.toLocaleString()}</span>
              <span style={{ color: '#888' }}>{p.tileName || TILE_DATA[p.position]?.name}</span>
            </div>
            <div style={{ fontSize: 9, color: '#555', marginTop: 1, display: 'flex', gap: 8 }}>
              <span>{propertyCounts[p.index] || 0} props</span>
              {p.inJail && <span style={{ color: '#ff8a65' }}>JAIL ({p.jailTurns}/3)</span>}
            </div>
          </div>
        ))}

        {/* Event log */}
        <div className="glass" style={{
          borderRadius: 10, padding: '8px 12px', flex: 1, overflow: 'hidden',
          display: 'flex', flexDirection: 'column', pointerEvents: 'auto', minHeight: 100,
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#484f58', marginBottom: 4, letterSpacing: 1.5 }}>EVENT LOG</div>
          <div style={{ flex: 1, overflowY: 'auto', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
            {events.length === 0 && (
              <div style={{ color: '#333', padding: 12, textAlign: 'center' }}>
                {connected ? 'Waiting for events...' : 'Connect to spectate'}
              </div>
            )}
            {events.slice(-40).map((e, i) => {
              const fmt = formatEvent(e);
              return (
                <div key={i} style={{ padding: '2px 0', color: '#777', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                  <span style={{ color: fmt.color, fontWeight: 600 }}>[{fmt.icon}]</span>{' '}
                  <span>{fmt.text}</span>
                </div>
              );
            })}
            <div ref={eventsEndRef} />
          </div>
        </div>
      </div>

      {/* Empty state */}
      {!snapshot && !connected && (
        <div style={{
          position: 'absolute', bottom: 100, left: 0, right: 320, zIndex: 10,
          textAlign: 'center', pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 22, color: '#4fc3f7', fontWeight: 800, marginBottom: 8, textShadow: '0 0 20px rgba(79,195,247,0.3)' }}>
            Enter a Game ID and click Watch
          </div>
          <div style={{ fontSize: 14, color: '#555' }}>
            The 3D board will come alive with a live game
          </div>
        </div>
      )}
    </div>
  );
}
