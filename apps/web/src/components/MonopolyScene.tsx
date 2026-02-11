'use client';

import { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Text, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import {
  BOARD_POSITIONS, TILE_DATA, GROUP_COLORS,
  PLAYER_COLORS, TOKEN_OFFSETS, PROPERTY_TO_TILE,
  getTileEdge,
} from '@/lib/boardPositions';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */
interface PlayerInfo {
  index: number; address: string; cash: number; position: number;
  tileName: string; inJail: boolean; jailTurns: number; alive: boolean;
}
interface PropertyInfo {
  index: number; tileName: string; ownerIndex: number; mortgaged: boolean;
}
export interface Snapshot {
  status: string; phase: string; turn: number; round: number;
  currentPlayerIndex: number; aliveCount: number;
  players: PlayerInfo[]; properties: PropertyInfo[];
  lastDice: { d1: number; d2: number; sum: number; isDoubles: boolean } | null;
  auction: any; winner: number;
}
export interface GameEvent { type: string; [key: string]: any; }

const SHAPES = ['diamond', 'crown', 'ring', 'crystal'] as const;
const TOKEN_Y = 0.45; // height above board
const HOP_MS = 170; // ms per tile when hopping

/* ================================================================== */
/*  BOARD — Thick, detailed, with gold trim                            */
/* ================================================================== */
function GameBoard({ propertyOwners }: { propertyOwners: Record<number, number> }) {
  return (
    <group>
      {/* Table surface (infinite dark) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#020204" />
      </mesh>

      {/* Board body — thick mahogany */}
      <mesh position={[0, -0.22, 0]}>
        <boxGeometry args={[12, 0.55, 12]} />
        <meshStandardMaterial color="#3e1c0a" metalness={0.25} roughness={0.65} />
      </mesh>

      {/* Top felt surface */}
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[11.4, 0.06, 11.4]} />
        <meshStandardMaterial color="#0d2818" metalness={0.15} roughness={0.85} />
      </mesh>

      {/* Inner play area */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.10, 0]}>
        <planeGeometry args={[8.6, 8.6]} />
        <meshStandardMaterial color="#071a0e" />
      </mesh>

      {/* Gold trim — four edges */}
      {[
        [0, 0.1, 5.75, 11.8, 0.06, 0.1],
        [0, 0.1, -5.75, 11.8, 0.06, 0.1],
        [5.75, 0.1, 0, 0.1, 0.06, 11.8],
        [-5.75, 0.1, 0, 0.1, 0.06, 11.8],
      ].map(([x, y, z, w, h, d], i) => (
        <mesh key={i} position={[x, y, z]}>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color="#c4a35a" metalness={0.85} roughness={0.15} emissive="#c4a35a" emissiveIntensity={0.15} />
        </mesh>
      ))}

      {/* Neon border glow */}
      <NeonBorder />

      {/* Tiles */}
      {TILE_DATA.map((tile, i) => (
        <BoardTile key={i} tile={tile} position={BOARD_POSITIONS[i]} ownerIndex={propertyOwners[tile.position] ?? -1} />
      ))}

      {/* Board center graphics */}
      <BoardCenter />

      {/* Corner accent lights */}
      <pointLight position={[5, 0.3, 5]} intensity={0.15} color="#00E676" distance={4} />
      <pointLight position={[-5, 0.3, 5]} intensity={0.15} color="#FF9100" distance={4} />
      <pointLight position={[-5, 0.3, -5]} intensity={0.15} color="#E91E63" distance={4} />
      <pointLight position={[5, 0.3, -5]} intensity={0.15} color="#4fc3f7" distance={4} />
    </group>
  );
}

function NeonBorder() {
  const outer = useMemo(() => [
    [-5.55, 0.11, -5.55], [5.55, 0.11, -5.55],
    [5.55, 0.11, 5.55], [-5.55, 0.11, 5.55], [-5.55, 0.11, -5.55],
  ].map(p => new THREE.Vector3(...p)), []);
  const inner = useMemo(() => [
    [-4.45, 0.11, -4.45], [4.45, 0.11, -4.45],
    [4.45, 0.11, 4.45], [-4.45, 0.11, 4.45], [-4.45, 0.11, -4.45],
  ].map(p => new THREE.Vector3(...p)), []);
  return (
    <group>
      <PrimitiveLine pts={outer} color="#4fc3f7" opacity={0.6} />
      <PrimitiveLine pts={inner} color="#1a3a4a" opacity={0.35} />
    </group>
  );
}

