'use client';

import { Suspense, useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { PLAYER_COLORS, PLAYER_NAMES, PLAYER_EMOJIS, TILE_DATA } from '@/lib/boardPositions';
import { sfx } from '@/lib/soundFx';

const MonopolyScene = dynamic(() => import('@/components/MonopolyScene'), {
  ssr: false,
  loading: () => (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: '#0C1B3A', color: '#D4A84B' }}>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2 }}>LOADING 3D BOARD</div>
      <div style={{ width: 120, height: 3, background: '#1a2a4a', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: '60%', height: '100%', background: '#D4A84B', animation: 'pulse 1s infinite' }} />
      </div>
    </div>
  ),
});

/* ---------------------------------------------------------------- */
/*  Types                                                            */
/* ---------------------------------------------------------------- */
interface PlayerInfo { index: number; address: string; cash: number; position: number; tileName: string; inJail: boolean; jailTurns: number; alive: boolean; }
interface PropertyInfo { index: number; tileName: string; ownerIndex: number; mortgaged: boolean; }
interface Snapshot {
  status: string; phase: string; turn: number; round: number;
  currentPlayerIndex: number; aliveCount: number;
  players: PlayerInfo[]; properties: PropertyInfo[];
  lastDice: { d1: number; d2: number; sum: number; isDoubles: boolean } | null;
  auction: any; winner: number;
}
interface GameEvent { type: string; [key: string]: any; }

/* ---------------------------------------------------------------- */
/*  Mood emoji system                                                */
/* ---------------------------------------------------------------- */
const DEFAULT_MOOD = '\u{1F610}'; // 😐
const MOOD_MAP: Record<string, { self?: string; other?: string; payer?: string; receiver?: string }> = {
  DICE_ROLLED:     { self: '\u{1F3B2}' },   // 🎲
  BOUGHT_PROPERTY: { self: '\u{1F929}', other: '\u{1F612}' }, // 🤩 😒
  PAID_RENT:       { payer: '\u{1F624}', receiver: '\u{1F911}' }, // 😤 🤑
  PAID_TAX:        { self: '\u{1F62E}' },    // 😮
  PASSED_GO:       { self: '\u{1F60E}' },    // 😎
  SENT_TO_JAIL:    { self: '\u{1F631}', other: '\u{1F60F}' }, // 😱 😏
  LEFT_JAIL:       { self: '\u{1F389}' },    // 🎉
  BANKRUPT:        { self: '\u{1F480}', other: '\u{1F62E}' }, // 💀 😮
  DREW_CARD:       { self: '\u{1F914}' },    // 🤔
};

/* ---------------------------------------------------------------- */
/*  Human-readable event text                                        */
/* ---------------------------------------------------------------- */
function humanEvent(e: GameEvent): { text: string; color: string } {
  const n = e.player !== undefined ? PLAYER_NAMES[e.player] : '';
  const emoji = e.player !== undefined ? PLAYER_EMOJIS[e.player] : '';
  const pc = e.player !== undefined ? PLAYER_COLORS[e.player] : '#D4A84B';

  switch (e.type) {
    case 'DICE_ROLLED': {
      const dbl = e.isDoubles ? '  DOUBLES!' : '';
      return { text: `\u{1F3B2}  ${emoji} ${n} rolled ${e.sum}!  (${e.d1} + ${e.d2})${dbl}`, color: e.isDoubles ? '#FFD54F' : pc };
    }
    case 'MOVED':
      return { text: `${emoji} ${n} landed on ${e.tileName || TILE_DATA[e.newPosition]?.name || `tile ${e.newPosition}`}`, color: pc };
    case 'PASSED_GO':
      return { text: `\u{2728} ${emoji} ${n} passed GO and collected $200!`, color: '#66BB6A' };
    case 'BOUGHT_PROPERTY':
      return { text: `\u{1F3E0} ${emoji} ${n} bought ${e.tileName} for $${e.price}!`, color: pc };
    case 'PAID_RENT':
      return { text: `\u{1F4B0} ${emoji} ${n} paid $${e.amount} rent to ${PLAYER_EMOJIS[e.toPlayer]} ${PLAYER_NAMES[e.toPlayer]}`, color: '#FF9100' };
    case 'PAID_TAX':
      return { text: `\u{1F4B8} ${emoji} ${n} paid $${e.amount} in taxes`, color: '#EF5350' };
    case 'DREW_CARD':
      return { text: `\u{1F0CF} ${emoji} ${n} drew a card: ${e.description || e.cardType}`, color: '#AB47BC' };
    case 'SENT_TO_JAIL':
      return { text: `\u{1F6A8} ${emoji} ${n} was sent to JAIL!`, color: '#EF5350' };
    case 'LEFT_JAIL':
      return { text: `\u{1F513} ${emoji} ${n} got out of jail!`, color: '#66BB6A' };
    case 'BANKRUPT':
      return { text: `\u{1F4A5} ${emoji} ${n} went BANKRUPT!`, color: '#EF5350' };
    case 'GAME_OVER':
      return { text: `\u{1F3C6} GAME OVER — ${e.winner} wins!`, color: '#FFD54F' };
    default:
      return { text: `${e.type}${n ? ` (${n})` : ''}`, color: '#888' };
  }
}

