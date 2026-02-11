'use client';

import { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import {
  BOARD_POSITIONS, TILE_DATA, GROUP_COLORS,
  PLAYER_COLORS, TOKEN_OFFSETS, PROPERTY_TO_TILE, getTileEdge,
} from '@/lib/boardPositions';

/* ================================================================ */
/*  Types                                                            */
/* ================================================================ */
interface PlayerInfo { index: number; address: string; cash: number; position: number; tileName: string; inJail: boolean; jailTurns: number; alive: boolean; }
interface PropertyInfo { index: number; tileName: string; ownerIndex: number; mortgaged: boolean; }
export interface Snapshot {
  status: string; phase: string; turn: number; round: number;
  currentPlayerIndex: number; aliveCount: number;
  players: PlayerInfo[]; properties: PropertyInfo[];
  lastDice: { d1: number; d2: number; sum: number; isDoubles: boolean } | null;
  auction: any; winner: number;
}
export interface GameEvent { type: string; [key: string]: any; }

const TOKEN_Y = 0.18;   // resting height on board
const HOP_MS = 170;
const TILE_NAMES: Record<number, string> = {};
TILE_DATA.forEach(t => { TILE_NAMES[t.position] = t.name; });

/* ================================================================ */
/*  BOARD                                                            */
/* ================================================================ */
function GameBoard({ propertyOwners }: { propertyOwners: Record<number, number> }) {
  return (
    <group>
      {/* Thick board body */}
      <mesh position={[0, -0.24, 0]}>
        <boxGeometry args={[12.4, 0.65, 12.4]} />
        <meshStandardMaterial color="#6D3A1A" metalness={0.15} roughness={0.65} />
      </mesh>
      {/* Board rim */}
      <mesh position={[0, -0.01, 0]}>
        <boxGeometry args={[12.1, 0.14, 12.1]} />
        <meshStandardMaterial color="#8B5E3C" metalness={0.1} roughness={0.7} />
      </mesh>
      {/* Green felt */}
      <mesh position={[0, 0.07, 0]}>
        <boxGeometry args={[11.6, 0.06, 11.6]} />
        <meshStandardMaterial color="#2E8B3C" metalness={0.05} roughness={0.92} />
      </mesh>
      {/* Inner play area */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.11, 0]}>
        <planeGeometry args={[8.4, 8.4]} />
        <meshStandardMaterial color="#1E7832" />
      </mesh>

      {/* Gold trim */}
      {[[0, 5.85, 12, 0.1], [0, -5.85, 12, 0.1], [5.85, 0, 0.1, 12], [-5.85, 0, 0.1, 12]].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, 0.12, z]}>
          <boxGeometry args={[w, 0.07, d]} />
          <meshStandardMaterial color="#D4A84B" metalness={0.8} roughness={0.15} emissive="#D4A84B" emissiveIntensity={0.08} />
        </mesh>
      ))}

      <NeonBorder />
      {TILE_DATA.map((tile, i) => (
        <BoardTile key={i} tile={tile} position={BOARD_POSITIONS[i]} ownerIndex={propertyOwners[tile.position] ?? -1} />
      ))}
      <BoardCenter />

      {/* Warm corner lights */}
      <pointLight position={[5.5, 0.6, 5.5]} intensity={0.5} color="#FFD54F" distance={5} />
      <pointLight position={[-5.5, 0.6, 5.5]} intensity={0.5} color="#FF9100" distance={5} />
      <pointLight position={[-5.5, 0.6, -5.5]} intensity={0.5} color="#E040FB" distance={5} />
      <pointLight position={[5.5, 0.6, -5.5]} intensity={0.5} color="#00B8D4" distance={5} />
    </group>
  );
}

function NeonBorder() {
  const mk = (pts: number[][]) => useMemo(() => pts.map(p => new THREE.Vector3(...p)), []);
  const outer = mk([[-5.65, 0.13, -5.65], [5.65, 0.13, -5.65], [5.65, 0.13, 5.65], [-5.65, 0.13, 5.65], [-5.65, 0.13, -5.65]]);
  const inner = mk([[-4.35, 0.13, -4.35], [4.35, 0.13, -4.35], [4.35, 0.13, 4.35], [-4.35, 0.13, 4.35], [-4.35, 0.13, -4.35]]);
  return <group><PLine pts={outer} color="#D4A84B" opacity={0.4} /><PLine pts={inner} color="#D4A84B" opacity={0.25} /></group>;
}

function PLine({ pts, color, opacity }: { pts: THREE.Vector3[]; color: string; opacity: number }) {
  const obj = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  }, [pts, color, opacity]);
  return <primitive object={obj} />;
}