function PrimitiveLine({ pts, color, opacity }: { pts: THREE.Vector3[]; color: string; opacity: number }) {
  const obj = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    return new THREE.Line(g, m);
  }, [pts, color, opacity]);
  return <primitive object={obj} />;
}

/* ------------------------------------------------------------------ */
/*  Individual Board Tile                                              */
/* ------------------------------------------------------------------ */
function BoardTile({ tile, position, ownerIndex }: {
  tile: typeof TILE_DATA[0]; position: [number, number, number]; ownerIndex: number;
}) {
  const groupColor = GROUP_COLORS[tile.group] || '#1a2a1a';
  const edge = getTileEdge(tile.position);
  const isProperty = tile.group > 0;

  let w = 0.88, d = 0.88;
  if (tile.isCorner) { w = 1.1; d = 1.1; }
  else if (edge === 'bottom' || edge === 'top') { w = 0.88; d = 0.55; }
  else { w = 0.55; d = 0.88; }

  const pos: [number, number, number] = [position[0], 0.10, position[2]];
  if (!tile.isCorner) {
    if (edge === 'bottom') pos[2] -= 0.15;
    if (edge === 'top') pos[2] += 0.15;
    if (edge === 'left') pos[0] += 0.15;
    if (edge === 'right') pos[0] -= 0.15;
  }

  const emissive = ownerIndex >= 0 ? 0.7 : (isProperty ? 0.3 : 0.06);

  // Color strip (inner edge of tile like real Monopoly)
  let stripPos: [number, number, number] = [0, 0.02, 0];
  let stripW = w, stripD = d * 0.35;
  if (!tile.isCorner && isProperty) {
    if (edge === 'bottom') { stripPos = [0, 0.02, d * 0.33]; stripW = w; stripD = d * 0.35; }
    if (edge === 'top') { stripPos = [0, 0.02, -d * 0.33]; stripW = w; stripD = d * 0.35; }
    if (edge === 'left') { stripPos = [w * 0.33, 0.02, 0]; stripW = w * 0.35; stripD = d; }
    if (edge === 'right') { stripPos = [-w * 0.33, 0.02, 0]; stripW = w * 0.35; stripD = d; }
  }

  let textRot: [number, number, number] = [-Math.PI / 2, 0, 0];
  if (edge === 'left') textRot = [-Math.PI / 2, 0, Math.PI / 2];
  if (edge === 'right') textRot = [-Math.PI / 2, 0, -Math.PI / 2];
  if (edge === 'top') textRot = [-Math.PI / 2, 0, Math.PI];

  return (
    <group position={pos}>
      {/* Tile base (cream/light) */}
      <mesh>
        <boxGeometry args={[w, 0.05, d]} />
        <meshStandardMaterial color={tile.isCorner ? '#1a2a1a' : '#1a1a12'} metalness={0.2} roughness={0.8} />
      </mesh>
      {/* Color strip header */}
      {isProperty && !tile.isCorner && (
        <mesh position={stripPos}>
          <boxGeometry args={[stripW, 0.06, stripD]} />
          <meshStandardMaterial color={groupColor} emissive={groupColor} emissiveIntensity={emissive} metalness={0.4} roughness={0.5} />
        </mesh>
      )}
      {/* Corner tiles get full color */}
      {tile.isCorner && (
        <mesh position={[0, 0.01, 0]}>
          <boxGeometry args={[w * 0.9, 0.04, d * 0.9]} />
          <meshStandardMaterial color="#0a1a0f" emissive="#4fc3f7" emissiveIntensity={0.05} />
        </mesh>
      )}
      {/* Label */}
      <Text position={[0, 0.07, 0]} rotation={textRot} fontSize={tile.isCorner ? 0.24 : 0.12}
        color={tile.isCorner ? '#4fc3f7' : (isProperty ? '#ddd' : '#666')}
        anchorX="center" anchorY="middle" maxWidth={0.8}>
        {tile.shortName}
      </Text>
      {/* Owner dot */}
      {ownerIndex >= 0 && (
        <mesh position={[0, 0.09, 0]}>
          <sphereGeometry args={[0.07, 8, 8]} />
          <meshStandardMaterial color={PLAYER_COLORS[ownerIndex]} emissive={PLAYER_COLORS[ownerIndex]} emissiveIntensity={1.5} />
        </mesh>
      )}
    </group>
  );
}