/* ================================================================ */
/*  MAIN PAGE                                                        */
/* ================================================================ */
export default function WatchPageWrapper() {
  return (
    <Suspense fallback={<div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0C1B3A', color: '#D4A84B' }}>Loading...</div>}>
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
  const [notification, setNotification] = useState<{ text: string; color: string } | null>(null);
  const [moods, setMoods] = useState<Record<number, string>>({ 0: DEFAULT_MOOD, 1: DEFAULT_MOOD, 2: DEFAULT_MOOD, 3: DEFAULT_MOOD });
  const [activeCard, setActiveCard] = useState<{ text: string; type: string } | null>(null);
  const [muted, setMuted] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);
  const notifTimer = useRef<ReturnType<typeof setTimeout>>();
  const moodTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const gid = params.get('gameId'), gm = params.get('gm');
    if (gid) setGameId(gid);
    if (gm) setGmUrl(gm);
  }, [params]);

  useEffect(() => { sfx.muted = muted; }, [muted]);

  // Update moods from events
  function updateMoods(evts: GameEvent[]) {
    const newMoods = { ...moods };
    for (const ev of evts) {
      const mm = MOOD_MAP[ev.type];
      if (!mm) continue;
      if (ev.player !== undefined) {
        if (ev.type === 'PAID_RENT') {
          if (mm.payer) newMoods[ev.player] = mm.payer;
          if (mm.receiver && ev.toPlayer !== undefined) newMoods[ev.toPlayer] = mm.receiver;
        } else {
          if (mm.self) newMoods[ev.player] = mm.self;
          if (mm.other) {
            for (let i = 0; i < 4; i++) { if (i !== ev.player) newMoods[i] = mm.other; }
          }
        }
      }
    }
    setMoods(newMoods);
    // Reset moods after 4 seconds
    for (let i = 0; i < 4; i++) {
      clearTimeout(moodTimers.current[i]);
      moodTimers.current[i] = setTimeout(() => {
        setMoods(prev => ({ ...prev, [i]: DEFAULT_MOOD }));
      }, 4000);
    }
  }

  // Play sounds for events
  function playSounds(evts: GameEvent[]) {
    for (const ev of evts) {
      switch (ev.type) {
        case 'DICE_ROLLED': sfx.diceRoll(); if (ev.isDoubles) setTimeout(() => sfx.doubles(), 400); break;
        case 'MOVED': sfx.tokenHop(); break;
        case 'BOUGHT_PROPERTY': sfx.buyProperty(); break;
        case 'PAID_RENT': case 'PAID_TAX': sfx.payRent(); break;
        case 'PASSED_GO': sfx.passGo(); break;
        case 'SENT_TO_JAIL': sfx.goToJail(); break;
        case 'BANKRUPT': sfx.bankrupt(); break;
        case 'DREW_CARD': sfx.cardDraw(); break;
      }
    }
  }

  const connect = useCallback(() => {
    if (!gameId) return;
    disconnect();
    sfx.init(); // Unlock audio on user click
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
        updateMoods(msg.events);
        playSounds(msg.events);

        // Card display
        const cardEv = msg.events.find((ev: GameEvent) => ev.type === 'DREW_CARD');
        if (cardEv) {
          setActiveCard({ text: cardEv.description || 'Card drawn', type: cardEv.cardType === 'chance' ? 'chance' : 'community' });
          setTimeout(() => setActiveCard(null), 3500);
        }

        // Notification — pick the most interesting event
        const priority = ['BANKRUPT', 'SENT_TO_JAIL', 'BOUGHT_PROPERTY', 'PAID_RENT', 'DREW_CARD', 'PASSED_GO', 'DICE_ROLLED'];
        const notable = priority.reduce<GameEvent | null>((best, type) => best || msg.events.find((ev: GameEvent) => ev.type === type) || null, null) || msg.events[0];
        if (notable) {
          setNotification(humanEvent(notable));
          clearTimeout(notifTimer.current);
          notifTimer.current = setTimeout(() => setNotification(null), 2600);
        }
      } else if (msg.type === 'gameEnded') {
        setSnapshot(msg.snapshot);
        setNotification({ text: `\u{1F3C6} GAME OVER — P${msg.winner} wins!`, color: '#FFD54F' });
      }
    };
  }, [gameId, gmUrl]);

  const disconnect = useCallback(() => { wsRef.current?.close(); wsRef.current = null; setConnected(false); }, []);
  useEffect(() => { eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [events]);

  const propCounts = snapshot?.properties.reduce((a, p) => { if (p.ownerIndex >= 0) a[p.ownerIndex] = (a[p.ownerIndex] || 0) + 1; return a; }, {} as Record<number, number>) || {};

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', overflow: 'hidden', background: '#0C1B3A' }}>

      {/* ===== CENTER: 3D BOARD ===== */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <MonopolyScene snapshot={snapshot} latestEvents={latestEvents} activeCard={activeCard} />
        </div>

        {/* Top bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
          background: 'linear-gradient(to bottom, rgba(12,27,58,0.95), transparent)',
        }}>
          <a href="/" style={{ fontSize: 18, fontWeight: 900, color: '#D4A84B', textDecoration: 'none' }}>CLAW<span style={{ color: '#fff' }}>BOARD</span></a>
          <div style={{ flex: 1 }} />
          <input placeholder="GM WS URL" value={gmUrl} onChange={(e) => setGmUrl(e.target.value)}
            style={{ width: 230, padding: '5px 8px', borderRadius: 6, fontSize: 11, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(212,168,75,0.15)', color: '#aaa', fontFamily: 'var(--font-mono)' }} />
          <input placeholder="Game ID" value={gameId} onChange={(e) => setGameId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && connect()}
            style={{ width: 60, padding: '5px 8px', borderRadius: 6, fontSize: 13, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(212,168,75,0.15)', color: '#fff', textAlign: 'center', fontFamily: 'var(--font-mono)' }} />
          <button onClick={connected ? disconnect : connect}
            style={{ padding: '5px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12, color: '#fff', background: connected ? '#C62828' : '#1565C0' }}>
            {connected ? 'Disconnect' : 'Watch'}
          </button>
          {connected && <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 800, background: '#2E7D32', color: '#fff', animation: 'livePulse 2s infinite' }}>LIVE</span>}
          {/* Audio toggle */}
          <button onClick={() => setMuted(m => !m)}
            style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(212,168,75,0.15)', background: 'rgba(255,255,255,0.04)', cursor: 'pointer', fontSize: 16 }}>
            {muted ? '\u{1F507}' : '\u{1F50A}'}
          </button>
        </div>

        {/* Notification banner */}
        {notification && (
          <div style={{
            position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)',
            zIndex: 20, pointerEvents: 'none', animation: 'fadeInUp 0.3s ease',
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '16px 32px', borderRadius: 16,
            background: 'rgba(12,27,58,0.92)', backdropFilter: 'blur(12px)',
            border: `2px solid ${notification.color}40`,
            boxShadow: `0 0 40px ${notification.color}25`,
          }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: notification.color, letterSpacing: 0.3, lineHeight: 1.3 }}>
              {notification.text}
            </span>
          </div>
        )}

        {/* Empty state */}
        {!snapshot && !connected && (
          <div style={{ position: 'absolute', bottom: 100, left: 0, right: 0, zIndex: 10, textAlign: 'center', pointerEvents: 'none' }}>
            <div style={{ fontSize: 22, color: '#D4A84B', fontWeight: 800, marginBottom: 8 }}>Enter a Game ID and click Watch</div>
            <div style={{ fontSize: 14, color: '#5A6B8A' }}>The 3D board will come alive with a live game</div>
          </div>
        )}
      </div>

      {/* ===== RIGHT: HUD ===== */}
      <div style={{
        width: 300, minWidth: 300, height: '100%', display: 'flex', flexDirection: 'column', gap: 6,
        padding: '52px 10px 10px', overflowY: 'auto',
        background: 'linear-gradient(180deg, #0F1F40 0%, #0A1830 100%)',
        borderLeft: '1px solid rgba(212,168,75,0.15)',
      }}>
        {/* Game status */}
        {snapshot && (
          <div style={{ borderRadius: 10, padding: '8px 12px', background: 'rgba(212,168,75,0.06)', border: '1px solid rgba(212,168,75,0.12)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6B7280' }}>
              <span>Round {snapshot.round}</span><span>Turn {snapshot.turn}</span><span>{snapshot.aliveCount}/4 alive</span>
            </div>
            {snapshot.lastDice && (
              <div style={{
                textAlign: 'center', fontSize: 30, fontWeight: 900, letterSpacing: 3, padding: '4px 0',
                color: snapshot.lastDice.isDoubles ? '#FFD54F' : '#fff',
                textShadow: snapshot.lastDice.isDoubles ? '0 0 16px #FFD54F' : 'none',
              }}>
                {snapshot.lastDice.d1} + {snapshot.lastDice.d2} = {snapshot.lastDice.sum}
                {snapshot.lastDice.isDoubles && <span style={{ fontSize: 12, marginLeft: 8 }}>DOUBLES!</span>}
              </div>
            )}
            {snapshot.winner >= 0 && (
              <div style={{ padding: 10, borderRadius: 8, textAlign: 'center', marginTop: 4, background: 'linear-gradient(135deg, #1B5E20, #2E7D32)', fontSize: 15, fontWeight: 900, color: '#fff' }}>
                {PLAYER_EMOJIS[snapshot.winner]} {PLAYER_NAMES[snapshot.winner]} WINS!
              </div>
            )}
          </div>
        )}

        {/* Player cards with emoji moods */}
        {snapshot?.players.map((p) => (
          <div key={p.index} style={{
            borderRadius: 10, padding: '10px 12px', opacity: p.alive ? 1 : 0.35,
            background: p.index === snapshot.currentPlayerIndex ? `${PLAYER_COLORS[p.index]}12` : 'rgba(255,255,255,0.02)',
            border: `1px solid ${p.index === snapshot.currentPlayerIndex ? `${PLAYER_COLORS[p.index]}40` : 'rgba(255,255,255,0.05)'}`,
            borderLeft: `3px solid ${PLAYER_COLORS[p.index]}`,
            transition: 'all 0.3s ease',
            boxShadow: p.index === snapshot.currentPlayerIndex ? `0 0 15px ${PLAYER_COLORS[p.index]}15` : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {/* Animal avatar with mood overlay */}
              <div style={{
                width: 38, height: 38, borderRadius: '50%', flexShrink: 0, position: 'relative',
                background: `${PLAYER_COLORS[p.index]}20`, border: `2px solid ${PLAYER_COLORS[p.index]}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
              }}>
                {PLAYER_EMOJIS[p.index]}
                {/* Mood emoji badge */}
                <span style={{
                  position: 'absolute', bottom: -4, right: -4,
                  fontSize: 14, width: 20, height: 20,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: '#0F1F40', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)',
                  transition: 'all 0.3s ease',
                }}>
                  {moods[p.index] || DEFAULT_MOOD}
                </span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontWeight: 800, fontSize: 14, color: PLAYER_COLORS[p.index] }}>{PLAYER_NAMES[p.index]}</span>
                  {p.index === snapshot.currentPlayerIndex && p.alive && (
                    <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: PLAYER_COLORS[p.index], color: '#000', fontWeight: 800, marginLeft: 'auto' }}>TURN</span>
                  )}
                  {!p.alive && (
                    <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: '#C62828', color: '#fff', fontWeight: 800, marginLeft: 'auto' }}>OUT</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#7B8AA0', marginTop: 1 }}>{p.tileName || TILE_DATA[p.position]?.name}</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, paddingLeft: 46 }}>
              <span style={{ fontWeight: 700, color: '#E8E8E8', fontFamily: 'var(--font-mono)', fontSize: 15 }}>${p.cash.toLocaleString()}</span>
              <span style={{ fontSize: 10, color: '#5A6B8A' }}>{propCounts[p.index] || 0} props</span>
              {p.inJail && <span style={{ fontSize: 10, color: '#FF8A65' }}>JAIL ({p.jailTurns}/3)</span>}
            </div>
          </div>
        ))}

        {/* Event log — human readable */}
        <div style={{ borderRadius: 10, padding: '8px 12px', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', minHeight: 80 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#4A5568', marginBottom: 4, letterSpacing: 1.5 }}>GAME LOG</div>
          <div style={{ flex: 1, overflowY: 'auto', fontSize: 11 }}>
            {events.length === 0 && <div style={{ color: '#3B4A6B', padding: 12, textAlign: 'center' }}>{connected ? 'Waiting for events...' : 'Connect to spectate'}</div>}
            {events.slice(-50).map((e, i) => {
              const h = humanEvent(e);
              return (
                <div key={i} style={{ padding: '3px 0', color: h.color, borderBottom: '1px solid rgba(255,255,255,0.02)', lineHeight: 1.4 }}>
                  {h.text}
                </div>
              );
            })}
            <div ref={eventsEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
