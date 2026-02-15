'use client';

import { Suspense, useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { PLAYER_COLORS, PLAYER_NAMES, PLAYER_EMOJIS, TILE_DATA, GROUP_COLORS, getPropertyNameByIndex } from '@/lib/boardPositions';
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
interface PropertyInfo { index: number; tileName: string; ownerIndex: number; mortgaged: boolean; houses: number; }
interface Snapshot {
  status: string; phase: string; turn: number; round: number;
  currentPlayerIndex: number; aliveCount: number;
  players: PlayerInfo[]; properties: PropertyInfo[];
  lastDice: { d1: number; d2: number; sum: number; isDoubles: boolean } | null;
  auction: any; winner: number;
}
interface GameEvent { type: string; [key: string]: any; }

/* Tile lookup by position */
const TILE_BY_POS: Record<number, typeof TILE_DATA[0]> = {};
TILE_DATA.forEach(t => { TILE_BY_POS[t.position] = t; });

/* Timing: match MonopolyScene so rent/tax/card happen after dice + piece lands */
const DICE_ANIM_MS = 1500;
const MOVE_DELAY_MS = 1400;
const HOP_MS = 170;

function getLandDelayMs(evts: GameEvent[]): number {
  const playerMoved = evts.find((e: GameEvent) => e.type === 'playerMoved');
  if (!playerMoved) return 0;
  const dest = playerMoved.to ?? playerMoved.newPosition;
  const spaces = playerMoved.from !== undefined && dest !== undefined
    ? Math.min((dest - playerMoved.from + 40) % 40, 12)
    : 0;
  return DICE_ANIM_MS + MOVE_DELAY_MS + spaces * HOP_MS + 400;
}

/* ---------------------------------------------------------------- */
/*  Mood emoji system — uses engine camelCase event types            */
/* ---------------------------------------------------------------- */
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

/* ---------------------------------------------------------------- */
/*  Human-readable event text — engine camelCase types               */
/* ---------------------------------------------------------------- */
function truncateAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

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
      return { text: `\u2728 ${emoji} ${n} passed GO and collected $${e.amount || 100}!`, color: '#66BB6A' };
    case 'propertyBought': {
      const name = e.tileName ?? (e.propertyIndex != null ? getPropertyNameByIndex(e.propertyIndex) : '');
      return { text: `\uD83C\uDFE0 ${emoji} ${n} bought ${name} for $${e.price ?? 0}!`, color: pc };
    }
    case 'propertyDeclined': {
      const name = e.tileName ?? (e.propertyIndex != null ? getPropertyNameByIndex(e.propertyIndex) : '');
      return { text: `${emoji} ${n} passed on ${name}`, color: '#888' };
    }
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
    case 'freedFromJail': {
      const method = e.method === 'fee' ? 'by paying the $50 fee' : e.method === 'doubles' ? 'by rolling doubles!' : 'after 3 turns';
      return { text: `\uD83D\uDD13 ${emoji} ${n} got out of jail ${method}`, color: '#66BB6A' };
    }
    case 'stayedInJail':
      return { text: `\uD83D\uDD12 ${emoji} ${n} didn't roll doubles \u2014 staying in jail`, color: '#FF9800' };
    case 'playerBankrupt':
      return { text: `\uD83D\uDCA5 ${emoji} ${n} went BANKRUPT!`, color: '#EF5350' };
    case 'gameEnded':
      return { text: `\uD83C\uDFC6 GAME OVER \u2014 ${e.winner !== undefined ? `${PLAYER_EMOJIS[e.winner]} ${PLAYER_NAMES[e.winner]}` : 'Unknown'} wins!`, color: '#FFD54F' };
    case 'auctionStarted': {
      const aucName = e.tileName ?? (e.propertyIndex != null ? getPropertyNameByIndex(e.propertyIndex) : '');
      return { text: `\uD83D\uDD28 Auction started for ${aucName}!`, color: '#AB47BC' };
    }
    case 'auctionEnded': {
      const aucName = e.tileName ?? (e.propertyIndex != null ? getPropertyNameByIndex(e.propertyIndex) : '');
      const winnerName = e.winner !== undefined ? PLAYER_NAMES[e.winner] : '?';
      const winnerEmoji = e.winner !== undefined ? PLAYER_EMOJIS[e.winner] : '';
      const raw = e.amount ?? e.price ?? (e as GameEvent & { highBid?: number }).highBid ?? 0;
      const winningAmount = typeof raw === 'number' && !Number.isNaN(raw) ? raw : 0;
      return { text: `\uD83D\uDD28 ${winnerEmoji} ${winnerName} won ${aucName} for $${winningAmount}!`, color: '#AB47BC' };
    }
    case 'turnStarted':
      return { text: `\uD83D\uDCCD ${emoji} ${n}'s turn (Round ${e.round ?? ''})`, color: pc };
    case 'turnEnded':
      return { text: `\u23F8 ${emoji} ${n} ended their turn`, color: pc };
    case 'gameStarted':
      return { text: `\uD83C\uDFC1 Game started!`, color: '#66BB6A' };
    case 'cashChange':
      return { text: `${emoji} ${n} ${(e.amount ?? 0) >= 0 ? 'received' : 'paid'} $${Math.abs(e.amount ?? 0)} \u2014 ${e.reason || ''}`, color: (e.amount ?? 0) >= 0 ? '#66BB6A' : '#EF5350' };
    case 'auctionEndedNoBids': {
      const noBidName = e.tileName ?? (e.propertyIndex != null ? getPropertyNameByIndex(e.propertyIndex) : '');
      return { text: `\uD83D\uDD28 No bids for ${noBidName} \u2014 back to bank`, color: '#AB47BC' };
    }
    case 'bidPlaced': {
      const bidName = e.propertyIndex != null ? getPropertyNameByIndex(e.propertyIndex) : '';
      const bidderN = e.player !== undefined ? PLAYER_NAMES[e.player] : '?';
      const bidderE = e.player !== undefined ? PLAYER_EMOJIS[e.player] : '';
      return { text: `\uD83D\uDD28 ${bidderE} ${bidderN} bid $${e.amount ?? 0} on ${bidName}`, color: '#AB47BC' };
    }
    case 'propertyMortgaged': {
      const mortName = e.propertyIndex != null ? getPropertyNameByIndex(e.propertyIndex) : '';
      return { text: `\uD83D\uDCB3 ${emoji} ${n} mortgaged ${mortName} for $${e.value ?? 0}`, color: '#FF9100' };
    }
    case 'propertyUnmortgaged': {
      const unmortName = e.propertyIndex != null ? getPropertyNameByIndex(e.propertyIndex) : '';
      return { text: `\uD83D\uDCB3 ${emoji} ${n} unmortgaged ${unmortName} for $${e.cost ?? 0}`, color: '#66BB6A' };
    }
    case 'autoMortgage': {
      const autoName = e.propertyIndex != null ? getPropertyNameByIndex(e.propertyIndex) : '';
      return { text: `\uD83D\uDCB3 ${emoji} ${n} auto-mortgaged ${autoName} to pay debt`, color: '#EF5350' };
    }
    case 'houseBuilt': {
      const houseName = ((e as GameEvent & { tileName?: string }).tileName ?? (e.propertyIndex != null ? getPropertyNameByIndex(e.propertyIndex) : '')) || 'a property';
      return { text: `\uD83C\uDFE0 House built at ${houseName} by ${n} (${e.newCount ?? 0} house${(e.newCount ?? 0) === 1 ? '' : 's'} now)`, color: '#66BB6A' };
    }
    case 'houseSold': {
      const soldName = ((e as GameEvent & { tileName?: string }).tileName ?? (e.propertyIndex != null ? getPropertyNameByIndex(e.propertyIndex) : '')) || 'a property';
      return { text: `\uD83C\uDFE0 House sold at ${soldName} by ${n} (${e.newCount ?? 0} left)`, color: '#FF9100' };
    }
    case 'landedOnGo':
      return { text: `\u2728 ${emoji} ${n} landed on GO and collected $${e.amount ?? 100}!`, color: '#66BB6A' };
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

function gmWsToRest(wsUrl: string): string {
  try {
    const u = wsUrl.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
    return u.replace(/\/ws\/?$/, '') || u;
  } catch {
    return 'https://clawboardgames-gm.onrender.com';
  }
}

function WatchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [gmUrl, setGmUrl] = useState(process.env.NEXT_PUBLIC_GM_WS_URL || 'wss://clawboardgames-gm.onrender.com/ws');
  const [gameId, setGameId] = useState(searchParams.get('gameId') || '');
  const [openLobbies, setOpenLobbies] = useState<number[]>([]);
  const [slotDetails, setSlotDetails] = useState<{ id: number; status: string; playerCount?: number; disconnected?: boolean }[]>([]);
  const [settlementAddress, setSettlementAddress] = useState<string | null>(null);
  const [activeGameIds, setActiveGameIds] = useState<number[]>([]);
  const [lobbiesLoading, setLobbiesLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  // Redirect /watch?gameId=5 → /watch/lobby/5 so the slug is /watch/lobby/{gameId}
  useEffect(() => {
    const gid = searchParams.get('gameId');
    const gm = searchParams.get('gm');
    if (gid) {
      router.replace(`/watch/lobby/${gid}`);
      return;
    }
    if (gm) setGmUrl(gm);
  }, [searchParams, router]);

  useEffect(() => { sfx.muted = muted; }, [muted]);

  const SLOT_COUNT = 10;

  // Fetch health, open games, active games. Always show fixed SLOT_COUNT slots (0..9); empty = dotted "Empty".
  useEffect(() => {
    if (gameId) return;
    setLobbiesLoading(true);
    const restUrl = process.env.NEXT_PUBLIC_GM_REST_URL || gmWsToRest(gmUrl);
    Promise.all([
      fetch(`${restUrl}/health`).then((r) => r.ok ? r.json() : {}),
      fetch(`${restUrl}/games/slots`).then((r) => r.ok ? r.json() : { slots: null }),
      fetch(`${restUrl}/games/open`).then((r) => r.json()),
      fetch(`${restUrl}/games`).then((r) => r.ok ? r.json() : { games: [] }),
    ])
      .then(([healthData, slotsData, openData, gamesData]: [
        { settlementAddress?: string },
        { slots?: { id: number; status: string; playerCount?: number }[] } | null,
        { open?: number[] },
        { games?: number[]; disconnected?: number[] },
      ]) => {
        const openList = Array.isArray(openData?.open) ? openData.open : (openData as { games?: number[] })?.games ?? [];
        const activeList = Array.isArray(gamesData?.games) ? gamesData.games : [];
        const disconnectedSet = new Set(Array.isArray(gamesData?.disconnected) ? gamesData.disconnected : []);
        setSettlementAddress(healthData?.settlementAddress ?? null);
        setOpenLobbies(openList);
        setActiveGameIds(activeList);
        const slots = slotsData?.slots && Array.isArray(slotsData.slots) ? slotsData.slots : null;
        let filled: { id: number; status: string; playerCount?: number; disconnected?: boolean }[];
        if (slots && slots.length > 0) {
          const slotIds = new Set(slots.map((s: { id: number }) => s.id));
          const activeOnly = activeList.filter((id: number) => !slotIds.has(id));
          const activeSlots = activeOnly.map((id: number) => ({ id, status: 'active' as const, disconnected: disconnectedSet.has(id) }));
          filled = [...slots, ...activeSlots].sort((a, b) => a.id - b.id);
        } else {
          const openSlots = openList.map((id: number) => ({ id, status: 'open' as const }));
          const activeOnly = activeList.filter((id: number) => !openList.includes(id));
          const activeSlots = activeOnly.map((id: number) => ({ id, status: 'active' as const, disconnected: disconnectedSet.has(id) }));
          filled = [...openSlots, ...activeSlots].sort((a, b) => a.id - b.id);
        }
        // Show actual open/active slots (up to SLOT_COUNT), not a fixed 0..9 grid.
        // This avoids "No game" for indices 5,7 when open IDs are e.g. [0,1,2,3,4,6,8,9,10,11].
        const tenSlots =
          filled.length >= SLOT_COUNT
            ? filled.slice(0, SLOT_COUNT)
            : [...filled, ...Array.from({ length: SLOT_COUNT - filled.length }, (_, i) => ({ id: 1000 + i, status: 'empty' as const }))];
        setSlotDetails(tenSlots);
      })
      .catch(() => {
        setSettlementAddress(null);
        setOpenLobbies([]);
        setActiveGameIds([]);
        setSlotDetails(Array.from({ length: SLOT_COUNT }, (_, i) => ({ id: i, status: 'empty' as const })));
      })
      .finally(() => setLobbiesLoading(false));
  }, [gameId, gmUrl]);

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

  function playSounds(evts: GameEvent[], delayLandingMs: number = 0) {
    const playNow = (ev: GameEvent) => {
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
    };
    for (const ev of evts) {
      const isAfterLand = ev.type === 'rentPaid' || ev.type === 'taxPaid' || ev.type === 'cardDrawn' || ev.type === 'passedGo';
      if (isAfterLand && delayLandingMs > 0) {
        setTimeout(() => playNow(ev), delayLandingMs);
      } else {
        playNow(ev);
      }
    }
  }

  const connect = useCallback((id?: string | number) => {
    const gid = id !== undefined ? String(id) : gameId;
    if (!gid) return;
    disconnect();
    setGameId(gid);
    sfx.init();
    const ws = new WebSocket(`${gmUrl}?gameId=${gid}`);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'snapshot') {
        setSnapshot(msg.snapshot);
      } else if (msg.type === 'events') {
        // Update 3D scene immediately so dice rolls first; add to game log after dice animation finishes
        setLatestEvents(msg.events);
        updateMoods(msg.events);
        setTimeout(() => {
          setEvents(prev => [...prev.slice(-300), ...msg.events]);
        }, DICE_ANIM_MS);

        const landDelayMs = getLandDelayMs(msg.events);
        playSounds(msg.events, landDelayMs);

        // Card display — after piece lands so dice roll + movement are shown first
        const cardEv = msg.events.find((e: GameEvent) => e.type === 'cardDrawn');
        if (cardEv) {
          setTimeout(() => {
            setActiveCard({ text: cardEv.description || 'Card drawn', type: (cardEv.deck || cardEv.cardType) === 'chance' ? 'chance' : 'community' });
            setTimeout(() => setActiveCard(null), 3500);
          }, landDelayMs);
        }

        // Show dice roll (or move) announcement first; landing events (rent/card/tax) after delay
        const diceEv = msg.events.find((e: GameEvent) => e.type === 'diceRolled');
        const moveEv = msg.events.find((e: GameEvent) => e.type === 'playerMoved');
        const stayedInJailEv = msg.events.find((e: GameEvent) => e.type === 'stayedInJail');
        const landingEv = msg.events.find((e: GameEvent) =>
          ['rentPaid', 'taxPaid', 'cardDrawn', 'passedGo', 'propertyBought', 'propertyDeclined'].includes(e.type));
        let firstNotif = diceEv ? humanEvent(diceEv) : (moveEv ? humanEvent(moveEv) : landingEv ? humanEvent(landingEv) : null);
        if (firstNotif && diceEv && stayedInJailEv && stayedInJailEv.player === diceEv.player) {
          firstNotif = { ...firstNotif, text: firstNotif.text + ' \u2014 Unable to escape jail' };
        }
        if (firstNotif) {
          setNotification(firstNotif);
          clearTimeout(notifTimer.current);
          notifTimer.current = setTimeout(() => setNotification(null), 2600);
        }
        if (landingEv && (diceEv || moveEv) && humanEvent(landingEv).text) {
          clearTimeout(notifTimer.current);
          notifTimer.current = setTimeout(() => {
            setNotification(humanEvent(landingEv));
            notifTimer.current = setTimeout(() => setNotification(null), 2600);
          }, landDelayMs);
        }
        // Auction progress: show auctionStarted, each bidPlaced, then auctionEnded/auctionEndedNoBids in sequence
        const auctionTypes = ['auctionStarted', 'bidPlaced', 'auctionEnded', 'auctionEndedNoBids'];
        const auctionEvts = msg.events.filter((e: GameEvent) => auctionTypes.includes(e.type));
        const TOAST_MS = 2600;
        const scheduleToasts = (evts: GameEvent[], startDelayMs: number) => {
          evts.forEach((e: GameEvent, i: number) => {
            setTimeout(() => {
              const h = humanEvent(e);
              if (h.text) {
                setNotification(h);
                notifTimer.current = setTimeout(() => setNotification(null), TOAST_MS);
              }
            }, startDelayMs + i * TOAST_MS);
          });
        };
        if (auctionEvts.length > 0) {
          clearTimeout(notifTimer.current);
          scheduleToasts(auctionEvts, firstNotif ? TOAST_MS : 0); // if something else is showing first, show auction after
        }
        // House built/sold: show toasts when no dice/move/landing (e.g. post-turn build/sell)
        const houseEvts = msg.events.filter((e: GameEvent) => e.type === 'houseBuilt' || e.type === 'houseSold');
        if (houseEvts.length > 0 && !firstNotif && auctionEvts.length === 0) {
          clearTimeout(notifTimer.current);
          scheduleToasts(houseEvts, 0);
        } else if (houseEvts.length > 0 && !firstNotif && auctionEvts.length > 0) {
          // auction and house in same batch (unusual): show auction first, then house
          scheduleToasts(houseEvts, auctionEvts.length * TOAST_MS);
        }
      } else if (msg.type === 'gameEnded') {
        setSnapshot(msg.snapshot);
        setNotification({ text: `\uD83C\uDFC6 GAME OVER \u2014 ${PLAYER_NAMES[msg.winner] || 'P' + msg.winner} wins!`, color: '#FFD54F' });
      }
    };
  }, [gameId, gmUrl]);

  const connectToLobby = useCallback((lobbyId: number) => {
    setGameId(String(lobbyId));
    connect(lobbyId);
  }, [connect]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
    // Return to lobby selection view: clear game so the lobby picker overlay shows again
    setGameId('');
    setSnapshot(null);
    setEvents([]);
    setLatestEvents([]);
    setNotification(null);
    setActiveCard(null);
    setMoods({ 0: DEFAULT_MOOD, 1: DEFAULT_MOOD, 2: DEFAULT_MOOD, 3: DEFAULT_MOOD });
  }, []);
  useEffect(() => { eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [events]);

  /* Build per-player property list (name, color, houses 0–4; only color groups 1–8 can have houses) */
  const playerProps: Record<number, { name: string; color: string; houses: number }[]> = {};
  if (snapshot) {
    for (const prop of snapshot.properties) {
      if (prop.ownerIndex < 0) continue;
      if (!playerProps[prop.ownerIndex]) playerProps[prop.ownerIndex] = [];
      const tile = TILE_DATA.find(t => t.name === prop.tileName);
      const gc = tile ? GROUP_COLORS[tile.group] || '#888' : '#888';
      const short = prop.tileName?.replace(' Avenue', '').replace(' Place', ' Pl').replace(' Gardens', ' Gdn').split(' ').slice(0, 2).join(' ') || '?';
      const houses = (prop as { houses?: number }).houses ?? 0;
      playerProps[prop.ownerIndex].push({ name: short, color: gc, houses });
    }
  }

  const slotsToShow = slotDetails.length > 0 ? slotDetails : Array.from({ length: SLOT_COUNT }, (_, i) => ({ id: i, status: 'empty' as const }));

  return (
    <div className="watch-layout">
      {/* ===== CENTER: 3D BOARD (always visible) ===== */}
      <div className="watch-center">
        <div style={{ position: 'absolute', inset: 0 }}>
          <MonopolyScene snapshot={snapshot} latestEvents={latestEvents} activeCard={activeCard} />
        </div>

        {/* Top bar — responsive: hide inputs on small screens, show menu toggle */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '10px 16px',
          background: 'linear-gradient(to bottom, rgba(12,27,58,0.92), transparent)',
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{ flex: 1 }} />
          {connected && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }} title="Click on the board while holding Ctrl to move the camera orbit center there">
              Tip: Ctrl+click to move board center
            </span>
          )}
          <div className={`watch-topbar-inputs ${mobileMenuOpen ? 'mobile-open' : ''}`} style={{ gap: 8 }}>
            <input placeholder="GM WS URL" value={gmUrl} onChange={(e) => setGmUrl(e.target.value)}
              style={{ width: 200, padding: '6px 10px', borderRadius: 8, fontSize: 11, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(212,168,75,0.2)', color: '#aaa', fontFamily: 'var(--font-mono)' }} />
            <input placeholder="Game ID" value={gameId} onChange={(e) => setGameId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && connect()}
              style={{ width: 56, padding: '6px 8px', borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(212,168,75,0.2)', color: '#fff', textAlign: 'center', fontFamily: 'var(--font-mono)' }} />
          </div>
          <button onClick={connected ? () => disconnect() : () => { if (gameId) router.push(`/watch/lobby/${gameId}`); else connect(); }}
            style={{ padding: '6px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#fff', background: connected ? '#C62828' : '#1565C0', boxShadow: connected ? 'none' : '0 2px 12px rgba(21,101,192,0.4)' }}>
            {connected ? 'Disconnect' : 'Watch'}
          </button>
          {connected && <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 800, background: '#2E7D32', color: '#fff', animation: 'livePulse 2s infinite' }}>LIVE</span>}
          <button onClick={() => setMuted(m => !m)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(212,168,75,0.2)', background: 'rgba(255,255,255,0.06)', cursor: 'pointer', fontSize: 18 }}>
            {muted ? '\u{1F507}' : '\u{1F50A}'}
          </button>
          <button type="button" aria-label="Toggle menu" onClick={() => setMobileMenuOpen((o) => !o)}
            style={{ padding: 8, borderRadius: 8, border: '1px solid rgba(212,168,75,0.2)', background: 'rgba(255,255,255,0.06)', cursor: 'pointer', fontSize: 18 }}
            className="watch-mobile-menu-btn">
            {mobileMenuOpen ? '\u2715' : '\u2630'}
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

        {/* Lobby picker overlay */}
        {!gameId && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 15, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(160deg, rgba(12,27,58,0.72) 0%, rgba(8,18,38,0.88) 100%)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', padding: 28,
          }}>
            <Link href="/" style={{ position: 'absolute', top: 28, left: 28, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: '#fff', textDecoration: 'none', padding: '12px 20px', borderRadius: 10, background: '#CC5500', border: '1px solid rgba(204,85,0,0.5)', boxShadow: '0 4px 14px rgba(204,85,0,0.25)', transition: 'transform 0.2s, box-shadow 0.2s' }}>
              <span style={{ fontSize: 18 }}>←</span> Back to Home
            </Link>
            <div style={{
              maxWidth: 640, width: '100%', padding: '40px 36px 36px', borderRadius: 28,
              background: 'linear-gradient(165deg, rgba(20,40,75,0.96) 0%, rgba(12,25,50,0.98) 100%)',
              border: '1px solid rgba(212,168,75,0.28)',
              boxShadow: '0 40px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06), 0 0 120px rgba(212,168,75,0.06)',
            }}>
              <div style={{ textAlign: 'center', marginBottom: 28 }}>
                <div style={{ fontSize: 40, marginBottom: 12, lineHeight: 1, filter: 'drop-shadow(0 2px 8px rgba(212,168,75,0.3))' }}>👀</div>
                <h1 style={{
                  fontFamily: "'Syne', sans-serif", fontSize: 'clamp(24px, 5vw, 30px)', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 10,
                  background: 'linear-gradient(135deg, #fff 0%, #D4A84B 80%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                }}>
                  Choose a lobby to spectate
                </h1>
                <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.75)', lineHeight: 1.55, maxWidth: 420, margin: '0 auto' }}>
                  Pick a lobby below — the 3D board loads as soon as you connect.
                </p>
                {settlementAddress && (
                  <p style={{ marginTop: 14, marginBottom: 0, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 0.5 }}>
                    Contract <span style={{ color: 'rgba(212,168,75,0.85)' }}>{truncateAddress(settlementAddress)}</span>
                  </p>
                )}
              </div>
              {lobbiesLoading ? (
                <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: 15 }}>
                  <div style={{ display: 'inline-block', width: 36, height: 36, border: '3px solid rgba(212,168,75,0.25)', borderTopColor: '#D4A84B', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  <div style={{ marginTop: 14, fontWeight: 500 }}>Loading lobbies...</div>
                </div>
              ) : (
                <div className="watch-lobby-grid" style={{
                  display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 18, marginTop: 28,
                }}>
                  {slotsToShow.map((slot) => {
                    const isEmpty = slot.status === 'empty';
                    if (isEmpty) {
                      const isPlaceholder = slot.id >= 1000;
                      return (
                        <div
                          key={slot.id}
                          className="watch-lobby-card"
                          style={{
                            padding: '24px 16px', borderRadius: 22,
                            border: '1px dashed rgba(255,255,255,0.08)', background: 'linear-gradient(160deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.12) 100%)',
                            color: 'var(--text-muted)', textAlign: 'center', opacity: 0.7,
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
                            minHeight: 120, cursor: 'default', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
                          }}
                        >
                          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.4, color: 'rgba(255,255,255,0.35)' }}>
                            {isPlaceholder ? '—' : `LOBBY ${slot.id}`}
                          </span>
                          <span style={{ width: 24, height: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 1 }} />
                          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
                            {isPlaceholder ? 'Empty' : 'No game'}
                          </span>
                        </div>
                      );
                    }
                    const isWaiting = slot.status === 'waiting';
                    const isActive = slot.status === 'active';
                    const isDisconnected = isActive && slot.disconnected === true;
                    const count = 'playerCount' in slot ? (slot.playerCount ?? 0) : undefined;
                    const statusColor = isDisconnected ? '#94a3b8' : isActive ? '#22c55e' : isWaiting ? '#f59e0b' : '#06b6d4';
                    const statusLabel = isActive
                      ? (isDisconnected ? 'Disconnected' : 'Live now')
                      : isWaiting && count !== undefined
                        ? `${count}/4 players${count >= 4 ? ' — full' : ''}`
                        : count !== undefined
                          ? `${count}/4 players`
                          : 'Open to join';
                    const statusIcon = isDisconnected ? '⚪' : isActive ? '🔴' : isWaiting || count !== undefined ? '👥' : '✨';
                    return (
                      <button
                        key={slot.id}
                        onClick={() => router.push(`/watch/lobby/${slot.id}`)}
                        className="watch-lobby-card"
                        type="button"
                        style={{
                          padding: '24px 16px', borderRadius: 22,
                          border: `1px solid ${statusColor}50`,
                          background: `linear-gradient(165deg, ${statusColor}18 0%, ${statusColor}06 35%, rgba(0,0,0,0.25) 100%)`,
                          color: '#fff', cursor: 'pointer', textAlign: 'center',
                          fontFamily: 'var(--font-display)', transition: 'all 0.35s cubic-bezier(0.4,0,0.2,1)',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
                          minHeight: 120,
                          position: 'relative' as const,
                          overflow: 'hidden',
                          boxShadow: `0 6px 28px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05) inset, 0 0 24px ${statusColor}12`,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-4px) scale(1.015)';
                          e.currentTarget.style.boxShadow = `0 16px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08) inset, 0 0 32px ${statusColor}25, 0 0 48px ${statusColor}08`;
                          e.currentTarget.style.borderColor = `${statusColor}99`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0) scale(1)';
                          e.currentTarget.style.boxShadow = `0 6px 28px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05) inset, 0 0 24px ${statusColor}12`;
                          e.currentTarget.style.borderColor = `${statusColor}50`;
                        }}
                      >
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${statusColor}40, transparent)`, opacity: 0.9 }} />
                        <span style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.45)', letterSpacing: 1.4 }}>LOBBY {slot.id}</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: statusColor, letterSpacing: 0.3 }}>
                          <span style={{ fontSize: 15, lineHeight: 1 }}>{statusIcon}</span>
                          <span>{statusLabel}</span>
                        </span>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 500, letterSpacing: 0.5 }}>
                          {isDisconnected ? 'Disconnected' : 'Click to spectate'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <p style={{ marginTop: 28, fontSize: 13, color: 'var(--text-muted-soft)', textAlign: 'center' }}>
                Or open <code style={{ background: 'rgba(255,255,255,0.06)', padding: '4px 10px', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 12 }}>/watch/lobby/5</code> to jump to game 5
              </p>
            </div>
          </div>
        )}
        {gameId && !snapshot && !connected && (
          <div style={{ position: 'absolute', bottom: 100, left: 0, right: 0, zIndex: 10, textAlign: 'center', pointerEvents: 'none' }}>
            <div style={{ fontSize: 22, color: '#D4A84B', fontWeight: 800, marginBottom: 8 }}>Connecting to game {gameId}...</div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>The 3D board will come alive when connected</div>
          </div>
        )}
      </div>

      {/* ===== RIGHT: HUD (below board on mobile) ===== */}
      <div className="watch-hud">
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

        {/* Player cards with properties */}
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
              <div style={{
                width: 38, height: 38, borderRadius: '50%', flexShrink: 0, position: 'relative',
                background: `${PLAYER_COLORS[p.index]}20`, border: `2px solid ${PLAYER_COLORS[p.index]}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
              }}>
                {PLAYER_EMOJIS[p.index]}
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
                <div style={{ fontSize: 11, color: '#7B8AA0', marginTop: 1 }}>{p.tileName || TILE_BY_POS[p.position]?.name}</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, paddingLeft: 46 }}>
              <span style={{ fontWeight: 700, color: '#E8E8E8', fontFamily: 'var(--font-mono)', fontSize: 15 }}>${p.cash.toLocaleString()}</span>
              {p.inJail && <span style={{ fontSize: 10, color: '#FF8A65' }}>JAIL ({p.jailTurns}/3)</span>}
            </div>
            {/* Owned properties */}
            {playerProps[p.index] && playerProps[p.index].length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, paddingLeft: 46, marginTop: 4 }}>
                {playerProps[p.index].map((pr, j) => (
                  <span key={j} style={{
                    fontSize: 8, padding: '1px 5px', borderRadius: 3, lineHeight: 1.3,
                    background: `${pr.color}20`, border: `1px solid ${pr.color}40`, color: pr.color,
                    display: 'inline-flex', alignItems: 'center', gap: 2,
                  }}>
                    {pr.name}
                    {pr.houses > 0 && (
                      <span style={{ fontSize: 7, opacity: 0.95, fontWeight: 700 }} title={pr.houses === 4 ? '4 houses (hotel)' : `${pr.houses} house${pr.houses === 1 ? '' : 's'}`}>
                        {pr.houses === 4 ? 'H' : pr.houses}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Event log — human-readable */}
        <div style={{ borderRadius: 12, padding: '12px 14px', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(212,168,75,0.1)', minHeight: 80 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', marginBottom: 8, letterSpacing: 1.2 }}>GAME LOG</div>
          <div style={{ flex: 1, overflowY: 'auto', fontSize: 11 }}>
            {events.length === 0 && (
              <div style={{
                color: 'var(--text-muted)', padding: 20, textAlign: 'center', fontSize: 12, lineHeight: 1.6,
                background: 'rgba(212,168,75,0.04)', borderRadius: 8, border: '1px dashed rgba(212,168,75,0.15)',
              }}>
                {connected ? (
                  <>Waiting for game events…</>
                ) : (
                  <>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>👀</div>
                    <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Pick a lobby to watch</div>
                    <div>Events will stream here once you’re connected.</div>
                  </>
                )}
              </div>
            )}
            {events.slice(-50).map((e, i) => {
              const h = humanEvent(e);
              if (!h.text) return null; // skip minor events
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