/* ---------------------------------------------------------------- */
/*  TILES — bigger, more detail, full names + prices                 */
/* ---------------------------------------------------------------- */
function BoardTile({ tile, position, ownerIndex }: { tile: typeof TILE_DATA[0]; position: [number, number, number]; ownerIndex: number }) {
  const gc = GROUP_COLORS[tile.group] || '#2E8B3C';
  const edge = getTileEdge(tile.position);
  const isProp = tile.group > 0;

  let w = 0.95, d = 0.95;
  if (tile.isCorner) { w = 1.35; d = 1.35; }
  else if (edge === 'bottom' || edge === 'top') { w = 0.95; d = 0.65; }
  else { w = 0.65; d = 0.95; }

  const pos: [number, number, number] = [position[0], 0.11, position[2]];

  // Color strip on inner edge
  let sPos: [number, number, number] = [0, 0.03, 0], sW = w, sD = d * 0.32;
  if (!tile.isCorner && isProp) {
    if (edge === 'bottom') { sPos = [0, 0.03, -d * 0.34]; }
    if (edge === 'top')    { sPos = [0, 0.03, d * 0.34]; }
    if (edge === 'left')   { sPos = [w * 0.34, 0.03, 0]; sW = w * 0.32; sD = d; }
    if (edge === 'right')  { sPos = [-w * 0.34, 0.03, 0]; sW = w * 0.32; sD = d; }
  }

  let tRot: [number, number, number] = [-Math.PI / 2, 0, 0];
  if (edge === 'left') tRot = [-Math.PI / 2, 0, Math.PI / 2];
  if (edge === 'right') tRot = [-Math.PI / 2, 0, -Math.PI / 2];
  if (edge === 'top') tRot = [-Math.PI / 2, 0, Math.PI];

  // Name to display
  const displayName = tile.isCorner ? tile.name : (tile.name.length > 14 ? tile.shortName : tile.name.replace(' Ave', '').replace(' Place', ' Pl'));

  return (
    <group position={pos}>
      {/* Tile body */}
      <mesh><boxGeometry args={[w, 0.06, d]} /><meshStandardMaterial color={tile.isCorner ? '#E8DCC8' : '#F5EED6'} metalness={0.04} roughness={0.8} /></mesh>
      {/* Color strip */}
      {isProp && !tile.isCorner && (
        <mesh position={sPos}><boxGeometry args={[sW, 0.07, sD]} />
          <meshStandardMaterial color={gc} emissive={gc} emissiveIntensity={ownerIndex >= 0 ? 0.45 : 0.12} metalness={0.3} roughness={0.5} />
        </mesh>
      )}

      {/* Corner decorations */}
      {tile.position === 0 && <CornerGo rotation={tRot} />}
      {tile.position === 10 && <CornerJail rotation={tRot} />}
      {tile.position === 20 && <CornerFreeParking rotation={tRot} />}
      {tile.position === 30 && <CornerGoToJail rotation={tRot} />}

      {/* Non-corner label */}
      {!tile.isCorner && (
        <group>
          <Text position={[0, 0.08, 0]} rotation={tRot} fontSize={0.075} color="#3A3020" anchorX="center" anchorY="middle" maxWidth={w * 0.85} textAlign="center">
            {displayName}
          </Text>
          {tile.price > 0 && (
            <Text position={[0, 0.08, edge === 'bottom' ? 0.12 : (edge === 'top' ? -0.12 : 0)]} rotation={tRot}
              fontSize={0.06} color="#7A6B50" anchorX="center" anchorY="middle">
              ${tile.price}
            </Text>
          )}
          {/* Type icons for special tiles */}
          {tile.type === 'chance' && <Text position={[0, 0.08, 0]} rotation={tRot} fontSize={0.22} color="#FF9100" anchorX="center" anchorY="middle">?</Text>}
          {tile.type === 'community' && <Text position={[0, 0.08, 0]} rotation={tRot} fontSize={0.16} color="#4FC3F7" anchorX="center" anchorY="middle">CC</Text>}
          {tile.type === 'tax' && <Text position={[0, 0.08, 0]} rotation={tRot} fontSize={0.16} color="#EF5350" anchorX="center" anchorY="middle">TAX</Text>}
        </group>
      )}

      {/* Owner house */}
      {ownerIndex >= 0 && !tile.isCorner && <SmallHouse position={[0, 0.04, edge === 'bottom' ? -0.15 : (edge === 'top' ? 0.15 : 0)]} color={PLAYER_COLORS[ownerIndex]} />}
    </group>
  );
}

/* Corner tile components with decorations */
function CornerGo({ rotation }: { rotation: [number, number, number] }) {
  return (
    <group>
      <mesh position={[0, 0.02, 0]}><boxGeometry args={[1.2, 0.04, 1.2]} /><meshStandardMaterial color="#C8E6C9" /></mesh>
      <mesh position={[0.25, 0.06, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.18, 0.35, 3]} /><meshStandardMaterial color="#4CAF50" emissive="#4CAF50" emissiveIntensity={0.3} /></mesh>
      <Text position={[-0.15, 0.08, -0.15]} rotation={rotation} fontSize={0.3} color="#2E7D32" anchorX="center" fontWeight={800}>GO</Text>
      <Text position={[0, 0.08, 0.25]} rotation={rotation} fontSize={0.08} color="#4CAF50" anchorX="center">COLLECT $200</Text>
    </group>
  );
}

