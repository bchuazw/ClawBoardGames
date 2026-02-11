'use client';

import { Suspense, useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { PLAYER_COLORS, PLAYER_NAMES, PLAYER_EMOJIS, TILE_DATA } from '@/lib/boardPositions';

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

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface PlayerInfo {
  index: number; address: string; cash: number; position: number;
  tileName: string; inJail: boolean; jailTurns: number; alive: boolean;
}
interface PropertyInfo { index: number; tileName: string; ownerIndex: number; mortgaged: boolean; }
interface Snapshot {
  status: string; phase: string; turn: number; round: number;
  currentPlayerIndex: number; aliveCount: number;
  players: PlayerInfo[]; properties: PropertyInfo[];
  lastDice: { d1: number; d2: number; sum: number; isDoubles: boolean } | null;
  auction: any; winner: number;
}
interface GameEvent { type: string; [key: string]: any; }
interface ChatMsg { id: number; player: number; text: string; ts: number; }

/* ------------------------------------------------------------------ */
/*  Chat message generation — personality-driven AI banter             */
/* ------------------------------------------------------------------ */
const PERSONALITIES = ['friendly', 'snarky', 'tough', 'clever'] as const;

const MSGS: Record<string, Record<string, string[]>> = {
  DICE_ROLLED_self: {
    friendly: ['Here we go! Let\'s see!', 'Come on lucky roll!', 'Rolling!'],
    snarky: ['Watch and learn.', '*sighs* Here goes.', 'Try to keep up.'],
    tough: ['BIG NUMBERS! COME ON!', 'LET\'S GO!', 'ROLLING HARD!'],
    clever: ['Calculating the odds...', 'Statistically speaking...', 'Let\'s see what fate decides.'],
  },
  BOUGHT_PROPERTY_self: {
    friendly: ['Love it! {tile} is mine!', 'Yay, more for my collection!', '{tile}! Perfect!'],
    snarky: ['{tile}? Fine, I\'ll take it.', 'Obviously mine now.', 'You\'re welcome, {tile}.'],
    tough: ['{tile} is MINE! Stay away!', 'EXPANDING the empire!', 'Nobody touches {tile}!'],
    clever: ['Strategic acquisition: {tile}.', 'All part of the plan.', '{tile} completes my strategy.'],
  },
  BOUGHT_PROPERTY_react: {
    friendly: ['Nice pick! But I wanted it!', 'Good choice! I\'ll get the next one!', 'Aww, lucky!'],
    snarky: ['Whatever, didn\'t want it.', 'Enjoy it while you can.', '*unimpressed*'],
    tough: ['I\'ll take it from you!', 'That won\'t save you!', 'You\'re making a mistake!'],
    clever: ['Noted. Adjusting strategy.', 'Hmm, interesting choice.', 'This changes my calculations.'],
  },
  PAID_RENT_payer: {
    friendly: ['Ouch! That stings!', 'Expensive visit!', 'There go my savings!'],
    snarky: ['Ugh, FINE. Here.', 'Don\'t get used to it.', 'Enjoy MY money.'],
    tough: ['This isn\'t over!', 'I\'ll get you back!', 'Mark my words!'],
    clever: ['A temporary setback.', 'Cost of doing business.', 'This changes nothing long-term.'],
  },
  PAID_RENT_receiver: {
    friendly: ['Thanks for visiting!', 'Welcome! That\'ll be rent!', 'Ka-ching!'],
    snarky: ['Pay up.', 'Music to my ears.', 'As expected.'],
    tough: ['PAY ME!', 'That\'s what happens!', 'WHO\'S NEXT?!'],
    clever: ['My investment pays off.', 'Right on schedule.', 'Predictable.'],
  },
  SENT_TO_JAIL_self: {
    friendly: ['Oh no! Jail?!', 'But I was being so good!', 'Somebody help!'],
    snarky: ['This is ridiculous.', 'I demand a lawyer!', 'Preposterous.'],
    tough: ['THEY CAN\'T HOLD ME!', 'I\'LL BREAK OUT!', 'THIS MEANS WAR!'],
    clever: ['A minor inconvenience.', 'I\'ll use this time to strategize.', 'Temporary detour.'],
  },
  SENT_TO_JAIL_react: {
    friendly: ['Oh no, get well soon!', 'I\'ll miss you!', 'Hang in there!'],
    snarky: ['Ha! Couldn\'t happen to a nicer player.', 'Enjoy prison.', 'Bye bye!'],
    tough: ['One less competitor!', 'WEAK!', 'Haha!'],
    clever: ['One obstacle removed.', 'Excellent development.', 'The odds improve.'],
  },
  PASSED_GO_self: {
    friendly: ['Yay! $200! Treat time!', 'Payday!', 'Love passing GO!'],
    snarky: ['$200? That\'s it?', 'Barely worth my time.', 'I deserve more.'],
    tough: ['MORE MONEY! MORE POWER!', 'FUNDING THE EMPIRE!', 'YES!'],
    clever: ['Cash flow secured.', 'Consistent income stream.', 'As planned.'],
  },
  BANKRUPT_self: {
    friendly: ['GG everyone! Had so much fun!', 'Well played all!', 'I\'ll cheer from here!'],
    snarky: ['This game was rigged.', 'I LET you win.', 'Whatever.'],
    tough: ['NO! IMPOSSIBLE!', 'I\'LL BE BACK!', 'This can\'t be happening!'],
    clever: ['A learning experience.', 'Interesting data point.', 'Next time will differ.'],
  },
  BANKRUPT_react: {
    friendly: ['Bye friend! You played great!', 'We\'ll miss you!', 'Good game!'],
    snarky: ['Finally. One less annoyance.', 'Took long enough.', 'Good riddance.'],
    tough: ['CRUSHED! WHO\'S NEXT?!', 'WEAK!', 'ANOTHER ONE DOWN!'],
    clever: ['As my models predicted.', 'Expected outcome.', 'Three remain.'],
  },
  idle: {
    friendly: ['This is so fun!', 'I love game night!', 'Who wants to be friends?', 'Best game ever!'],
    snarky: ['Can we speed this up?', 'I\'m bored.', 'Yawn.', 'Wake me when it\'s my turn.'],
    tough: ['I\'M WINNING THIS!', 'COME AT ME!', 'Nobody can beat me!', 'I feel UNSTOPPABLE!'],
    clever: ['Running probability analysis...', 'Fascinating board state.', 'My win rate is 73.2%.', 'Patience is key.'],
  },
};

function pickMsg(category: string, personality: string, vars: Record<string, string> = {}): string {
  const pool = MSGS[category]?.[personality] || MSGS.idle[personality] || ['...'];
  let msg = pool[Math.floor(Math.random() * pool.length)];
  for (const [k, v] of Object.entries(vars)) msg = msg.replace(`{${k}}`, v);
  return msg;
}

function generateChatFromEvent(ev: GameEvent, snapshot: Snapshot | null): ChatMsg[] {
  if (!snapshot) return [];
  const msgs: ChatMsg[] = [];
  const ts = Date.now();
  const pi = ev.player;

  if (ev.type === 'DICE_ROLLED' && pi !== undefined && Math.random() < 0.35) {
    msgs.push({ id: ts, player: pi, text: pickMsg('DICE_ROLLED_self', PERSONALITIES[pi]), ts });
  }
  if (ev.type === 'BOUGHT_PROPERTY' && pi !== undefined) {
    if (Math.random() < 0.7) msgs.push({ id: ts, player: pi, text: pickMsg('BOUGHT_PROPERTY_self', PERSONALITIES[pi], { tile: ev.tileName || '???' }), ts: ts + 200 });
    const reactor = (pi + 1 + Math.floor(Math.random() * 3)) % 4;
    if (Math.random() < 0.35 && snapshot.players[reactor]?.alive) {
      msgs.push({ id: ts + 1, player: reactor, text: pickMsg('BOUGHT_PROPERTY_react', PERSONALITIES[reactor]), ts: ts + 800 });
    }
  }
  if (ev.type === 'PAID_RENT' && pi !== undefined) {
    if (Math.random() < 0.55) msgs.push({ id: ts, player: pi, text: pickMsg('PAID_RENT_payer', PERSONALITIES[pi]), ts: ts + 200 });
    if (ev.toPlayer !== undefined && Math.random() < 0.45) {
      msgs.push({ id: ts + 1, player: ev.toPlayer, text: pickMsg('PAID_RENT_receiver', PERSONALITIES[ev.toPlayer]), ts: ts + 700 });
    }
  }
  if (ev.type === 'SENT_TO_JAIL' && pi !== undefined) {
    msgs.push({ id: ts, player: pi, text: pickMsg('SENT_TO_JAIL_self', PERSONALITIES[pi]), ts: ts + 200 });
    const reactor = (pi + 1 + Math.floor(Math.random() * 3)) % 4;
    if (snapshot.players[reactor]?.alive) {
      msgs.push({ id: ts + 1, player: reactor, text: pickMsg('SENT_TO_JAIL_react', PERSONALITIES[reactor]), ts: ts + 900 });
    }
  }
  if (ev.type === 'PASSED_GO' && pi !== undefined && Math.random() < 0.4) {
    msgs.push({ id: ts, player: pi, text: pickMsg('PASSED_GO_self', PERSONALITIES[pi]), ts: ts + 200 });
  }
  if (ev.type === 'BANKRUPT' && pi !== undefined) {
    msgs.push({ id: ts, player: pi, text: pickMsg('BANKRUPT_self', PERSONALITIES[pi]), ts: ts + 200 });
    for (let i = 0; i < 4; i++) {
      if (i !== pi && snapshot.players[i]?.alive && Math.random() < 0.6) {
        msgs.push({ id: ts + i + 1, player: i, text: pickMsg('BANKRUPT_react', PERSONALITIES[i]), ts: ts + 500 + i * 400 });
      }
    }
  }
  return msgs;
}

/* ------------------------------------------------------------------ */
/*  Event formatting                                                   */
/* ------------------------------------------------------------------ */
function formatEvent(e: GameEvent): { text: string; icon: string; color: string } {
  const p = e.player !== undefined ? PLAYER_NAMES[e.player] || `P${e.player}` : '';
  const pc = e.player !== undefined ? PLAYER_COLORS[e.player] : '#fff';
  switch (e.type) {
    case 'DICE_ROLLED': return { text: `${p} rolled ${e.d1}+${e.d2}=${e.sum}${e.isDoubles ? ' DOUBLES!' : ''}`, icon: 'DICE', color: e.isDoubles ? '#FFD54F' : pc };
    case 'MOVED': return { text: `${p} moved to ${e.tileName || `tile ${e.newPosition}`}`, icon: 'MOVE', color: pc };
    case 'PASSED_GO': return { text: `${p} passed GO — +$200`, icon: '$', color: '#66BB6A' };
    case 'BOUGHT_PROPERTY': return { text: `${p} bought ${e.tileName} for $${e.price}`, icon: 'BUY', color: pc };
    case 'PAID_RENT': return { text: `${p} paid $${e.amount} rent to ${PLAYER_NAMES[e.toPlayer] || `P${e.toPlayer}`}`, icon: 'RENT', color: '#FF9100' };
    case 'PAID_TAX': return { text: `${p} paid $${e.amount} tax`, icon: 'TAX', color: '#EF5350' };
    case 'DREW_CARD': return { text: `${p}: ${e.description || e.cardType}`, icon: 'CARD', color: '#AB47BC' };
    case 'SENT_TO_JAIL': return { text: `${p} sent to JAIL!`, icon: 'JAIL', color: '#EF5350' };
    case 'LEFT_JAIL': return { text: `${p} escaped jail!`, icon: 'FREE', color: '#66BB6A' };
    case 'BANKRUPT': return { text: `${p} is BANKRUPT!`, icon: 'OUT', color: '#EF5350' };
    case 'GAME_OVER': return { text: `GAME OVER — ${e.winner}`, icon: 'WIN', color: '#FFD54F' };
    default: return { text: `${e.type}${p ? ` (${p})` : ''}`, icon: '...', color: '#888' };
  }
}

/* ================================================================== */
/*  MAIN PAGE                                                          */
/* ================================================================== */
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
  const [notification, setNotification] = useState<{ text: string; icon: string; color: string } | null>(null);
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const notifTimer = useRef<ReturnType<typeof setTimeout>>();
  const idleTimer = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    const gid = params.get('gameId');
    const gm = params.get('gm');
    if (gid) setGameId(gid);
    if (gm) setGmUrl(gm);
  }, [params]);

  // Idle chat every 12-20 seconds
  useEffect(() => {
    if (!connected || !snapshot) return;
    idleTimer.current = setInterval(() => {
      if (!snapshot) return;
      const alivePlayers = snapshot.players.filter(p => p.alive);
      if (alivePlayers.length === 0) return;
      const p = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
      if (Math.random() < 0.4) {
        setChatMsgs(prev => [...prev.slice(-60), { id: Date.now(), player: p.index, text: pickMsg('idle', PERSONALITIES[p.index]), ts: Date.now() }]);
      }
    }, 12000 + Math.random() * 8000);
    return () => clearInterval(idleTimer.current);
  }, [connected, snapshot]);

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
        // Generate chat
        for (const ev of msg.events) {
          const newChat = generateChatFromEvent(ev, msg.snapshot || null);
          if (newChat.length > 0) {
            newChat.forEach((cm, i) => {
              setTimeout(() => setChatMsgs(prev => [...prev.slice(-60), cm]), i * 300 + Math.random() * 200);
            });
          }
        }
        // Notification
        const notable = msg.events.find((ev: GameEvent) =>
          ['DICE_ROLLED', 'BOUGHT_PROPERTY', 'PAID_RENT', 'SENT_TO_JAIL', 'BANKRUPT', 'PASSED_GO'].includes(ev.type)
        ) || msg.events[0];
        if (notable) {
          setNotification(formatEvent(notable));
          clearTimeout(notifTimer.current);
          notifTimer.current = setTimeout(() => setNotification(null), 2400);
        }
      } else if (msg.type === 'gameEnded') {
        setSnapshot(msg.snapshot);
        setNotification({ text: `GAME OVER — P${msg.winner} WINS!`, icon: 'WIN', color: '#FFD54F' });
      }
    };
  }, [gameId, gmUrl]);

  const disconnect = useCallback(() => { wsRef.current?.close(); wsRef.current = null; setConnected(false); }, []);

  useEffect(() => { eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [events]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMsgs]);

  const propertyCounts = snapshot?.properties.reduce((acc, p) => {
    if (p.ownerIndex >= 0) acc[p.ownerIndex] = (acc[p.ownerIndex] || 0) + 1;
    return acc;
  }, {} as Record<number, number>) || {};

  /* ============ RENDER ============ */
  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', overflow: 'hidden', background: '#0C1B3A' }}>

      {/* ========== LEFT: AI CHAT ========== */}
      <div style={{
        width: 300, minWidth: 300, height: '100%', display: 'flex', flexDirection: 'column',
        background: 'linear-gradient(180deg, #0F1F40 0%, #0A1830 100%)',
        borderRight: '1px solid rgba(212,168,75,0.15)',
      }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(212,168,75,0.1)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#D4A84B' }}>Agent Chat</span>
          <span style={{ fontSize: 10, color: '#6B7280', marginLeft: 'auto' }}>{chatMsgs.length} msgs</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {chatMsgs.length === 0 && (
            <div style={{ color: '#3B4A6B', textAlign: 'center', padding: 30, fontSize: 13 }}>
              {connected ? 'Agents are thinking...' : 'Connect to see agent chat'}
            </div>
          )}
          {chatMsgs.map((m, i) => (
            <div key={i} style={{ animation: 'fadeInUp 0.3s ease', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: `${PLAYER_COLORS[m.player]}20`, border: `2px solid ${PLAYER_COLORS[m.player]}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
              }}>
                {PLAYER_EMOJIS[m.player]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: PLAYER_COLORS[m.player], marginBottom: 2 }}>{PLAYER_NAMES[m.player]}</div>
                <div style={{
                  fontSize: 12, color: '#C9D1DB', lineHeight: 1.45, padding: '6px 10px', borderRadius: '4px 12px 12px 12px',
                  background: `${PLAYER_COLORS[m.player]}10`, border: `1px solid ${PLAYER_COLORS[m.player]}15`,
                }}>
                  {m.text}
                </div>
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* ========== CENTER: 3D BOARD ========== */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <MonopolyScene snapshot={snapshot} latestEvents={latestEvents} />
        </div>

        {/* Top bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
          background: 'linear-gradient(to bottom, rgba(12,27,58,0.95), transparent)',
        }}>
          <a href="/" style={{ fontSize: 18, fontWeight: 900, color: '#D4A84B', textDecoration: 'none', letterSpacing: '-0.02em' }}>
            CLAW<span style={{ color: '#fff' }}>BOARD</span>
          </a>
          <div style={{ flex: 1 }} />
          <input placeholder="GM WS URL" value={gmUrl} onChange={(e) => setGmUrl(e.target.value)}
            style={{ width: 240, padding: '5px 8px', borderRadius: 6, fontSize: 11, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(212,168,75,0.15)', color: '#aaa', fontFamily: 'var(--font-mono)' }} />
          <input placeholder="Game ID" value={gameId} onChange={(e) => setGameId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && connect()}
            style={{ width: 65, padding: '5px 8px', borderRadius: 6, fontSize: 13, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(212,168,75,0.15)', color: '#fff', textAlign: 'center', fontFamily: 'var(--font-mono)' }} />
          <button onClick={connected ? disconnect : connect}
            style={{ padding: '5px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12, color: '#fff', background: connected ? '#C62828' : '#1565C0' }}>
            {connected ? 'Disconnect' : 'Watch'}
          </button>
          {connected && <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 800, background: '#2E7D32', color: '#fff', animation: 'livePulse 2s infinite' }}>LIVE</span>}
        </div>

        {/* Notification banner */}
        {notification && (
          <div style={{
            position: 'absolute', bottom: 50, left: '50%', transform: 'translateX(-50%)',
            zIndex: 20, pointerEvents: 'none', animation: 'fadeInUp 0.25s ease',
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 28px', borderRadius: 14,
            background: 'rgba(12,27,58,0.9)', backdropFilter: 'blur(12px)',
            border: `1.5px solid ${notification.color}40`,
            boxShadow: `0 0 30px ${notification.color}30`,
          }}>
            <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 5, background: `${notification.color}25`, color: notification.color, fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>
              {notification.icon}
            </span>
            <span style={{ fontSize: 17, fontWeight: 700, color: notification.color, letterSpacing: 0.3 }}>
              {notification.text}
            </span>
          </div>
        )}

        {/* Empty state */}
        {!snapshot && !connected && (
          <div style={{ position: 'absolute', bottom: 100, left: 0, right: 0, zIndex: 10, textAlign: 'center', pointerEvents: 'none' }}>
            <div style={{ fontSize: 22, color: '#D4A84B', fontWeight: 800, marginBottom: 8, textShadow: '0 0 20px rgba(212,168,75,0.3)' }}>
              Enter a Game ID and click Watch
            </div>
            <div style={{ fontSize: 14, color: '#5A6B8A' }}>The 3D board will come alive with a live game</div>
          </div>
        )}
      </div>

      {/* ========== RIGHT: HUD ========== */}
      <div style={{
        width: 290, minWidth: 290, height: '100%', display: 'flex', flexDirection: 'column', gap: 6,
        padding: '52px 10px 10px', overflowY: 'auto',
        background: 'linear-gradient(180deg, #0F1F40 0%, #0A1830 100%)',
        borderLeft: '1px solid rgba(212,168,75,0.15)',
      }}>
        {/* Game status */}
        {snapshot && (
          <div style={{ borderRadius: 10, padding: '8px 12px', background: 'rgba(212,168,75,0.06)', border: '1px solid rgba(212,168,75,0.12)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6B7280' }}>
              <span>Round {snapshot.round}</span>
              <span>Turn {snapshot.turn}</span>
              <span>{snapshot.aliveCount}/4 alive</span>
            </div>
            {snapshot.lastDice && (
              <div style={{
                textAlign: 'center', fontSize: 28, fontWeight: 900, letterSpacing: 3, padding: '4px 0',
                color: snapshot.lastDice.isDoubles ? '#FFD54F' : '#fff',
                textShadow: snapshot.lastDice.isDoubles ? '0 0 16px #FFD54F' : 'none',
              }}>
                {snapshot.lastDice.d1} + {snapshot.lastDice.d2} = {snapshot.lastDice.sum}
                {snapshot.lastDice.isDoubles && <span style={{ fontSize: 12, marginLeft: 8, color: '#FFD54F' }}>DOUBLES</span>}
              </div>
            )}
            {snapshot.winner >= 0 && (
              <div style={{ padding: 10, borderRadius: 8, textAlign: 'center', marginTop: 4, background: 'linear-gradient(135deg, #1B5E20, #2E7D32)', fontSize: 15, fontWeight: 900, letterSpacing: 1, color: '#fff' }}>
                WINNER: {PLAYER_EMOJIS[snapshot.winner]} {PLAYER_NAMES[snapshot.winner]}
              </div>
            )}
          </div>
        )}

        {/* Player cards */}
        {snapshot?.players.map((p) => (
          <div key={p.index} style={{
            borderRadius: 10, padding: '8px 12px', opacity: p.alive ? 1 : 0.35,
            background: p.index === snapshot.currentPlayerIndex ? `${PLAYER_COLORS[p.index]}12` : 'rgba(255,255,255,0.02)',
            border: `1px solid ${p.index === snapshot.currentPlayerIndex ? `${PLAYER_COLORS[p.index]}40` : 'rgba(255,255,255,0.05)'}`,
            borderLeft: `3px solid ${PLAYER_COLORS[p.index]}`,
            transition: 'all 0.3s ease',
            boxShadow: p.index === snapshot.currentPlayerIndex ? `0 0 15px ${PLAYER_COLORS[p.index]}15` : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <span style={{ fontSize: 18 }}>{PLAYER_EMOJIS[p.index]}</span>
              <span style={{ fontWeight: 800, fontSize: 13, color: PLAYER_COLORS[p.index] }}>{PLAYER_NAMES[p.index]}</span>
              {p.index === snapshot.currentPlayerIndex && p.alive && (
                <span style={{ marginLeft: 'auto', fontSize: 9, padding: '1px 6px', borderRadius: 3, background: PLAYER_COLORS[p.index], color: '#000', fontWeight: 800 }}>TURN</span>
              )}
              {!p.alive && (
                <span style={{ marginLeft: 'auto', fontSize: 9, padding: '1px 6px', borderRadius: 3, background: '#C62828', color: '#fff', fontWeight: 800 }}>OUT</span>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ fontWeight: 700, color: '#E8E8E8', fontFamily: 'var(--font-mono)' }}>${p.cash.toLocaleString()}</span>
              <span style={{ color: '#7B8AA0', fontSize: 11 }}>{p.tileName || TILE_DATA[p.position]?.name}</span>
            </div>
            <div style={{ fontSize: 9, color: '#5A6B8A', marginTop: 2, display: 'flex', gap: 8 }}>
              <span>{propertyCounts[p.index] || 0} properties</span>
              {p.inJail && <span style={{ color: '#FF8A65' }}>JAIL ({p.jailTurns}/3)</span>}
            </div>
          </div>
        ))}

        {/* Event log */}
        <div style={{ borderRadius: 10, padding: '8px 12px', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', minHeight: 80 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#4A5568', marginBottom: 4, letterSpacing: 1.5 }}>EVENT LOG</div>
          <div style={{ flex: 1, overflowY: 'auto', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
            {events.length === 0 && <div style={{ color: '#3B4A6B', padding: 12, textAlign: 'center' }}>{connected ? 'Waiting...' : 'Connect to spectate'}</div>}
            {events.slice(-40).map((e, i) => {
              const fmt = formatEvent(e);
              return (
                <div key={i} style={{ padding: '2px 0', color: '#7B8AA0', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                  <span style={{ color: fmt.color, fontWeight: 600 }}>[{fmt.icon}]</span> {fmt.text}
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