function BoardCenter() {
  return (
    <group>
      <Text position={[0, 0.12, -0.8]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.75}
        color="#4fc3f7" anchorX="center" anchorY="middle" letterSpacing={0.15}>
        MONOPOLY
      </Text>
      <Text position={[0, 0.12, 0.15]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.28}
        color="#1a4a5a" anchorX="center" anchorY="middle" letterSpacing={0.35}>
        AI AGENTS
      </Text>
      {/* Decorative diamond in center */}
      <mesh position={[0, 0.18, 1.2]} rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[0.3, 0.02, 0.3]} />
        <meshStandardMaterial color="#c4a35a" emissive="#c4a35a" emissiveIntensity={0.3} metalness={0.9} roughness={0.1} />
      </mesh>
    </group>
  );
}

/* ================================================================== */
/*  ANIMATED DICE — 3D dice with pips that actually roll               */
/* ================================================================== */
const DIE_SIZE = 0.42;
const DIE_HALF = DIE_SIZE / 2;
const PIP_R = DIE_SIZE * 0.055;
const PS = DIE_SIZE * 0.155; // pip spacing
const PD = DIE_HALF + 0.005; // pip distance from center

// All 21 pips for a standard die
const ALL_PIPS: [number, number, number][] = [
  // Face 1 (+Y top): 1 center
  [0, PD, 0],
  // Face 6 (-Y bottom): 6 pips (2 columns of 3)
  [-PS, -PD, -PS], [-PS, -PD, 0], [-PS, -PD, PS], [PS, -PD, -PS], [PS, -PD, 0], [PS, -PD, PS],
  // Face 2 (+Z front): 2 diagonal
  [PS, PS, PD], [-PS, -PS, PD],
  // Face 5 (-Z back): 5 (4 corners + center)
  [PS, PS, -PD], [-PS, PS, -PD], [0, 0, -PD], [PS, -PS, -PD], [-PS, -PS, -PD],
  // Face 3 (+X right): 3 diagonal + center
  [PD, PS, -PS], [PD, 0, 0], [PD, -PS, PS],
  // Face 4 (-X left): 4 corners
  [-PD, PS, -PS], [-PD, PS, PS], [-PD, -PS, -PS], [-PD, -PS, PS],
];

// Target rotations to show each value on top
const DICE_ROT: Record<number, [number, number, number]> = {
  1: [0, 0, 0],
  2: [-Math.PI / 2, 0, 0],
  3: [0, 0, Math.PI / 2],
  4: [0, 0, -Math.PI / 2],
  5: [Math.PI / 2, 0, 0],
  6: [Math.PI, 0, 0],
};