function CornerJail({ rotation }: { rotation: [number, number, number] }) {
  return (
    <group>
      <mesh position={[0, 0.02, 0]}><boxGeometry args={[1.2, 0.04, 1.2]} /><meshStandardMaterial color="#FFCCBC" /></mesh>
      {[-0.2, -0.07, 0.06, 0.19].map((x, i) => (
        <mesh key={i} position={[x, 0.15, 0.1]}><cylinderGeometry args={[0.015, 0.015, 0.22, 6]} /><meshStandardMaterial color="#666" metalness={0.5} /></mesh>
      ))}
      <Text position={[0, 0.08, -0.2]} rotation={rotation} fontSize={0.18} color="#D84315" anchorX="center" fontWeight={800}>JAIL</Text>
      <Text position={[0, 0.08, 0.35]} rotation={rotation} fontSize={0.06} color="#8D6E63" anchorX="center">JUST VISITING</Text>
    </group>
  );
}

function CornerFreeParking({ rotation }: { rotation: [number, number, number] }) {
  return (
    <group>
      <mesh position={[0, 0.02, 0]}><boxGeometry args={[1.2, 0.04, 1.2]} /><meshStandardMaterial color="#FFF9C4" /></mesh>
      <mesh position={[0, 0.06, 0.05]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.28, 16]} /><meshStandardMaterial color="#FDD835" emissive="#FDD835" emissiveIntensity={0.15} side={THREE.DoubleSide} /></mesh>
      <Text position={[0, 0.08, 0.05]} rotation={rotation} fontSize={0.25} color="#F57F17" anchorX="center" fontWeight={800}>P</Text>
      <Text position={[0, 0.08, -0.3]} rotation={rotation} fontSize={0.08} color="#F9A825" anchorX="center">FREE</Text>
      <Text position={[0, 0.08, 0.38]} rotation={rotation} fontSize={0.07} color="#F9A825" anchorX="center">PARKING</Text>
    </group>
  );
}

function CornerGoToJail({ rotation }: { rotation: [number, number, number] }) {
  return (
    <group>
      <mesh position={[0, 0.02, 0]}><boxGeometry args={[1.2, 0.04, 1.2]} /><meshStandardMaterial color="#FFCDD2" /></mesh>
      <mesh position={[0, 0.06, 0.05]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.25, 16]} /><meshStandardMaterial color="#E53935" emissive="#E53935" emissiveIntensity={0.15} side={THREE.DoubleSide} /></mesh>
      <Text position={[0, 0.08, -0.12]} rotation={rotation} fontSize={0.1} color="#C62828" anchorX="center" fontWeight={800}>GO TO</Text>
      <Text position={[0, 0.08, 0.12]} rotation={rotation} fontSize={0.14} color="#C62828" anchorX="center" fontWeight={800}>JAIL</Text>
    </group>
  );
}

function SmallHouse({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <group position={position} scale={[0.11, 0.11, 0.11]}>
      <mesh position={[0, 0.3, 0]}><boxGeometry args={[0.5, 0.5, 0.4]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} /></mesh>
      <mesh position={[0, 0.65, 0]} rotation={[0, Math.PI / 4, 0]}><coneGeometry args={[0.4, 0.35, 4]} /><meshStandardMaterial color="#D32F2F" /></mesh>
    </group>
  );
}

/* ---------------------------------------------------------------- */
/*  BOARD CENTER — card decks, decorations, rich detail              */
/* ---------------------------------------------------------------- */
function BoardCenter() {
  return (
    <group>
      {/* Title */}
      <Text position={[0, 0.13, -1.2]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.6} color="#D4A84B" anchorX="center" letterSpacing={0.1} fontWeight={800}>MONOPOLY</Text>
      <Text position={[0, 0.13, -0.4]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.22} color="#5D3A1A" anchorX="center" letterSpacing={0.25}>AI AGENTS</Text>

      {/* Decorative frame around title */}
      {[[-2.2, -1.5, 4.4, 0.04], [-2.2, -0.1, 4.4, 0.04], [-2.2, -1.5, 0.04, 1.44], [2.16, -1.5, 0.04, 1.44]].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x + (w as number) / 2, 0.125, z + (d as number) / 2]}>
          <boxGeometry args={[w, 0.015, d]} /><meshStandardMaterial color="#D4A84B" metalness={0.8} roughness={0.15} />
        </mesh>
      ))}

      {/* Chance deck — orange */}
      <CardDeck position={[-1.8, 0, 1]} color="#FF9100" label="CHANCE" symbol="?" />
      {/* Community Chest deck — blue */}
      <CardDeck position={[1.8, 0, 1]} color="#42A5F5" label="COMMUNITY" symbol="C" />

      {/* Gold emblem center */}
      <mesh position={[0, 0.15, 0.5]} rotation={[0, Math.PI / 4, 0]}><boxGeometry args={[0.4, 0.025, 0.4]} /><meshStandardMaterial color="#D4A84B" metalness={0.9} roughness={0.1} emissive="#D4A84B" emissiveIntensity={0.15} /></mesh>
      {/* Corner stars */}
      {[[-2, 2], [2, 2], [-2, -1.8], [2, -1.8]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.13, z]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
          <circleGeometry args={[0.14, 6]} /><meshStandardMaterial color="#D4A84B" emissive="#D4A84B" emissiveIntensity={0.1} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* Decorative train tracks (4 small rail segments) */}
      {[-0.8, -0.4, 0, 0.4, 0.8].map((x, i) => (
        <mesh key={i} position={[x, 0.125, 2.5]}><boxGeometry args={[0.08, 0.012, 0.5]} /><meshStandardMaterial color="#8D6E63" /></mesh>
      ))}
      <mesh position={[0, 0.13, 2.35]}><boxGeometry args={[1.8, 0.01, 0.04]} /><meshStandardMaterial color="#5D4037" /></mesh>
      <mesh position={[0, 0.13, 2.65]}><boxGeometry args={[1.8, 0.01, 0.04]} /><meshStandardMaterial color="#5D4037" /></mesh>
    </group>
  );
}

