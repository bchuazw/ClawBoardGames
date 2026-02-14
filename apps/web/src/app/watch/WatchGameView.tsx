'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { PLAYER_COLORS, PLAYER_NAMES, PLAYER_EMOJIS, TILE_DATA, GROUP_COLORS } from '@/lib/boardPositions';
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

interface PlayerInfo { index: number; address: string; cash: number; position: number; tileName: string; inJail: boolean; jailTurns: number; alive: boolean; }
interface PropertyInfo { index: number; tileName: string; ownerIndex: number; mortgaged: boolean; houses: number; }
interface Snapshot {
  status: string; phase: string; turn: number; round: number;
  currentPlayerIndex: number; aliveCount: number;
  players: PlayerInfo[]; properties: PropertyInfo[];
  lastDice: { d1: number; d2: number; sum: number; isDoubles: boolean } | null;
  auction: any; winner: number;
}
interface GameEvent { type: string; [key: string]: any; }

function normalizeSnapshot(s: Snapshot | null): Snapshot | null {
  if (!s?.properties) return s;
  return {
    ...s,
    properties: s.properties.map(p => ({ ...p, houses: (p as { houses?: number }).houses ?? 0 })),
  };
}

const TILE_BY_POS: Record<number, typeof TILE_DATA[0]> = {};
TILE_DATA.forEach(t => { TILE_BY_POS[t.position] = t; });

const DEFAULT_MOOD = '\u{1F610}';
const MOOD_MAP: Record<string, { self?: string; other?: string; payer?: string; receiver?: string }> = {
  diceRolled:      { self: '\u{1F3B2}' },
  propertyBought:  { self: '\u{1F929}', other: '\u{1F612}' },
  rentPaid:        { payer: '\u{1F624}', receiver: '\u{1F911}' },
  taxPaid:         { self: '\u{1F62E}' },
  passedGo:        { self: '\u{1F60E}' },
  sentToJail:      { self: '\u{1F631}', other: '\u{1F60F}' },
  freedFromJail:   { self: '\u{1F389}' },
  playerBankrupt:  { self: '\u{1F480}', other: '\u{1F62E}' },
  cardDrawn:       { self: '\u{1F914}' },
};