function SingleDie({ targetValue, offset, rollTrigger }: {
  targetValue: number; offset: number; rollTrigger: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const rollStart = useRef(0);
  const spinSeed = useRef([Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3]);

  useEffect(() => {
    rollStart.current = Date.now();
    spinSeed.current = [Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4];
  }, [rollTrigger]);

  useFrame(() => {
    if (!groupRef.current) return;
    const elapsed = (Date.now() - rollStart.current) / 1000;
    const target = DICE_ROT[targetValue] || [0, 0, 0];

    if (elapsed < 0.9) {
      // Tumbling phase
      const speed = Math.max(0, 1 - elapsed * 0.8);
      groupRef.current.rotation.x += spinSeed.current[0] * speed * 0.12;
      groupRef.current.rotation.y += spinSeed.current[1] * speed * 0.12;
      groupRef.current.rotation.z += spinSeed.current[2] * speed * 0.12;
      // Bouncing height
      const bounce = Math.abs(Math.sin(elapsed * 6)) * (1 - elapsed * 0.8) * 1.2;
      groupRef.current.position.y = 0.6 + bounce;
      groupRef.current.position.x = offset + Math.sin(elapsed * 3) * 0.1 * (1 - elapsed);
    } else {
      // Settle to final rotation
      const t = Math.min((elapsed - 0.9) / 0.4, 1);
      const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic
      groupRef.current.rotation.x += (target[0] - groupRef.current.rotation.x) * ease * 0.15;
      groupRef.current.rotation.y += (target[1] - groupRef.current.rotation.y) * ease * 0.15;
      groupRef.current.rotation.z += (target[2] - groupRef.current.rotation.z) * ease * 0.15;
      groupRef.current.position.y += (0.4 - groupRef.current.position.y) * 0.1;
      groupRef.current.position.x += (offset - groupRef.current.position.x) * 0.1;
    }
  });

  return (
    <group ref={groupRef} position={[offset, 1.5, 0]}>
      {/* Die body with rounded appearance */}
      <mesh>
        <boxGeometry args={[DIE_SIZE, DIE_SIZE, DIE_SIZE]} />
        <meshStandardMaterial color="#f5f0e8" metalness={0.05} roughness={0.25} />
      </mesh>
      {/* Pips */}
      {ALL_PIPS.map((pos, i) => (
        <mesh key={i} position={pos}>
          <sphereGeometry args={[PIP_R, 8, 8]} />
          <meshStandardMaterial color="#1a1210" />
        </mesh>
      ))}
    </group>
  );
}

function AnimatedDice({ d1, d2, isDoubles }: { d1: number; d2: number; isDoubles: boolean }) {
  const [rollTrigger, setRollTrigger] = useState(0);
  const prevDice = useRef('');

  useEffect(() => {
    const key = `${d1}-${d2}`;
    if (key !== prevDice.current) {
      prevDice.current = key;
      setRollTrigger(t => t + 1);
    }
  }, [d1, d2]);

  return (
    <group position={[0, 0, 0]}>
      <SingleDie targetValue={d1} offset={-0.35} rollTrigger={rollTrigger} />
      <SingleDie targetValue={d2} offset={0.35} rollTrigger={rollTrigger} />
      {/* Doubles glow ring */}
      {isDoubles && (
        <mesh position={[0, 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.7, 0.85, 32]} />
          <meshStandardMaterial color="#ffd54f" emissive="#ffd54f" emissiveIntensity={2}
            transparent opacity={0.4} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

/* ================================================================== */
/*  PLAYER TOKENS — Path-following with hop animation                  */
/* ================================================================== */
function AnimatedToken({ playerIndex, boardPosition, color, isActive, alive, shape }: {
  playerIndex: number; boardPosition: number; color: string;
  isActive: boolean; alive: boolean; shape: typeof SHAPES[number];
}) {
  const groupRef = useRef<THREE.Group>(null);
  const prevPos = useRef(boardPosition);
  const pathQueue = useRef<[number, number, number][]>([]);
  const pathStart = useRef(0);
  const spinRef = useRef(0);

  // Generate hop path when position changes
  useEffect(() => {
    if (boardPosition === prevPos.current) return;
    const oldPos = prevPos.current;
    const fwd = (boardPosition - oldPos + 40) % 40;
    const isNormal = fwd > 0 && fwd <= 12;

    if (isNormal) {
      const path: [number, number, number][] = [];
      let p = oldPos;
      while (p !== boardPosition) {
        p = (p + 1) % 40;
        const b = BOARD_POSITIONS[p];
        const o = TOKEN_OFFSETS[playerIndex];
        path.push([b[0] + o[0], TOKEN_Y, b[2] + o[2]]);
      }
      pathQueue.current = path;
    } else {
      // Teleport (jail, card) — single hop
      const b = BOARD_POSITIONS[boardPosition];
      const o = TOKEN_OFFSETS[playerIndex];
      pathQueue.current = [[b[0] + o[0], TOKEN_Y, b[2] + o[2]]];
    }
    pathStart.current = Date.now();
    prevPos.current = boardPosition;
  }, [boardPosition, playerIndex]);

  useFrame(() => {
    if (!groupRef.current || !alive) return;
    const path = pathQueue.current;
    const elapsed = Date.now() - pathStart.current;

    if (path.length > 0) {
      const idx = Math.min(Math.floor(elapsed / HOP_MS), path.length - 1);
      const target = path[idx];
      const done = idx >= path.length - 1 && elapsed > path.length * HOP_MS + 200;

      // Lerp toward target tile
      groupRef.current.position.x += (target[0] - groupRef.current.position.x) * 0.18;
      groupRef.current.position.z += (target[2] - groupRef.current.position.z) * 0.18;

      // Hop arc per tile
      const tileProgress = (elapsed % HOP_MS) / HOP_MS;
      const hopHeight = Math.sin(tileProgress * Math.PI) * 0.5;
      groupRef.current.position.y = TOKEN_Y + hopHeight;

      if (done) pathQueue.current = []; // animation complete
    } else {
      // Idle float at current position
      const b = BOARD_POSITIONS[boardPosition] || BOARD_POSITIONS[0];
      const o = TOKEN_OFFSETS[playerIndex];
      const tx = b[0] + o[0], tz = b[2] + o[2];
      groupRef.current.position.x += (tx - groupRef.current.position.x) * 0.06;
      groupRef.current.position.z += (tz - groupRef.current.position.z) * 0.06;
      groupRef.current.position.y = TOKEN_Y + Math.sin(Date.now() * 0.002 + playerIndex) * 0.04;
    }

    // Spin
    spinRef.current += isActive ? 0.04 : 0.01;

    // Scale pulse for active player
    const s = isActive ? 1.15 + Math.sin(Date.now() * 0.005) * 0.08 : 1;
    groupRef.current.scale.set(s, s, s);
  });

  if (!alive) return null;

  const b = BOARD_POSITIONS[boardPosition] || BOARD_POSITIONS[0];
  const o = TOKEN_OFFSETS[playerIndex];
  const mat = (
    <meshStandardMaterial
      color={color} emissive={color}
      emissiveIntensity={isActive ? 1.5 : 0.5}
      metalness={0.85} roughness={0.15}
    />
  );

  return (
    <group ref={groupRef} position={[b[0] + o[0], TOKEN_Y, b[2] + o[2]]}>
      {/* Ground glow circle */}
      <mesh position={[0, -TOKEN_Y + 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.4, 32]} />
        <meshStandardMaterial color={color} emissive={color}
          emissiveIntensity={isActive ? 2 : 0.4} transparent opacity={isActive ? 0.35 : 0.12}
          side={THREE.DoubleSide} />
      </mesh>

      {/* Token shape */}
      <group rotation={[0, spinRef.current, 0]}>
        {shape === 'diamond' && (
          <mesh><octahedronGeometry args={[0.28, 0]} />{mat}</mesh>
        )}
        {shape === 'crown' && (
          <group>
            <mesh position={[0, -0.05, 0]}><cylinderGeometry args={[0.22, 0.25, 0.12, 8]} />{mat}</mesh>
            <mesh position={[0, 0.12, 0]}><coneGeometry args={[0.18, 0.28, 6]} />{mat}</mesh>
            <mesh position={[0, 0.3, 0]}><sphereGeometry args={[0.06, 8, 8]} />{mat}</mesh>
          </group>
        )}
        {shape === 'ring' && (
          <mesh rotation={[Math.PI / 3, 0, 0]}><torusGeometry args={[0.19, 0.07, 12, 24]} />{mat}</mesh>
        )}
        {shape === 'crystal' && (
          <mesh><dodecahedronGeometry args={[0.24, 0]} />{mat}</mesh>
        )}
      </group>

      {/* Active player ring */}
      {isActive && <ActiveRing color={color} />}
    </group>
  );
}

function ActiveRing({ color }: { color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const s = 1 + Math.sin(clock.elapsedTime * 4) * 0.15;
    ref.current.scale.set(s, s, 1);
    ref.current.rotation.z = clock.elapsedTime * 0.5;
  });
  return (
    <mesh ref={ref} position={[0, -TOKEN_Y + 0.13, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.42, 0.52, 6]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.5}
        transparent opacity={0.55} side={THREE.DoubleSide} />
    </mesh>
  );
}

/* ================================================================== */
/*  MONEY EFFECT — Gold coins flying from payer to payee               */
/* ================================================================== */
interface FxDef { id: number; from: [number, number, number]; to: [number, number, number]; color: string; start: number; }

function MoneyParticle({ fx, onDone }: { fx: FxDef; onDone: () => void }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    const t = Math.min((Date.now() - fx.start) / 1000, 1);
    if (t >= 1) { onDone(); return; }
    ref.current.position.x = fx.from[0] + (fx.to[0] - fx.from[0]) * t;
    ref.current.position.z = fx.from[2] + (fx.to[2] - fx.from[2]) * t;
    ref.current.position.y = 0.6 + Math.sin(t * Math.PI) * 1.8;
    ref.current.rotation.y = t * 12;
    const sc = 0.8 + Math.sin(t * Math.PI) * 0.4;
    ref.current.scale.set(sc, sc, sc);
  });
  return (
    <mesh ref={ref} position={[fx.from[0], 0.6, fx.from[2]]}>
      <cylinderGeometry args={[0.08, 0.08, 0.03, 12]} />
      <meshStandardMaterial color="#ffd700" emissive="#ffa000" emissiveIntensity={1.5} metalness={0.9} roughness={0.1} />
    </mesh>
  );
}

/* ================================================================== */
/*  SCENE COMPOSITION                                                  */
/* ================================================================== */
function Scene({ snapshot, latestEvents }: { snapshot: Snapshot | null; latestEvents: GameEvent[] }) {
  const [effects, setEffects] = useState<FxDef[]>([]);
  const fxId = useRef(0);

  // Property owner lookup
  const propertyOwners = useMemo(() => {
    const o: Record<number, number> = {};
    if (!snapshot) return o;
    for (const p of snapshot.properties) {
      if (p.ownerIndex >= 0 && p.index < PROPERTY_TO_TILE.length) o[PROPERTY_TO_TILE[p.index]] = p.ownerIndex;
    }
    return o;
  }, [snapshot]);

  // Trigger effects from events
  useEffect(() => {
    if (!snapshot || latestEvents.length === 0) return;
    const newFx: FxDef[] = [];
    for (const ev of latestEvents) {
      if ((ev.type === 'PAID_RENT' || ev.type === 'PAID_TAX') && ev.player !== undefined) {
        const fromP = snapshot.players[ev.player];
        const toP = ev.toPlayer !== undefined ? snapshot.players[ev.toPlayer] : null;
        if (fromP) {
          const fb = BOARD_POSITIONS[fromP.position] || BOARD_POSITIONS[0];
          const tb = toP ? (BOARD_POSITIONS[toP.position] || BOARD_POSITIONS[0]) : [0, 0, 0] as [number, number, number];
          for (let c = 0; c < 3; c++) {
            newFx.push({
              id: fxId.current++,
              from: [fb[0], 0, fb[2]],
              to: [tb[0], 0, tb[2]],
              color: '#ffd700',
              start: Date.now() + c * 120,
            });
          }
        }
      }
    }
    if (newFx.length > 0) setEffects(prev => [...prev.slice(-10), ...newFx]);
  }, [latestEvents, snapshot]);

  const removeFx = useCallback((id: number) => {
    setEffects(prev => prev.filter(f => f.id !== id));
  }, []);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.2} />
      <directionalLight position={[8, 18, 6]} intensity={0.65} color="#fffaf0" />
      <pointLight position={[0, 12, 0]} intensity={0.5} color="#4fc3f7" distance={30} />
      <pointLight position={[-6, 8, 6]} intensity={0.25} color="#00E676" distance={18} />
      <pointLight position={[6, 8, -6]} intensity={0.25} color="#FF9100" distance={18} />
      <fog attach="fog" args={['#050510', 25, 55]} />

      {/* Background */}
      <Stars radius={80} depth={60} count={4000} factor={5} fade speed={0.4} />

      {/* Board */}
      <GameBoard propertyOwners={propertyOwners} />

      {/* Contact shadows under tokens */}
      <ContactShadows position={[0, 0.11, 0]} opacity={0.3} scale={14} blur={2} far={2} color="#000" />

      {/* Tokens */}
      {snapshot?.players.map((player, i) => (
        <AnimatedToken
          key={i}
          playerIndex={i}
          boardPosition={player.position}
          color={PLAYER_COLORS[i]}
          isActive={i === snapshot.currentPlayerIndex}
          alive={player.alive}
          shape={SHAPES[i]}
        />
      ))}

      {/* Dice */}
      {snapshot?.lastDice && (
        <AnimatedDice d1={snapshot.lastDice.d1} d2={snapshot.lastDice.d2} isDoubles={snapshot.lastDice.isDoubles} />
      )}

      {/* Money effects */}
      {effects.map(fx => (
        <MoneyParticle key={fx.id} fx={fx} onDone={() => removeFx(fx.id)} />
      ))}

      {/* Camera */}
      <OrbitControls
        target={[0, 0, 0]}
        maxPolarAngle={Math.PI / 2.1}
        minPolarAngle={0.2}
        minDistance={6}
        maxDistance={24}
        enableDamping dampingFactor={0.05}
        autoRotate={!snapshot} autoRotateSpeed={0.3}
      />
    </>
  );
}

/* ================================================================== */
/*  EXPORTED CANVAS WRAPPER                                            */
/* ================================================================== */
export default function MonopolyScene({ snapshot, latestEvents = [] }: {
  snapshot: Snapshot | null; latestEvents?: GameEvent[];
}) {
  return (
    <Canvas
      camera={{ position: [0, 15, 11], fov: 38 }}
      style={{ background: '#050510' }}
      gl={{ antialias: true, alpha: false }}
      dpr={[1, 2]}
    >
      <Scene snapshot={snapshot} latestEvents={latestEvents} />
    </Canvas>
  );
}