function CardDeck({ position, color, label, symbol }: { position: [number, number, number]; color: string; label: string; symbol: string }) {
  return (
    <group position={position}>
      {[0, 0.01, 0.02, 0.03, 0.04].map((y, i) => (
        <mesh key={i} position={[0, y + 0.13, 0]} rotation={[0, i * 0.015, 0]}>
          <boxGeometry args={[0.6, 0.015, 0.85]} />
          <meshStandardMaterial color={i === 4 ? color : '#F5EED6'} metalness={0.03} roughness={0.4} />
        </mesh>
      ))}
      <Text position={[0, 0.2, -0.2]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.07} color="#fff" anchorX="center" fontWeight={800}>{label}</Text>
      <Text position={[0, 0.2, 0.1]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.22} color="#fff" anchorX="center" fontWeight={800}>{symbol}</Text>
    </group>
  );
}

/* ---------------------------------------------------------------- */
/*  CARD ANIMATION — shows drawn card text                           */
/* ---------------------------------------------------------------- */
function CardAnimation({ text, type, visible }: { text: string; type: string; visible: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const startRef = useRef(Date.now());
  useEffect(() => { if (visible) startRef.current = Date.now(); }, [visible, text]);

  useFrame(() => {
    if (!ref.current) return;
    if (!visible) { ref.current.visible = false; return; }
    ref.current.visible = true;
    const t = (Date.now() - startRef.current) / 1000;
    const rise = Math.min(t / 0.6, 1);
    const ease = 1 - Math.pow(1 - rise, 3);
    ref.current.position.y = 0.2 + ease * 2;
    ref.current.rotation.x = -Math.PI / 2 + ease * Math.PI;
    if (t > 2.5) { const fade = Math.min((t - 2.5) / 0.5, 1); ref.current.position.y = 2.2 + fade * 1.5; }
  });

  const color = type === 'chance' ? '#FF9100' : '#42A5F5';
  return (
    <group ref={ref} position={[0, 0.2, 0.5]} visible={false}>
      <mesh><boxGeometry args={[1.4, 0.025, 1]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[0, 0.001, 0]}><boxGeometry args={[1.3, 0.024, 0.9]} /><meshStandardMaterial color="#FFFDF5" /></mesh>
      <Text position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.08} color="#333" anchorX="center" anchorY="middle" maxWidth={1.1} textAlign="center">
        {text}
      </Text>
      <Text position={[0, 0.02, -0.35]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.06} color={color} anchorX="center" fontWeight={800}>
        {type === 'chance' ? 'CHANCE' : 'COMMUNITY CHEST'}
      </Text>
    </group>
  );
}

/* ================================================================ */
/*  DICE                                                             */
/* ================================================================ */
const DS = 0.46, DH = DS / 2, PR = DS * 0.06, PP = DS * 0.155, PF = DH + 0.005;
const ALL_PIPS: [number, number, number][] = [
  [0,PF,0], [-PP,-PF,-PP],[-PP,-PF,0],[-PP,-PF,PP],[PP,-PF,-PP],[PP,-PF,0],[PP,-PF,PP],
  [PP,PP,PF],[-PP,-PP,PF], [PP,PP,-PF],[-PP,PP,-PF],[0,0,-PF],[PP,-PP,-PF],[-PP,-PP,-PF],
  [PF,PP,-PP],[PF,0,0],[PF,-PP,PP], [-PF,PP,-PP],[-PF,PP,PP],[-PF,-PP,-PP],[-PF,-PP,PP],
];
const DR: Record<number,[number,number,number]> = { 1:[0,0,0], 2:[-Math.PI/2,0,0], 3:[0,0,Math.PI/2], 4:[0,0,-Math.PI/2], 5:[Math.PI/2,0,0], 6:[Math.PI,0,0] };