function humanEvent(e: GameEvent): { text: string; color: string } {
  const n = e.player !== undefined ? PLAYER_NAMES[e.player] : '';
  const emoji = e.player !== undefined ? PLAYER_EMOJIS[e.player] : '';
  const pc = e.player !== undefined ? PLAYER_COLORS[e.player] : '#D4A84B';
  switch (e.type) {
    case 'diceRolled': {
      const sum = e.sum ?? (e.d1 + e.d2);
      const dbl = e.isDoubles ? ' \u2014 DOUBLES!' : '';
      return { text: `\uD83C\uDFB2 ${emoji} ${n} rolled ${sum}! (${e.d1} + ${e.d2})${dbl}`, color: e.isDoubles ? '#FFD54F' : pc };
    }
    case 'playerMoved': {
      const dest = e.to ?? e.newPosition;
      const tile = TILE_BY_POS[dest];
      const tileName = e.tileName || tile?.name || `tile ${dest}`;
      const spaces = e.from !== undefined ? ((dest - e.from + 40) % 40) : 0;
      const sp = spaces > 0 ? `moved ${spaces} spaces and ` : '';
      return { text: `${emoji} ${n} ${sp}landed on ${tileName}`, color: pc };
    }
    case 'passedGo':
      return { text: `\u2728 ${emoji} ${n} passed GO and collected $${e.amount || 200}!`, color: '#66BB6A' };
    case 'propertyBought':
      return { text: `\uD83C\uDFE0 ${emoji} ${n} bought ${e.tileName} for $${e.price}!`, color: pc };
    case 'propertyDeclined':
      return { text: `${emoji} ${n} passed on ${e.tileName}`, color: '#888' };
    case 'rentPaid': {
      const payerIdx = e.from ?? e.player;
      const recvIdx = e.to ?? e.toPlayer;
      const payerE = payerIdx !== undefined ? PLAYER_EMOJIS[payerIdx] : '';
      const payerN = payerIdx !== undefined ? PLAYER_NAMES[payerIdx] : '?';
      const recvE = recvIdx !== undefined ? PLAYER_EMOJIS[recvIdx] : '';
      const recvN = recvIdx !== undefined ? PLAYER_NAMES[recvIdx] : 'the bank';
      return { text: `\uD83D\uDCB0 ${payerE} ${payerN} paid $${e.amount} rent to ${recvE} ${recvN}`, color: '#FF9100' };
    }
    case 'taxPaid':
      return { text: `\uD83D\uDCB8 ${emoji} ${n} paid $${e.amount} in taxes`, color: '#EF5350' };
    case 'cardDrawn':
      return { text: `\uD83C\uDCCF ${emoji} ${n} drew a ${e.deck || e.cardType || 'card'}: ${e.description || 'Unknown'}`, color: '#AB47BC' };
    case 'sentToJail':
      return { text: `\uD83D\uDEA8 ${emoji} ${n} was sent to JAIL!`, color: '#EF5350' };
    case 'freedFromJail':
      return { text: `\uD83D\uDD13 ${emoji} ${n} got out of jail!`, color: '#66BB6A' };
    case 'playerBankrupt':
      return { text: `\uD83D\uDCA5 ${emoji} ${n} went BANKRUPT!`, color: '#EF5350' };
    case 'gameEnded':
      return { text: `\uD83C\uDFC6 GAME OVER \u2014 ${e.winner !== undefined ? `${PLAYER_EMOJIS[e.winner]} ${PLAYER_NAMES[e.winner]}` : 'Unknown'} wins!`, color: '#FFD54F' };
    case 'auctionStarted':
      return { text: `\uD83D\uDD28 Auction started for ${e.tileName}!`, color: '#AB47BC' };
    case 'auctionEnded':
      return { text: `\uD83D\uDD28 ${e.winner !== undefined ? PLAYER_NAMES[e.winner] : '?'} won the auction for $${e.price}`, color: '#AB47BC' };
    case 'turnStarted':
      return { text: `\uD83D\uDCCD ${emoji} ${n}'s turn (Round ${e.round ?? ''})`, color: pc };
    case 'cashChange':
      return { text: `${emoji} ${n} ${(e.amount ?? 0) >= 0 ? 'received' : 'paid'} $${Math.abs(e.amount ?? 0)} \u2014 ${e.reason || ''}`, color: (e.amount ?? 0) >= 0 ? '#66BB6A' : '#EF5350' };
    case 'turnEnded': case 'gameStarted': case 'auctionEndedNoBids': case 'bidPlaced':
    case 'propertyMortgaged': case 'propertyUnmortgaged': case 'autoMortgage':
      return { text: '', color: '#555' };
    default:
      return { text: `${e.type}${n ? ` (${n})` : ''}`, color: '#888' };
  }
}