function SingleDie({ val, off, trigger }: { val: number; off: number; trigger: number }) {
  const g = useRef<THREE.Group>(null);
  const rs = useRef(0); const sp = useRef([0,0,0].map(()=>Math.random()*8-4));
  useEffect(() => { rs.current = Date.now(); sp.current = [0,0,0].map(()=>Math.random()*8-4); }, [trigger]);
  useFrame(() => {
    if (!g.current) return;
    const t = (Date.now() - rs.current) / 1000, tgt = DR[val]||[0,0,0];
    if (t < 0.9) {
      const s = Math.max(0, 1 - t * 0.9);
      g.current.rotation.x += sp.current[0]*s*0.12; g.current.rotation.y += sp.current[1]*s*0.12; g.current.rotation.z += sp.current[2]*s*0.12;
      g.current.position.y = 0.7 + Math.abs(Math.sin(t*6))*(1-t)*1.2;
      g.current.position.x = off + Math.sin(t*3)*0.1*(1-t);
    } else {
      const e = Math.min((t-0.9)/0.4,1), e3 = 1-Math.pow(1-e,3);
      g.current.rotation.x += (tgt[0]-g.current.rotation.x)*e3*0.15;
      g.current.rotation.y += (tgt[1]-g.current.rotation.y)*e3*0.15;
      g.current.rotation.z += (tgt[2]-g.current.rotation.z)*e3*0.15;
      g.current.position.y += (0.45-g.current.position.y)*0.12;
      g.current.position.x += (off-g.current.position.x)*0.1;
    }
  });
  return (
    <group ref={g} position={[off, 1.8, 0]}>
      <mesh><boxGeometry args={[DS,DS,DS]} /><meshStandardMaterial color="#FFFDF5" metalness={0.02} roughness={0.2} /></mesh>
      {ALL_PIPS.map((p,i)=><mesh key={i} position={p}><sphereGeometry args={[PR,8,8]} /><meshStandardMaterial color="#2C1810" /></mesh>)}
    </group>
  );
}

function AnimatedDice({ d1, d2, isDoubles }: { d1: number; d2: number; isDoubles: boolean }) {
  const [tr, setTr] = useState(0); const prev = useRef('');
  useEffect(() => { const k = `${d1}-${d2}`; if (k !== prev.current) { prev.current = k; setTr(t=>t+1); } }, [d1,d2]);
  return (
    <group>
      <SingleDie val={d1} off={-0.4} trigger={tr} />
      <SingleDie val={d2} off={0.4} trigger={tr} />
      {isDoubles && <mesh position={[0,0.2,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[0.8,0.95,32]} /><meshStandardMaterial color="#FFD54F" emissive="#FFD54F" emissiveIntensity={2} transparent opacity={0.4} side={THREE.DoubleSide} /></mesh>}
    </group>
  );
}

/* ================================================================ */
/*  ANIMAL TOKENS — bigger, resting on board                         */
/* ================================================================ */
function DogToken({ color }: { color: string }) {
  const dk = useMemo(() => new THREE.Color(color).multiplyScalar(0.6).getStyle(), [color]);
  const m = <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} metalness={0.35} roughness={0.35} />;
  return (
    <group scale={[0.85, 0.85, 0.85]}>
      <mesh position={[0,0.14,0]}><capsuleGeometry args={[0.09,0.1,4,8]} />{m}</mesh>
      <mesh position={[0,0.32,0.05]}><sphereGeometry args={[0.1,12,12]} />{m}</mesh>
      <mesh position={[-0.09,0.36,0.03]} rotation={[0.3,0,-0.5]}><boxGeometry args={[0.06,0.1,0.03]} /><meshStandardMaterial color={dk} /></mesh>
      <mesh position={[0.09,0.36,0.03]} rotation={[0.3,0,0.5]}><boxGeometry args={[0.06,0.1,0.03]} /><meshStandardMaterial color={dk} /></mesh>
      <mesh position={[-0.035,0.35,0.1]}><sphereGeometry args={[0.024,8,8]} /><meshStandardMaterial color="#fff" /></mesh>
      <mesh position={[-0.035,0.35,0.118]}><sphereGeometry args={[0.014,8,8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
      <mesh position={[0.035,0.35,0.1]}><sphereGeometry args={[0.024,8,8]} /><meshStandardMaterial color="#fff" /></mesh>
      <mesh position={[0.035,0.35,0.118]}><sphereGeometry args={[0.014,8,8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
      <mesh position={[0,0.3,0.14]}><sphereGeometry args={[0.025,8,8]} /><meshStandardMaterial color="#333" /></mesh>
      <mesh position={[0,0.22,-0.12]} rotation={[-0.8,0,0]}><cylinderGeometry args={[0.018,0.008,0.12,6]} />{m}</mesh>
    </group>
  );
}

function CatToken({ color }: { color: string }) {
  const dk = useMemo(() => new THREE.Color(color).multiplyScalar(0.6).getStyle(), [color]);
  const m = <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} metalness={0.35} roughness={0.35} />;
  return (
    <group scale={[0.85, 0.85, 0.85]}>
      <mesh position={[0,0.12,0]}><cylinderGeometry args={[0.07,0.09,0.18,8]} />{m}</mesh>
      <mesh position={[0,0.3,0.02]}><sphereGeometry args={[0.09,12,12]} />{m}</mesh>
      <mesh position={[-0.06,0.42,0.01]} rotation={[0,0,-0.2]}><coneGeometry args={[0.03,0.08,4]} /><meshStandardMaterial color={dk} /></mesh>
      <mesh position={[0.06,0.42,0.01]} rotation={[0,0,0.2]}><coneGeometry args={[0.03,0.08,4]} /><meshStandardMaterial color={dk} /></mesh>
      <mesh position={[-0.03,0.33,0.08]}><sphereGeometry args={[0.02,8,8]} /><meshStandardMaterial color="#ADFF2F" /></mesh>
      <mesh position={[-0.03,0.33,0.097]}><sphereGeometry args={[0.011,8,8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
      <mesh position={[0.03,0.33,0.08]}><sphereGeometry args={[0.02,8,8]} /><meshStandardMaterial color="#ADFF2F" /></mesh>
      <mesh position={[0.03,0.33,0.097]}><sphereGeometry args={[0.011,8,8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
      <mesh position={[0,0.2,-0.12]} rotation={[-1,0,0.3]}><cylinderGeometry args={[0.015,0.01,0.16,6]} />{m}</mesh>
    </group>
  );
}

function BearToken({ color }: { color: string }) {
  const dk = useMemo(() => new THREE.Color(color).multiplyScalar(0.6).getStyle(), [color]);
  const m = <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} metalness={0.35} roughness={0.35} />;
  return (
    <group scale={[0.85, 0.85, 0.85]}>
      <mesh position={[0,0.15,0]}><sphereGeometry args={[0.12,12,12]} />{m}</mesh>
      <mesh position={[0,0.33,0]}><sphereGeometry args={[0.1,12,12]} />{m}</mesh>
      <mesh position={[-0.08,0.42,0]}><sphereGeometry args={[0.04,8,8]} /><meshStandardMaterial color={dk} /></mesh>
      <mesh position={[0.08,0.42,0]}><sphereGeometry args={[0.04,8,8]} /><meshStandardMaterial color={dk} /></mesh>
      <mesh position={[-0.035,0.36,0.08]}><sphereGeometry args={[0.022,8,8]} /><meshStandardMaterial color="#fff" /></mesh>
      <mesh position={[-0.035,0.36,0.098]}><sphereGeometry args={[0.014,8,8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
      <mesh position={[0.035,0.36,0.08]}><sphereGeometry args={[0.022,8,8]} /><meshStandardMaterial color="#fff" /></mesh>
      <mesh position={[0.035,0.36,0.098]}><sphereGeometry args={[0.014,8,8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
      <mesh position={[0,0.3,0.1]}><sphereGeometry args={[0.035,8,8]} /><meshStandardMaterial color="#F5DEB3" /></mesh>
      <mesh position={[0,0.31,0.13]}><sphereGeometry args={[0.015,8,8]} /><meshStandardMaterial color="#333" /></mesh>
    </group>
  );
}

function FoxToken({ color }: { color: string }) {
  const dk = useMemo(() => new THREE.Color(color).multiplyScalar(0.6).getStyle(), [color]);
  const m = <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} metalness={0.35} roughness={0.35} />;
  return (
    <group scale={[0.85, 0.85, 0.85]}>
      <mesh position={[0,0.12,0]}><capsuleGeometry args={[0.08,0.08,4,8]} />{m}</mesh>
      <mesh position={[0,0.3,0.03]}><sphereGeometry args={[0.09,12,12]} />{m}</mesh>
      <mesh position={[0,0.27,0.12]} rotation={[0.4,0,0]}><coneGeometry args={[0.03,0.08,6]} />{m}</mesh>
      <mesh position={[-0.06,0.44,0]} rotation={[0,0,-0.15]}><coneGeometry args={[0.03,0.12,4]} /><meshStandardMaterial color={dk} /></mesh>
      <mesh position={[0.06,0.44,0]} rotation={[0,0,0.15]}><coneGeometry args={[0.03,0.12,4]} /><meshStandardMaterial color={dk} /></mesh>
      <mesh position={[-0.03,0.33,0.08]}><sphereGeometry args={[0.02,8,8]} /><meshStandardMaterial color="#FFD54F" /></mesh>
      <mesh position={[-0.03,0.33,0.097]}><sphereGeometry args={[0.011,8,8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
      <mesh position={[0.03,0.33,0.08]}><sphereGeometry args={[0.02,8,8]} /><meshStandardMaterial color="#FFD54F" /></mesh>
      <mesh position={[0.03,0.33,0.097]}><sphereGeometry args={[0.011,8,8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
      <mesh position={[0,0.29,0.16]}><sphereGeometry args={[0.015,8,8]} /><meshStandardMaterial color="#333" /></mesh>
      <mesh position={[0,0.18,-0.14]} rotation={[-0.6,0,0]}><sphereGeometry args={[0.06,8,8]} />{m}</mesh>
    </group>
  );
}

const ANIMALS = [DogToken, CatToken, BearToken, FoxToken];

/* ---------------------------------------------------------------- */
/*  Animated token wrapper — hops between tiles, rests on board      */
/* ---------------------------------------------------------------- */
function AnimatedToken({ pi, pos, color, active, alive }: { pi: number; pos: number; color: string; active: boolean; alive: boolean }) {
  const gRef = useRef<THREE.Group>(null);
  const prevP = useRef(pos); const pathQ = useRef<[number,number,number][]>([]); const pathS = useRef(0);
  const Animal = ANIMALS[pi] || DogToken;

  useEffect(() => {
    if (pos === prevP.current) return;
    const fwd = (pos - prevP.current + 40) % 40;
    const path: [number,number,number][] = [];
    if (fwd > 0 && fwd <= 12) {
      let p = prevP.current;
      while (p !== pos) { p = (p+1)%40; const b = BOARD_POSITIONS[p], o = TOKEN_OFFSETS[pi]; path.push([b[0]+o[0], TOKEN_Y, b[2]+o[2]]); }
    } else {
      const b = BOARD_POSITIONS[pos], o = TOKEN_OFFSETS[pi]; path.push([b[0]+o[0], TOKEN_Y, b[2]+o[2]]);
    }
    pathQ.current = path; pathS.current = Date.now(); prevP.current = pos;
  }, [pos, pi]);

  useFrame(() => {
    if (!gRef.current || !alive) return;
    const path = pathQ.current, elapsed = Date.now() - pathS.current;
    if (path.length > 0) {
      const idx = Math.min(Math.floor(elapsed/HOP_MS), path.length-1);
      const tgt = path[idx];
      gRef.current.position.x += (tgt[0]-gRef.current.position.x)*0.18;
      gRef.current.position.z += (tgt[2]-gRef.current.position.z)*0.18;
      gRef.current.position.y = TOKEN_Y + Math.sin(((elapsed%HOP_MS)/HOP_MS)*Math.PI)*0.55;
      if (idx >= path.length-1 && elapsed > path.length*HOP_MS+200) pathQ.current = [];
    } else {
      const b = BOARD_POSITIONS[pos]||BOARD_POSITIONS[0], o = TOKEN_OFFSETS[pi];
      gRef.current.position.x += (b[0]+o[0]-gRef.current.position.x)*0.06;
      gRef.current.position.z += (b[2]+o[2]-gRef.current.position.z)*0.06;
      gRef.current.position.y += (TOKEN_Y-gRef.current.position.y)*0.08; // settle to rest
    }
    const s = active ? 1.15+Math.sin(Date.now()*0.004)*0.06 : 1;
    gRef.current.scale.set(s, s, s);
  });

  if (!alive) return null;
  const b = BOARD_POSITIONS[pos]||BOARD_POSITIONS[0], o = TOKEN_OFFSETS[pi];
  return (
    <group ref={gRef} position={[b[0]+o[0], TOKEN_Y, b[2]+o[2]]}>
      <mesh position={[0,-TOKEN_Y+0.13,0]} rotation={[-Math.PI/2,0,0]}>
        <circleGeometry args={[0.32,32]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active?2.5:0.3} transparent opacity={active?0.35:0.1} side={THREE.DoubleSide} />
      </mesh>
      <Animal color={color} />
      {active && <ActiveRing color={color} />}
    </group>
  );
}

function ActiveRing({ color }: { color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({clock})=>{ if(ref.current){ const s=1+Math.sin(clock.elapsedTime*4)*0.15; ref.current.scale.set(s,s,1); ref.current.rotation.z=clock.elapsedTime*0.5; }});
  return <mesh ref={ref} position={[0,-TOKEN_Y+0.14,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[0.35,0.45,6]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} transparent opacity={0.45} side={THREE.DoubleSide} /></mesh>;
}

/* ================================================================ */
/*  MONEY FX                                                         */
/* ================================================================ */
interface FxDef { id:number; from:[number,number,number]; to:[number,number,number]; start:number; }
function MoneyParticle({ fx, onDone }: { fx: FxDef; onDone: ()=>void }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(()=>{
    if(!ref.current) return;
    const t = Math.min((Date.now()-fx.start)/1000,1);
    if(t>=1){onDone();return;}
    ref.current.position.x=fx.from[0]+(fx.to[0]-fx.from[0])*t;
    ref.current.position.z=fx.from[2]+(fx.to[2]-fx.from[2])*t;
    ref.current.position.y=0.8+Math.sin(t*Math.PI)*2;
    ref.current.rotation.y=t*14;
  });
  return <mesh ref={ref} position={[fx.from[0],0.8,fx.from[2]]}><cylinderGeometry args={[0.09,0.09,0.035,12]} /><meshStandardMaterial color="#FFD700" emissive="#FFA000" emissiveIntensity={1.5} metalness={0.9} roughness={0.1} /></mesh>;
}

/* ================================================================ */
/*  SCENE                                                            */
/* ================================================================ */
function Scene({ snapshot, latestEvents, activeCard }: { snapshot: Snapshot|null; latestEvents: GameEvent[]; activeCard: {text:string;type:string}|null }) {
  const [effects, setEffects] = useState<FxDef[]>([]);
  const fxId = useRef(0);

  const owners = useMemo(() => {
    const o: Record<number,number> = {};
    if (!snapshot) return o;
    for (const p of snapshot.properties) { if (p.ownerIndex>=0 && p.index<PROPERTY_TO_TILE.length) o[PROPERTY_TO_TILE[p.index]]=p.ownerIndex; }
    return o;
  }, [snapshot]);

  useEffect(() => {
    if (!snapshot || !latestEvents.length) return;
    const nf: FxDef[] = [];
    for (const ev of latestEvents) {
      if ((ev.type==='PAID_RENT'||ev.type==='PAID_TAX') && ev.player!==undefined) {
        const fp=snapshot.players[ev.player], tp=ev.toPlayer!==undefined?snapshot.players[ev.toPlayer]:null;
        if (fp) {
          const fb=BOARD_POSITIONS[fp.position]||BOARD_POSITIONS[0], tb=tp?(BOARD_POSITIONS[tp.position]||BOARD_POSITIONS[0]):[0,0,0] as [number,number,number];
          for (let c=0;c<4;c++) nf.push({id:fxId.current++,from:[fb[0],0,fb[2]],to:[tb[0],0,tb[2]],start:Date.now()+c*100});
        }
      }
    }
    if (nf.length) setEffects(p=>[...p.slice(-12),...nf]);
  }, [latestEvents, snapshot]);

  const rmFx = useCallback((id:number)=>setEffects(p=>p.filter(f=>f.id!==id)),[]);

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[8,22,6]} intensity={0.9} color="#FFFAF0" />
      <directionalLight position={[-6,14,-4]} intensity={0.3} color="#FFF5E6" />
      <pointLight position={[0,16,0]} intensity={0.6} color="#FFFDE7" distance={35} />
      <pointLight position={[-8,8,8]} intensity={0.3} color="#FFB74D" distance={20} />
      <pointLight position={[8,8,-8]} intensity={0.3} color="#4FC3F7" distance={20} />
      <fog attach="fog" args={['#0C1B3A',28,55]} />
      <Sparkles count={250} scale={28} size={4} color="#FFD54F" speed={0.3} opacity={0.25} />
      <Sparkles count={120} scale={22} size={3} color="#4FC3F7" speed={0.2} opacity={0.15} />

      <GameBoard propertyOwners={owners} />

      {snapshot?.players.map((p,i) => (
        <AnimatedToken key={i} pi={i} pos={p.position} color={PLAYER_COLORS[i]} active={i===snapshot.currentPlayerIndex} alive={p.alive} />
      ))}

      {snapshot?.lastDice && <AnimatedDice d1={snapshot.lastDice.d1} d2={snapshot.lastDice.d2} isDoubles={snapshot.lastDice.isDoubles} />}

      {activeCard && <CardAnimation text={activeCard.text} type={activeCard.type} visible={!!activeCard} />}

      {effects.map(fx=><MoneyParticle key={fx.id} fx={fx} onDone={()=>rmFx(fx.id)} />)}

      <OrbitControls target={[0,0,0]} maxPolarAngle={Math.PI/2.1} minPolarAngle={0.15} minDistance={6} maxDistance={26} enableDamping dampingFactor={0.05} autoRotate={!snapshot} autoRotateSpeed={0.4} />
    </>
  );
}

/* ================================================================ */
/*  EXPORT                                                           */
/* ================================================================ */
export default function MonopolyScene({ snapshot, latestEvents=[], activeCard=null }: { snapshot:Snapshot|null; latestEvents?:GameEvent[]; activeCard?:{text:string;type:string}|null }) {
  return (
    <Canvas camera={{position:[0,16,12],fov:36}} style={{background:'linear-gradient(180deg,#0C1B3A 0%,#15103A 40%,#0A2030 100%)'}} gl={{antialias:true,alpha:false}} dpr={[1,2]}>
      <Scene snapshot={snapshot} latestEvents={latestEvents} activeCard={activeCard} />
    </Canvas>
  );
}