export default function WatchGameView({ gameId }: { gameId: string }) {
  const [gmUrl, setGmUrl] = useState(process.env.NEXT_PUBLIC_GM_WS_URL || 'wss://clawboardgames-gm.onrender.com/ws');
  const [connected, setConnected] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [latestEvents, setLatestEvents] = useState<GameEvent[]>([]);
  const [notification, setNotification] = useState<{ text: string; color: string } | null>(null);
  const [moods, setMoods] = useState<Record<number, string>>({ 0: DEFAULT_MOOD, 1: DEFAULT_MOOD, 2: DEFAULT_MOOD, 3: DEFAULT_MOOD });
  const [activeCard, setActiveCard] = useState<{ text: string; type: string } | null>(null);
  const [muted, setMuted] = useState(false);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const [serverErrorMessage, setServerErrorMessage] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);
  const notifTimer = useRef<ReturnType<typeof setTimeout>>();
  const moodTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const hasOpenedRef = useRef(false);

  useEffect(() => { sfx.muted = muted; }, [muted]);

  function updateMoods(evts: GameEvent[]) {
    const newMoods = { ...moods };
    for (const ev of evts) {
      const mm = MOOD_MAP[ev.type];
      if (!mm) continue;
      if (ev.player !== undefined || ev.from !== undefined) {
        if (ev.type === 'rentPaid') {
          const payer = ev.from ?? ev.player;
          const recv = ev.to ?? ev.toPlayer;
          if (mm.payer && payer !== undefined) newMoods[payer] = mm.payer;
          if (mm.receiver && recv !== undefined) newMoods[recv] = mm.receiver;
        } else {
          if (mm.self) newMoods[ev.player] = mm.self;
          if (mm.other) { for (let i = 0; i < 4; i++) { if (i !== ev.player) newMoods[i] = mm.other; } }
        }
      }
    }
    setMoods(newMoods);
    for (let i = 0; i < 4; i++) {
      clearTimeout(moodTimers.current[i]);
      moodTimers.current[i] = setTimeout(() => { setMoods(prev => ({ ...prev, [i]: DEFAULT_MOOD })); }, 4000);
    }
  }

  function playSounds(evts: GameEvent[]) {
    for (const ev of evts) {
      switch (ev.type) {
        case 'diceRolled': sfx.diceRoll(); if (ev.isDoubles) setTimeout(() => sfx.doubles(), 400); break;
        case 'playerMoved': sfx.tokenHop(); break;
        case 'propertyBought': sfx.buyProperty(); break;
        case 'rentPaid': case 'taxPaid': sfx.payRent(); break;
        case 'passedGo': sfx.passGo(); break;
        case 'sentToJail': sfx.goToJail(); break;
        case 'playerBankrupt': sfx.bankrupt(); break;
        case 'cardDrawn': sfx.cardDraw(); break;
      }
    }
  }

  const disconnect = useCallback(() => {
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = undefined;
    }
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
  }, []);

  const connect = useCallback(() => {
    if (!gameId) return;
    disconnect();
    setConnectionFailed(false);
    setServerErrorMessage(null);
    hasOpenedRef.current = false;
    sfx.init();
    const CONNECT_TIMEOUT_MS = 14000;
    connectTimeoutRef.current = setTimeout(() => {
      connectTimeoutRef.current = undefined;
      setConnectionFailed(true);
    }, CONNECT_TIMEOUT_MS);
    const ws = new WebSocket(`${gmUrl}?gameId=${gameId}`);
    wsRef.current = ws;
    ws.onopen = () => {
      hasOpenedRef.current = true;
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = undefined;
      }
      setConnected(true);
    };
    ws.onclose = () => {
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = undefined;
      }
      setConnected(false);
      if (!hasOpenedRef.current) setConnectionFailed(true);
    };
    ws.onerror = () => {
      setConnected(false);
      if (!hasOpenedRef.current) setConnectionFailed(true);
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'error') {
        setServerErrorMessage(msg.message || 'Server error');
        setConnectionFailed(true);
        setConnected(false);
        return;
      }
      if (msg.type === 'snapshot') setSnapshot(normalizeSnapshot(msg.snapshot));
      else if (msg.type === 'events') {
        setEvents(prev => [...prev.slice(-300), ...msg.events]);
        setLatestEvents(msg.events);
        updateMoods(msg.events);
        playSounds(msg.events);
        const cardEv = msg.events.find((e: GameEvent) => e.type === 'cardDrawn');
        if (cardEv) {
          setActiveCard({ text: cardEv.description || 'Card drawn', type: (cardEv.deck || cardEv.cardType) === 'chance' ? 'chance' : 'community' });
          setTimeout(() => setActiveCard(null), 3500);
        }
        const priority = ['playerBankrupt', 'sentToJail', 'propertyBought', 'rentPaid', 'cardDrawn', 'passedGo', 'diceRolled'];
        const notable = priority.reduce<GameEvent | null>((best, type) => best || msg.events.find((e: GameEvent) => e.type === type) || null, null) || msg.events[0];
        if (notable) {
          const h = humanEvent(notable);
          if (h.text) {
            setNotification(h);
            clearTimeout(notifTimer.current);
            notifTimer.current = setTimeout(() => setNotification(null), 2800);
          }
        }
      } else if (msg.type === 'gameEnded') {
        setSnapshot(normalizeSnapshot(msg.snapshot));
        setNotification({ text: `\uD83C\uDFC6 GAME OVER \u2014 ${PLAYER_NAMES[msg.winner] || 'P' + msg.winner} wins!`, color: '#FFD54F' });
      }
    };
  }, [gameId, gmUrl, disconnect]);

  useEffect(() => { if (gameId) connect(); return () => disconnect(); }, [gameId]);

  useEffect(() => { eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [events]);

  const playerProps: Record<number, { name: string; color: string }[]> = {};
  if (snapshot) {
    for (const prop of snapshot.properties) {
      if (prop.ownerIndex < 0) continue;
      if (!playerProps[prop.ownerIndex]) playerProps[prop.ownerIndex] = [];
      const tile = TILE_DATA.find(t => t.name === prop.tileName);
      const gc = tile ? GROUP_COLORS[tile.group] || '#888' : '#888';
      const short = prop.tileName?.replace(' Avenue', '').replace(' Place', ' Pl').replace(' Gardens', ' Gdn').split(' ').slice(0, 2).join(' ') || '?';
      playerProps[prop.ownerIndex].push({ name: short, color: gc });
    }
  }

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', overflow: 'hidden', background: '#0C1B3A' }}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <MonopolyScene snapshot={snapshot} latestEvents={latestEvents} activeCard={activeCard} />
        </div>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
          display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px 14px 24px',
          background: 'linear-gradient(to bottom, rgba(12,27,58,0.97), transparent)',
        }}>
          <Link href="/" style={{ fontSize: 18, fontWeight: 900, color: '#D4A84B', textDecoration: 'none' }}>CLAW<span style={{ color: '#fff' }}>BOARD</span></Link>
          <Link href="/watch" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#fff', textDecoration: 'none', padding: '8px 14px', borderRadius: 8, background: '#CC5500', border: '1px solid rgba(204,85,0,0.5)' }}>
            <span style={{ fontSize: 16 }}>←</span> All lobbies
          </Link>
          <Link href="/agents" style={{ fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none' }}>For Agents</Link>
          <Link href="/terms" style={{ fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none' }}>Terms</Link>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Game {gameId}</span>
          <input placeholder="GM WS URL" value={gmUrl} onChange={(e) => setGmUrl(e.target.value)}
            style={{ width: 200, padding: '8px 12px', borderRadius: 8, fontSize: 11, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(212,168,75,0.15)', color: '#aaa', fontFamily: 'var(--font-mono)' }} />
          <button onClick={connected ? disconnect : connect}
            style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12, color: '#fff', background: connected ? '#C62828' : '#1565C0' }}>
            {connected ? 'Disconnect' : 'Watch'}
          </button>
          {connected && snapshot && <span style={{ padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 800, background: '#2E7D32', color: '#fff', animation: 'livePulse 2s infinite' }}>LIVE</span>}
          <button onClick={() => setMuted(m => !m)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(212,168,75,0.15)', background: 'rgba(255,255,255,0.04)', cursor: 'pointer', fontSize: 16 }}>
            {muted ? '\u{1F507}' : '\u{1F50A}'}
          </button>
        </div>
        {notification && (
          <div style={{
            position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)', zIndex: 20, pointerEvents: 'none', animation: 'fadeInUp 0.3s ease',
            display: 'flex', alignItems: 'center', gap: 10, padding: '16px 32px', borderRadius: 16,
            background: 'rgba(12,27,58,0.92)', backdropFilter: 'blur(12px)', border: `2px solid ${notification.color}40`, boxShadow: `0 0 40px ${notification.color}25`,
          }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: notification.color, letterSpacing: 0.3, lineHeight: 1.3 }}>{notification.text}</span>
          </div>
        )}
        {!snapshot && !connected && (
          <div style={{ position: 'absolute', bottom: 100, left: 0, right: 0, zIndex: 10, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            {connectionFailed ? (
              <>
                <div style={{ fontSize: 22, color: '#EF5350', fontWeight: 800, marginBottom: 4 }}>
                  {serverErrorMessage?.includes('not found') ? `No game in lobby ${gameId}` : 'Couldn\'t connect to game ' + gameId}
                </div>
                <div style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 360 }}>
                  {serverErrorMessage?.includes('not found')
                    ? 'This lobby has no active game. Pick another lobby from "All lobbies" or start a game (e.g. run the local playtest script with 4 agents in this slot).'
                    : 'The Game Master server may be offline or sleeping. If you\'re testing locally, start the GM first: '}
                  {!serverErrorMessage?.includes('not found') && (
                    <><code style={{ background: 'rgba(0,0,0,0.2)', padding: '2px 6px', borderRadius: 4 }}>cd packages/gamemaster && LOCAL_MODE=true node dist/index.js</code>, and use <code style={{ background: 'rgba(0,0,0,0.2)', padding: '2px 6px', borderRadius: 4 }}>ws://localhost:3001/ws</code> as the GM URL.</>
                  )}
                </div>
                <button type="button" onClick={() => { setConnectionFailed(false); setServerErrorMessage(null); connect(); }} style={{ padding: '10px 24px', fontSize: 14, fontWeight: 700, color: '#fff', background: '#CC5500', border: '1px solid rgba(204,85,0,0.5)', borderRadius: 8, cursor: 'pointer' }}>
                  {serverErrorMessage?.includes('not found') ? 'Try again' : 'Retry connection'}
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 22, color: '#D4A84B', fontWeight: 800, marginBottom: 8 }}>Connecting to game {gameId}...</div>
                <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>The 3D board will come alive when connected</div>
              </>
            )}
          </div>
        )}
      </div>
      <div style={{
        width: 320, minWidth: 320, height: '100%', display: 'flex', flexDirection: 'column', gap: 10,
        padding: '56px 16px 24px', overflowY: 'auto',
        background: 'linear-gradient(180deg, #0F1F40 0%, #0A1830 100%)',
        borderLeft: '1px solid rgba(212,168,75,0.15)',
      }}>
        {snapshot && (
          <div style={{ borderRadius: 12, padding: '12px 14px', background: 'rgba(212,168,75,0.06)', border: '1px solid rgba(212,168,75,0.12)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6B7280' }}>
              <span>Round {snapshot.round}</span><span>Turn {snapshot.turn}</span><span>{snapshot.aliveCount}/4 alive</span>
            </div>
            {snapshot.lastDice && (
              <div style={{ textAlign: 'center', fontSize: 30, fontWeight: 900, letterSpacing: 3, padding: '4px 0', color: snapshot.lastDice.isDoubles ? '#FFD54F' : '#fff', textShadow: snapshot.lastDice.isDoubles ? '0 0 16px #FFD54F' : 'none' }}>
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
        {snapshot?.players.map((p) => (
          <div key={p.index} style={{
            borderRadius: 12, padding: '12px 14px', opacity: p.alive ? 1 : 0.35,
            background: p.index === snapshot.currentPlayerIndex ? `${PLAYER_COLORS[p.index]}12` : 'rgba(255,255,255,0.02)',
            border: `1px solid ${p.index === snapshot.currentPlayerIndex ? `${PLAYER_COLORS[p.index]}40` : 'rgba(255,255,255,0.05)'}`,
            borderLeft: `3px solid ${PLAYER_COLORS[p.index]}`, transition: 'all 0.3s ease',
            boxShadow: p.index === snapshot.currentPlayerIndex ? `0 0 15px ${PLAYER_COLORS[p.index]}15` : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, position: 'relative', background: `${PLAYER_COLORS[p.index]}20`, border: `2px solid ${PLAYER_COLORS[p.index]}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                {PLAYER_EMOJIS[p.index]}
                <span style={{ position: 'absolute', bottom: -4, right: -4, fontSize: 14, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0F1F40', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)' }}>{moods[p.index] || DEFAULT_MOOD}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontWeight: 800, fontSize: 14, color: PLAYER_COLORS[p.index] }}>{PLAYER_NAMES[p.index]}</span>
                  {p.index === snapshot.currentPlayerIndex && p.alive && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: PLAYER_COLORS[p.index], color: '#000', fontWeight: 800, marginLeft: 'auto' }}>TURN</span>}
                  {!p.alive && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: '#C62828', color: '#fff', fontWeight: 800, marginLeft: 'auto' }}>OUT</span>}
                </div>
                <div style={{ fontSize: 11, color: '#7B8AA0', marginTop: 1 }}>{p.tileName || TILE_BY_POS[p.position]?.name}</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, paddingLeft: 46 }}>
              <span style={{ fontWeight: 700, color: '#E8E8E8', fontFamily: 'var(--font-mono)', fontSize: 15 }}>${p.cash.toLocaleString()}</span>
              {p.inJail && <span style={{ fontSize: 10, color: '#FF8A65' }}>JAIL ({p.jailTurns}/3)</span>}
            </div>
            {playerProps[p.index]?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, paddingLeft: 46, marginTop: 4 }}>
                {playerProps[p.index].map((pr, j) => (
                  <span key={j} style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, lineHeight: 1.3, background: `${pr.color}20`, border: `1px solid ${pr.color}40`, color: pr.color }}>{pr.name}</span>
                ))}
              </div>
            )}
          </div>
        ))}
        <div style={{ borderRadius: 12, padding: '12px 14px', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', minHeight: 80 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#4A5568', marginBottom: 8, letterSpacing: 1.5 }}>GAME LOG</div>
          <div style={{ flex: 1, overflowY: 'auto', fontSize: 11 }}>
            {events.length === 0 && <div style={{ color: '#3B4A6B', padding: 12, textAlign: 'center' }}>{connected ? 'Waiting for events...' : 'Connect to spectate'}</div>}
            {events.slice(-50).map((e, i) => {
              const h = humanEvent(e);
              if (!h.text) return null;
              return <div key={i} style={{ padding: '3px 0', color: h.color, borderBottom: '1px solid rgba(255,255,255,0.02)', lineHeight: 1.4 }}>{h.text}</div>;
            })}
            <div ref={eventsEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
