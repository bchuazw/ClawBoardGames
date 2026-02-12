'use client';

import { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import {
  BOARD_POSITIONS, TILE_DATA, GROUP_COLORS,
  PLAYER_COLORS, TOKEN_OFFSETS, PROPERTY_TO_TILE, getTileEdge,
  JAIL_CELL_OFFSETS,
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

const TOKEN_Y = 0.20;
const HOP_MS = 170;
const MOVE_DELAY = 1400;
const TILE_NAMES: Record<number, string> = {};
TILE_DATA.forEach(t => { TILE_NAMES[t.position] = t.name; });

/* ================================================================ */
/*  BOARD  (scaled 1.2x — all dims proportional)                     */
/* ================================================================ */
function GameBoard({ propertyOwners }: { propertyOwners: Record<number, number> }) {
  return (
    <group>
      {/* Thick board body */}
      <mesh position={[0, -0.24, 0]}>
        <boxGeometry args={[14.9, 0.65, 14.9]} />
        <meshStandardMaterial color="#6D3A1A" metalness={0.15} roughness={0.65} />
      </mesh>
      {/* Board rim */}
      <mesh position={[0, -0.01, 0]}>
        <boxGeometry args={[14.5, 0.14, 14.5]} />
        <meshStandardMaterial color="#8B5E3C" metalness={0.1} roughness={0.7} />
      </mesh>
      {/* Green felt */}
      <mesh position={[0, 0.07, 0]}>
        <boxGeometry args={[13.9, 0.06, 13.9]} />
        <meshStandardMaterial color="#2E8B3C" metalness={0.05} roughness={0.92} />
      </mesh>
      {/* Inner play area */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.103, 0]}>
        <planeGeometry args={[10.1, 10.1]} />
        <meshStandardMaterial color="#1E7832" />
      </mesh>

      {/* Gold trim rails */}
      {[[0, 7.0, 14.4, 0.1], [0, -7.0, 14.4, 0.1], [7.0, 0, 0.1, 14.4], [-7.0, 0, 0.1, 14.4]].map(([x, z, w, d], i) => (
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
      <BoardDecorations />

      {/* Warm corner lights */}
      <pointLight position={[6.6, 0.6, 6.6]} intensity={0.5} color="#FFD54F" distance={6} />
      <pointLight position={[-6.6, 0.6, 6.6]} intensity={0.5} color="#FF9100" distance={6} />
      <pointLight position={[-6.6, 0.6, -6.6]} intensity={0.5} color="#E040FB" distance={6} />
      <pointLight position={[6.6, 0.6, -6.6]} intensity={0.5} color="#00B8D4" distance={6} />
    </group>
  );
}

/* ---- 3D DECORATIONS: pillars, lamp posts, trees, trophy ---- */
function BoardDecorations() {
  return (
    <group>
      {/* Corner gold pillars with orbs */}
      {[[6.4, 6.4], [-6.4, 6.4], [-6.4, -6.4], [6.4, -6.4]].map(([x, z], i) => (
        <group key={`pil${i}`} position={[x, 0.12, z]}>
          <mesh position={[0, 0.04, 0]}><boxGeometry args={[0.2, 0.08, 0.2]} /><meshStandardMaterial color="#D4A84B" metalness={0.9} roughness={0.1} /></mesh>
          <mesh position={[0, 0.42, 0]}><cylinderGeometry args={[0.05, 0.065, 0.65, 8]} /><meshStandardMaterial color="#D4A84B" metalness={0.85} roughness={0.15} /></mesh>
          <mesh position={[0, 0.78, 0]}><sphereGeometry args={[0.09, 12, 12]} /><meshStandardMaterial color="#FFD700" metalness={0.9} roughness={0.08} emissive="#FFD700" emissiveIntensity={0.2} /></mesh>
          <pointLight position={[0, 0.78, 0]} intensity={0.15} color="#FFD700" distance={2.8} />
        </group>
      ))}

      {/* Lamp posts along inner edges */}
      {[
        [-3.6, -5.0], [-1.2, -5.0], [1.2, -5.0], [3.6, -5.0],
        [-3.6, 5.0], [-1.2, 5.0], [1.2, 5.0], [3.6, 5.0],
        [-5.0, -2.4], [-5.0, 0], [-5.0, 2.4],
        [5.0, -2.4], [5.0, 0], [5.0, 2.4],
      ].map(([x, z], i) => (
        <group key={`lmp${i}`} position={[x, 0.12, z]}>
          <mesh position={[0, 0.32, 0]}><cylinderGeometry args={[0.014, 0.02, 0.55, 6]} /><meshStandardMaterial color="#444" metalness={0.7} roughness={0.3} /></mesh>
          <mesh position={[0, 0.62, 0]}><sphereGeometry args={[0.04, 8, 8]} /><meshStandardMaterial color="#FFD54F" emissive="#FFD54F" emissiveIntensity={1.5} /></mesh>
          <pointLight position={[0, 0.62, 0]} intensity={0.07} color="#FFD54F" distance={1.8} />
        </group>
      ))}

      {/* Trees — clusters */}
      {[
        [-4.0, 4.0, 1.2], [-4.4, 3.2, 0.9], [-3.4, 4.5, 0.85],
        [3.8, -4.2, 1.1], [4.3, -3.5, 0.8],
      ].map(([x, z, sc], i) => (
        <group key={`tree${i}`} position={[x, 0.12, z]} scale={[sc, sc, sc]}>
          <mesh position={[0, 0.24, 0]}><cylinderGeometry args={[0.03, 0.045, 0.38, 6]} /><meshStandardMaterial color="#5D4037" /></mesh>
          <mesh position={[0, 0.48, 0]}><coneGeometry args={[0.16, 0.32, 8]} /><meshStandardMaterial color="#2E7D32" /></mesh>
          <mesh position={[0, 0.7, 0]}><coneGeometry args={[0.12, 0.27, 8]} /><meshStandardMaterial color="#388E3C" /></mesh>
          <mesh position={[0, 0.87, 0]}><coneGeometry args={[0.07, 0.2, 8]} /><meshStandardMaterial color="#43A047" /></mesh>
        </group>
      ))}

      <Trophy />
    </group>
  );
}

function Trophy() {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (ref.current) ref.current.rotation.y = clock.elapsedTime * 0.15; });
  return (
    <group ref={ref} position={[0, 0.12, 0.5]}>
      <mesh position={[0, 0.03, 0]}><cylinderGeometry args={[0.24, 0.28, 0.05, 12]} /><meshStandardMaterial color="#333" metalness={0.8} roughness={0.2} /></mesh>
      <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.045, 0.08, 0.28, 8]} /><meshStandardMaterial color="#D4A84B" metalness={0.9} roughness={0.1} /></mesh>
      <mesh position={[0, 0.44, 0]}><cylinderGeometry args={[0.2, 0.09, 0.32, 12]} /><meshStandardMaterial color="#FFD700" metalness={0.9} roughness={0.08} emissive="#FFD700" emissiveIntensity={0.12} /></mesh>
      <mesh position={[-0.24, 0.44, 0]} rotation={[0, 0, 0.2]}><torusGeometry args={[0.08, 0.017, 8, 12, Math.PI]} /><meshStandardMaterial color="#D4A84B" metalness={0.9} roughness={0.1} /></mesh>
      <mesh position={[0.24, 0.44, 0]} rotation={[0, Math.PI, 0.2]}><torusGeometry args={[0.08, 0.017, 8, 12, Math.PI]} /><meshStandardMaterial color="#D4A84B" metalness={0.9} roughness={0.1} /></mesh>
      <pointLight position={[0, 0.55, 0]} intensity={0.12} color="#FFD700" distance={1.8} />
    </group>
  );
}

function NeonBorder() {
  const mk = (pts: number[][]) => useMemo(() => pts.map(p => new THREE.Vector3(...p)), []);
  const outer = mk([[-6.8, 0.13, -6.8], [6.8, 0.13, -6.8], [6.8, 0.13, 6.8], [-6.8, 0.13, 6.8], [-6.8, 0.13, -6.8]]);
  const inner = mk([[-5.2, 0.13, -5.2], [5.2, 0.13, -5.2], [5.2, 0.13, 5.2], [-5.2, 0.13, 5.2], [-5.2, 0.13, -5.2]]);
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
/*  TILES                                                            */
/* ---------------------------------------------------------------- */
function BoardTile({ tile, position, ownerIndex }: { tile: typeof TILE_DATA[0]; position: [number, number, number]; ownerIndex: number }) {
  const gc = GROUP_COLORS[tile.group] || '#2E8B3C';
  const edge = getTileEdge(tile.position);
  const isProp = tile.group > 0;

  let w = 1.1, d = 1.1;
  if (tile.isCorner) { w = 1.2; d = 1.2; }
  else if (edge === 'bottom' || edge === 'top') { w = 1.1; d = 0.78; }
  else { w = 0.78; d = 1.1; }

  const pos: [number, number, number] = [position[0], 0.11, position[2]];

  let sPos: [number, number, number] = [0, 0.03, 0], sW = w, sD = d * 0.32;
  if (!tile.isCorner && isProp) {
    if (edge === 'bottom') sPos = [0, 0.03, -d * 0.34];
    if (edge === 'top') sPos = [0, 0.03, d * 0.34];
    if (edge === 'left') { sPos = [w * 0.34, 0.03, 0]; sW = w * 0.32; sD = d; }
    if (edge === 'right') { sPos = [-w * 0.34, 0.03, 0]; sW = w * 0.32; sD = d; }
  }

  let tRot: [number, number, number] = [-Math.PI / 2, 0, 0];
  if (edge === 'left') tRot = [-Math.PI / 2, 0, Math.PI / 2];
  if (edge === 'right') tRot = [-Math.PI / 2, 0, -Math.PI / 2];
  if (edge === 'top') tRot = [-Math.PI / 2, 0, Math.PI];

  const displayName = tile.isCorner ? tile.name : (tile.name.length > 14 ? tile.shortName : tile.name.replace(' Ave', '').replace(' Place', ' Pl'));

  return (
    <group position={pos}>
      <mesh><boxGeometry args={[w, 0.06, d]} /><meshStandardMaterial color={tile.isCorner ? '#E8DCC8' : '#F5EED6'} metalness={0.04} roughness={0.8} /></mesh>
      {isProp && !tile.isCorner && (
        <mesh position={sPos}><boxGeometry args={[sW, 0.07, sD]} />
          <meshStandardMaterial color={gc} emissive={gc} emissiveIntensity={ownerIndex >= 0 ? 0.45 : 0.12} metalness={0.3} roughness={0.5} />
        </mesh>
      )}
      {tile.position === 0 && <CornerGo rotation={tRot} />}
      {tile.position === 10 && <CornerJail rotation={tRot} />}
      {tile.position === 20 && <CornerFreeParking rotation={tRot} />}
      {tile.position === 30 && <CornerGoToJail rotation={tRot} />}
      {!tile.isCorner && (
        <group>
          <Text position={[0, 0.08, 0]} rotation={tRot} fontSize={0.082} color="#3A3020" anchorX="center" anchorY="middle" maxWidth={w * 0.85} textAlign="center">{displayName}</Text>
          {tile.price > 0 && (
            <Text position={[0, 0.08, edge === 'bottom' ? 0.14 : (edge === 'top' ? -0.14 : 0)]} rotation={tRot} fontSize={0.065} color="#7A6B50" anchorX="center" anchorY="middle">${tile.price}</Text>
          )}
          {tile.type === 'chance' && (
            <group position={[0, 0.04, 0]}>
              <mesh rotation={[-Math.PI / 2, 0, 0]}><boxGeometry args={[0.22, 0.3, 0.02]} /><meshStandardMaterial color="#FF9100" emissive="#FF9100" emissiveIntensity={0.15} /></mesh>
              <Text position={[0, 0.04, 0]} rotation={tRot} fontSize={0.17} color="#fff" anchorX="center" anchorY="middle" fontWeight={800}>?</Text>
            </group>
          )}
          {tile.type === 'community' && (
            <group position={[0, 0.05, 0]}>
              <mesh><boxGeometry args={[0.18, 0.09, 0.14]} /><meshStandardMaterial color="#42A5F5" /></mesh>
              <mesh position={[0, 0.055, 0]}><boxGeometry args={[0.2, 0.03, 0.16]} /><meshStandardMaterial color="#1E88E5" /></mesh>
              <Text position={[0, 0.09, 0]} rotation={tRot} fontSize={0.05} color="#fff" anchorX="center" anchorY="middle">CHEST</Text>
            </group>
          )}
          {tile.type === 'tax' && (
            <group position={[0, 0.04, 0]}>
              <mesh rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.14, 12]} /><meshStandardMaterial color="#EF5350" emissive="#EF5350" emissiveIntensity={0.15} side={THREE.DoubleSide} /></mesh>
              <Text position={[0, 0.04, 0]} rotation={tRot} fontSize={0.13} color="#fff" anchorX="center" anchorY="middle" fontWeight={800}>$</Text>
            </group>
          )}
        </group>
      )}
      {ownerIndex >= 0 && !tile.isCorner && (
        <OwnerFlag
          position={[
            edge === 'right' ? w * 0.3 : (edge === 'left' ? -w * 0.3 : 0),
            0.02,
            edge === 'bottom' ? d * 0.3 : (edge === 'top' ? -d * 0.3 : 0),
          ]}
          color={PLAYER_COLORS[ownerIndex]}
        />
      )}
    </group>
  );
}

/* ---- GO corner: green flag on pole ---- */
function CornerGo({ rotation }: { rotation: [number, number, number] }) {
  const flagRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (flagRef.current) flagRef.current.rotation.y = Math.sin(clock.elapsedTime * 2) * 0.12; });
  return (
    <group>
      {/* Flag pole */}
      <mesh position={[0.35, 0.35, 0]}><cylinderGeometry args={[0.02, 0.025, 0.6, 8]} /><meshStandardMaterial color="#FFD700" metalness={0.8} roughness={0.15} /></mesh>
      <mesh position={[0.35, 0.68, 0]}><sphereGeometry args={[0.04, 8, 8]} /><meshStandardMaterial color="#FFD700" metalness={0.9} /></mesh>
      {/* Flag fabric — waves */}
      <group ref={flagRef} position={[0.35, 0.52, 0]}>
        <mesh position={[-0.14, 0, 0]}><boxGeometry args={[0.26, 0.16, 0.01]} /><meshStandardMaterial color="#4CAF50" emissive="#4CAF50" emissiveIntensity={0.35} side={THREE.DoubleSide} /></mesh>
        <Text position={[-0.14, 0, 0.008]} rotation={[0, 0, 0]} fontSize={0.07} color="#fff" anchorX="center" anchorY="middle" fontWeight={800}>GO</Text>
      </group>
      {/* Arrow on floor */}
      <mesh position={[-0.15, 0.06, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.14, 0.3, 3]} /><meshStandardMaterial color="#4CAF50" emissive="#4CAF50" emissiveIntensity={0.25} /></mesh>
      <Text position={[-0.15, 0.08, -0.2]} rotation={rotation} fontSize={0.22} color="#2E7D32" anchorX="center" fontWeight={800}>GO</Text>
      <Text position={[0, 0.08, 0.42]} rotation={rotation} fontSize={0.075} color="#4CAF50" anchorX="center">COLLECT $200</Text>
    </group>
  );
}

/* ---- JAIL corner: proper cell with bars ---- */
function CornerJail({ rotation }: { rotation: [number, number, number] }) {
  return (
    <group>
      {/* Jail cell — offset to one quadrant so "just visiting" path is clear */}
      <group position={[0.2, 0.12, 0.2]}>
        {/* Floor */}
        <mesh position={[0, 0, 0]}><boxGeometry args={[0.55, 0.02, 0.55]} /><meshStandardMaterial color="#666" roughness={0.8} /></mesh>
        {/* Back wall */}
        <mesh position={[0, 0.2, -0.275]}><boxGeometry args={[0.55, 0.4, 0.03]} /><meshStandardMaterial color="#777" roughness={0.7} /></mesh>
        {/* Side wall (right) */}
        <mesh position={[0.275, 0.2, 0]}><boxGeometry args={[0.03, 0.4, 0.55]} /><meshStandardMaterial color="#777" roughness={0.7} /></mesh>
        {/* Ceiling */}
        <mesh position={[0, 0.4, 0]}><boxGeometry args={[0.55, 0.02, 0.55]} /><meshStandardMaterial color="#555" /></mesh>
        {/* Front bars */}
        {[-0.2, -0.1, 0, 0.1, 0.2].map((x, i) => (
          <mesh key={`f${i}`} position={[x, 0.2, 0.275]}><cylinderGeometry args={[0.013, 0.013, 0.4, 6]} /><meshStandardMaterial color="#444" metalness={0.7} /></mesh>
        ))}
        {/* Front top bar */}
        <mesh position={[0, 0.39, 0.275]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.013, 0.013, 0.44, 6]} /><meshStandardMaterial color="#444" metalness={0.7} /></mesh>
        {/* Left side bars */}
        {[-0.2, -0.1, 0, 0.1, 0.2].map((z, i) => (
          <mesh key={`s${i}`} position={[-0.275, 0.2, z]}><cylinderGeometry args={[0.013, 0.013, 0.4, 6]} /><meshStandardMaterial color="#444" metalness={0.7} /></mesh>
        ))}
        {/* Left top bar */}
        <mesh position={[-0.275, 0.39, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.013, 0.013, 0.58, 6]} /><meshStandardMaterial color="#444" metalness={0.7} /></mesh>
        {/* Bench inside */}
        <mesh position={[0.08, 0.08, -0.12]}><boxGeometry args={[0.3, 0.04, 0.1]} /><meshStandardMaterial color="#8D6E63" /></mesh>
        <mesh position={[-0.05, 0.04, -0.12]}><boxGeometry args={[0.03, 0.08, 0.08]} /><meshStandardMaterial color="#795548" /></mesh>
        <mesh position={[0.2, 0.04, -0.12]}><boxGeometry args={[0.03, 0.08, 0.08]} /><meshStandardMaterial color="#795548" /></mesh>
      </group>
      <Text position={[-0.25, 0.08, -0.35]} rotation={rotation} fontSize={0.17} color="#D84315" anchorX="center" fontWeight={800}>JAIL</Text>
      <Text position={[-0.2, 0.08, 0.52]} rotation={rotation} fontSize={0.06} color="#8D6E63" anchorX="center">JUST VISITING</Text>
    </group>
  );
}

/* ---- FREE PARKING: 3D car + parking sign ---- */
function CornerFreeParking({ rotation }: { rotation: [number, number, number] }) {
  return (
    <group>
      {/* 3D Car */}
      <group position={[0.05, 0.12, 0.05]} rotation={[0, Math.PI / 5, 0]}>
        {/* Car body */}
        <mesh position={[0, 0.07, 0]}><boxGeometry args={[0.55, 0.09, 0.28]} /><meshStandardMaterial color="#E53935" metalness={0.45} roughness={0.3} /></mesh>
        {/* Cabin */}
        <mesh position={[0.06, 0.16, 0]}><boxGeometry args={[0.28, 0.09, 0.25]} /><meshStandardMaterial color="#E53935" metalness={0.45} roughness={0.3} /></mesh>
        {/* Windshield */}
        <mesh position={[-0.1, 0.16, 0]}><boxGeometry args={[0.04, 0.08, 0.23]} /><meshStandardMaterial color="#81D4FA" transparent opacity={0.65} /></mesh>
        {/* Wheels */}
        {[[-0.18, 0.025, 0.15], [-0.18, 0.025, -0.15], [0.18, 0.025, 0.15], [0.18, 0.025, -0.15]].map(([x, y, z], i) => (
          <mesh key={i} position={[x, y, z]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.042, 0.042, 0.03, 12]} /><meshStandardMaterial color="#333" /></mesh>
        ))}
        {/* Headlights */}
        <mesh position={[-0.28, 0.09, 0.09]}><sphereGeometry args={[0.022, 8, 8]} /><meshStandardMaterial color="#FFD54F" emissive="#FFD54F" emissiveIntensity={1.2} /></mesh>
        <mesh position={[-0.28, 0.09, -0.09]}><sphereGeometry args={[0.022, 8, 8]} /><meshStandardMaterial color="#FFD54F" emissive="#FFD54F" emissiveIntensity={1.2} /></mesh>
        {/* Tail lights */}
        <mesh position={[0.28, 0.09, 0.09]}><sphereGeometry args={[0.018, 8, 8]} /><meshStandardMaterial color="#E53935" emissive="#E53935" emissiveIntensity={0.6} /></mesh>
        <mesh position={[0.28, 0.09, -0.09]}><sphereGeometry args={[0.018, 8, 8]} /><meshStandardMaterial color="#E53935" emissive="#E53935" emissiveIntensity={0.6} /></mesh>
      </group>
      {/* Parking sign */}
      <mesh position={[-0.4, 0.4, 0.4]}><cylinderGeometry args={[0.016, 0.016, 0.5, 6]} /><meshStandardMaterial color="#666" metalness={0.5} /></mesh>
      <mesh position={[-0.4, 0.66, 0.4]}><boxGeometry args={[0.16, 0.14, 0.02]} /><meshStandardMaterial color="#1565C0" /></mesh>
      <Text position={[-0.4, 0.66, 0.415]} rotation={[0, 0, 0]} fontSize={0.09} color="#fff" anchorX="center" anchorY="middle" fontWeight={800}>P</Text>
      <Text position={[0, 0.08, -0.5]} rotation={rotation} fontSize={0.075} color="#F9A825" anchorX="center">FREE</Text>
      <Text position={[0, 0.08, 0.5]} rotation={rotation} fontSize={0.065} color="#F9A825" anchorX="center">PARKING</Text>
    </group>
  );
}

/* ---- GO TO JAIL: police car with siren ---- */
function CornerGoToJail({ rotation }: { rotation: [number, number, number] }) {
  const redRef = useRef<THREE.Mesh>(null);
  const blueRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const on = Math.sin(clock.elapsedTime * 3) > 0;
    if (redRef.current) (redRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 2.5 : 0.1;
    if (blueRef.current) (blueRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 0.1 : 2.5;
  });
  return (
    <group>
      {/* Police car */}
      <group position={[0.1, 0.12, 0]} rotation={[0, -Math.PI / 5, 0]}>
        <mesh position={[0, 0.065, 0]}><boxGeometry args={[0.5, 0.08, 0.24]} /><meshStandardMaterial color="#1a1a1a" metalness={0.35} roughness={0.3} /></mesh>
        <mesh position={[0.06, 0.14, 0]}><boxGeometry args={[0.24, 0.08, 0.22]} /><meshStandardMaterial color="#1a1a1a" metalness={0.35} roughness={0.3} /></mesh>
        {/* White stripe */}
        <mesh position={[0, 0.108, 0.121]}><boxGeometry args={[0.48, 0.03, 0.005]} /><meshStandardMaterial color="#fff" /></mesh>
        {/* Siren bar */}
        <mesh position={[0.06, 0.195, 0]}><boxGeometry args={[0.16, 0.022, 0.065]} /><meshStandardMaterial color="#333" metalness={0.5} /></mesh>
        <mesh ref={redRef} position={[0.01, 0.215, 0]}><sphereGeometry args={[0.025, 8, 8]} /><meshStandardMaterial color="#E53935" emissive="#E53935" emissiveIntensity={2} /></mesh>
        <mesh ref={blueRef} position={[0.11, 0.215, 0]}><sphereGeometry args={[0.025, 8, 8]} /><meshStandardMaterial color="#1565C0" emissive="#1565C0" emissiveIntensity={0.1} /></mesh>
        {/* Wheels */}
        {[[-0.15, 0.022, 0.13], [-0.15, 0.022, -0.13], [0.15, 0.022, 0.13], [0.15, 0.022, -0.13]].map(([x, y, z], i) => (
          <mesh key={i} position={[x, y, z]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.035, 0.035, 0.025, 10]} /><meshStandardMaterial color="#333" /></mesh>
        ))}
        {/* Headlights */}
        <mesh position={[-0.26, 0.08, 0.08]}><sphereGeometry args={[0.018, 8, 8]} /><meshStandardMaterial color="#FFD54F" emissive="#FFD54F" emissiveIntensity={0.8} /></mesh>
        <mesh position={[-0.26, 0.08, -0.08]}><sphereGeometry args={[0.018, 8, 8]} /><meshStandardMaterial color="#FFD54F" emissive="#FFD54F" emissiveIntensity={0.8} /></mesh>
      </group>
      {/* Jail bars */}
      {[-0.15, -0.05, 0.05, 0.15].map((x, i) => (
        <mesh key={i} position={[x - 0.22, 0.24, -0.3]}><cylinderGeometry args={[0.013, 0.013, 0.22, 6]} /><meshStandardMaterial color="#555" metalness={0.6} /></mesh>
      ))}
      <Text position={[0, 0.08, -0.5]} rotation={rotation} fontSize={0.1} color="#C62828" anchorX="center" fontWeight={800}>GO TO</Text>
      <Text position={[0, 0.08, 0.5]} rotation={rotation} fontSize={0.13} color="#C62828" anchorX="center" fontWeight={800}>JAIL</Text>
    </group>
  );
}

/* Owner flag */
function OwnerFlag({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.04, 0]}><cylinderGeometry args={[0.05, 0.06, 0.05, 8]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} metalness={0.4} /></mesh>
      <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.008, 0.008, 0.24, 4]} /><meshStandardMaterial color="#333" metalness={0.5} /></mesh>
      <mesh position={[0.04, 0.29, 0]}><boxGeometry args={[0.06, 0.045, 0.012]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} /></mesh>
    </group>
  );
}

/* ---------------------------------------------------------------- */
/*  BOARD CENTER — city skyline, card decks, trophy                  */
/* ---------------------------------------------------------------- */
function BoardCenter() {
  return (
    <group>
      <Text position={[0, 0.13, -1.5]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.65} color="#D4A84B" anchorX="center" letterSpacing={0.1} fontWeight={800}>MONOPOLY</Text>
      <Text position={[0, 0.13, -0.55]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.24} color="#5D3A1A" anchorX="center" letterSpacing={0.25}>AI AGENTS</Text>

      {/* Gold frame */}
      {[[-2.6, -1.8, 5.2, 0.04], [-2.6, -0.1, 5.2, 0.04], [-2.6, -1.8, 0.04, 1.74], [2.56, -1.8, 0.04, 1.74]].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x + (w as number) / 2, 0.125, z + (d as number) / 2]}>
          <boxGeometry args={[w, 0.015, d]} /><meshStandardMaterial color="#D4A84B" metalness={0.8} roughness={0.15} />
        </mesh>
      ))}

      <CardDeck position={[-2.1, 0, 1.6]} color="#FF9100" label="CHANCE" symbol="?" />
      <CardDeck position={[2.1, 0, 1.6]} color="#42A5F5" label="COMMUNITY" symbol="C" />

      {/* Mini city skyline */}
      <CityCenter />

      {/* Gold emblem */}
      <mesh position={[0, 0.15, 0.5]} rotation={[0, Math.PI / 4, 0]}><boxGeometry args={[0.55, 0.03, 0.55]} /><meshStandardMaterial color="#D4A84B" metalness={0.9} roughness={0.1} emissive="#D4A84B" emissiveIntensity={0.15} /></mesh>
      {/* Star accents */}
      {[[-2.4, 2.6], [2.4, 2.6], [-2.4, -2.2], [2.4, -2.2]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.13, z]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
          <circleGeometry args={[0.18, 6]} /><meshStandardMaterial color="#D4A84B" emissive="#D4A84B" emissiveIntensity={0.1} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* Train tracks */}
      {[-0.95, -0.48, 0, 0.48, 0.95].map((x, i) => (
        <mesh key={i} position={[x, 0.125, 3.3]}><boxGeometry args={[0.09, 0.012, 0.55]} /><meshStandardMaterial color="#8D6E63" /></mesh>
      ))}
      <mesh position={[0, 0.13, 3.15]}><boxGeometry args={[2.1, 0.01, 0.04]} /><meshStandardMaterial color="#5D4037" /></mesh>
      <mesh position={[0, 0.13, 3.5]}><boxGeometry args={[2.1, 0.01, 0.04]} /><meshStandardMaterial color="#5D4037" /></mesh>
    </group>
  );
}

/* ---- Mini city in board center ---- */
function CityCenter() {
  return (
    <group position={[0, 0.12, -2.4]}>
      {/* Tall office tower */}
      <group position={[-0.9, 0, 0.2]}>
        <mesh position={[0, 0.5, 0]}><boxGeometry args={[0.4, 1.0, 0.35]} /><meshStandardMaterial color="#546E7A" metalness={0.35} roughness={0.4} /></mesh>
        <mesh position={[0, 1.02, 0]}><boxGeometry args={[0.42, 0.02, 0.37]} /><meshStandardMaterial color="#37474F" /></mesh>
        {/* Windows (front) */}
        {[0.15, 0.35, 0.55, 0.75].map((y, i) => (
          <mesh key={`wf${i}`} position={[0.201, y, 0]}><boxGeometry args={[0.01, 0.08, 0.24]} /><meshStandardMaterial color="#FFD54F" emissive="#FFD54F" emissiveIntensity={0.4} /></mesh>
        ))}
        {/* Windows (side) */}
        {[0.15, 0.35, 0.55, 0.75].map((y, i) => (
          <mesh key={`ws${i}`} position={[0, y, 0.176]}><boxGeometry args={[0.28, 0.08, 0.01]} /><meshStandardMaterial color="#FFD54F" emissive="#FFD54F" emissiveIntensity={0.3} /></mesh>
        ))}
      </group>

      {/* Brick building */}
      <group position={[0.85, 0, 0]}>
        <mesh position={[0, 0.3, 0]}><boxGeometry args={[0.45, 0.6, 0.35]} /><meshStandardMaterial color="#8D6E63" roughness={0.7} /></mesh>
        <mesh position={[0, 0.62, 0]}><boxGeometry args={[0.47, 0.02, 0.37]} /><meshStandardMaterial color="#6D4C41" /></mesh>
        {[0.12, 0.3, 0.48].map((y, i) => (
          <mesh key={i} position={[0.226, y, 0]}><boxGeometry args={[0.01, 0.07, 0.22]} /><meshStandardMaterial color="#FFE082" emissive="#FFE082" emissiveIntensity={0.3} /></mesh>
        ))}
      </group>

      {/* Church / tall spire */}
      <group position={[0, 0, -0.1]}>
        <mesh position={[0, 0.4, 0]}><boxGeometry args={[0.32, 0.8, 0.28]} /><meshStandardMaterial color="#757575" roughness={0.5} /></mesh>
        <mesh position={[0, 0.85, 0]}><coneGeometry args={[0.2, 0.35, 4]} /><meshStandardMaterial color="#616161" /></mesh>
        <mesh position={[0, 1.05, 0]}><sphereGeometry args={[0.025, 8, 8]} /><meshStandardMaterial color="#FFD700" metalness={0.9} /></mesh>
        {[0.15, 0.35, 0.55].map((y, i) => (
          <mesh key={i} position={[0.161, y, 0]}><boxGeometry args={[0.01, 0.06, 0.16]} /><meshStandardMaterial color="#BBDEFB" emissive="#BBDEFB" emissiveIntensity={0.15} /></mesh>
        ))}
      </group>

      {/* Small shop */}
      <group position={[0.4, 0, 0.5]}>
        <mesh position={[0, 0.14, 0]}><boxGeometry args={[0.3, 0.28, 0.24]} /><meshStandardMaterial color="#BCAAA4" /></mesh>
        <mesh position={[0, 0.3, 0]}><boxGeometry args={[0.34, 0.02, 0.28]} /><meshStandardMaterial color="#4E342E" /></mesh>
        <mesh position={[0, 0.14, 0.121]}><boxGeometry args={[0.12, 0.1, 0.01]} /><meshStandardMaterial color="#FFE082" emissive="#FFE082" emissiveIntensity={0.2} /></mesh>
      </group>

      {/* Modern glass tower */}
      <group position={[-0.35, 0, 0.55]}>
        <mesh position={[0, 0.35, 0]}><boxGeometry args={[0.28, 0.7, 0.26]} /><meshStandardMaterial color="#455A64" metalness={0.5} roughness={0.25} /></mesh>
        <mesh position={[0, 0.72, 0]}><boxGeometry args={[0.3, 0.02, 0.28]} /><meshStandardMaterial color="#37474F" /></mesh>
        {[0.1, 0.25, 0.4, 0.55].map((y, i) => (
          <mesh key={i} position={[0.141, y, 0]}><boxGeometry args={[0.01, 0.06, 0.18]} /><meshStandardMaterial color="#81D4FA" emissive="#81D4FA" emissiveIntensity={0.2} transparent opacity={0.6} /></mesh>
        ))}
      </group>
    </group>
  );
}

function CardDeck({ position, color, label, symbol }: { position: [number, number, number]; color: string; label: string; symbol: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.22, 0]}><boxGeometry args={[0.9, 0.2, 1.15]} /><meshStandardMaterial color={color} metalness={0.08} roughness={0.6} /></mesh>
      <mesh position={[0, 0.33, 0]}><boxGeometry args={[0.93, 0.02, 1.18]} /><meshStandardMaterial color="#D4A84B" metalness={0.8} roughness={0.15} /></mesh>
      {[0, 0.013, 0.026, 0.039, 0.052, 0.065, 0.078].map((y, i) => (
        <mesh key={i} position={[0, 0.35 + y, 0]} rotation={[0, i * 0.018, 0]}><boxGeometry args={[0.75, 0.015, 1.0]} /><meshStandardMaterial color={i >= 5 ? color : '#F5EED6'} metalness={0.03} roughness={0.4} /></mesh>
      ))}
      <Text position={[0, 0.46, -0.28]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.1} color="#fff" anchorX="center" fontWeight={800}>{label}</Text>
      <Text position={[0, 0.46, 0.16]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.3} color="#fff" anchorX="center" fontWeight={800}>{symbol}</Text>
    </group>
  );
}

/* ---------------------------------------------------------------- */
/*  CARD ANIMATION                                                   */
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
    const rise = Math.min(t / 0.6, 1), ease = 1 - Math.pow(1 - rise, 3);
    ref.current.position.y = 0.6 + ease * 2.2;
    ref.current.rotation.x = -Math.PI / 2 + ease * Math.PI;
    if (t > 2.5) ref.current.position.y = 2.8 + Math.min((t - 2.5) / 0.5, 1) * 1.6;
  });
  const c = type === 'chance' ? '#FF9100' : '#42A5F5';
  return (
    <group ref={ref} position={[type === 'chance' ? -2.1 : 2.1, 0.6, 1.6]} visible={false}>
      <mesh><boxGeometry args={[1.5, 0.025, 1.05]} /><meshStandardMaterial color={c} /></mesh>
      <mesh position={[0, 0.001, 0]}><boxGeometry args={[1.4, 0.024, 0.95]} /><meshStandardMaterial color="#FFFDF5" /></mesh>
      <Text position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.085} color="#333" anchorX="center" anchorY="middle" maxWidth={1.2} textAlign="center">{text}</Text>
      <Text position={[0, 0.02, -0.38]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.065} color={c} anchorX="center" fontWeight={800}>
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
const BOARD_DICE_Y = 0.38;

function SingleDie({ val, off, trigger }: { val: number; off: number; trigger: number }) {
  const g = useRef<THREE.Group>(null);
  const rs = useRef(0);
  const sp = useRef([0, 0, 0].map(() => Math.random() * 10 - 5));
  useEffect(() => { rs.current = Date.now(); sp.current = [0, 0, 0].map(() => Math.random() * 10 - 5); }, [trigger]);
  useFrame(() => {
    if (!g.current) return;
    const t = (Date.now() - rs.current) / 1000, tgt = DR[val] || [0, 0, 0];
    if (t < 1.0) {
      const s = Math.max(0, 1 - t);
      g.current.rotation.x += sp.current[0] * s * 0.14;
      g.current.rotation.y += sp.current[1] * s * 0.14;
      g.current.rotation.z += sp.current[2] * s * 0.14;
      const bounce = Math.abs(Math.sin(t * 7)) * (1 - t) * 0.9;
      g.current.position.y = BOARD_DICE_Y + bounce;
      g.current.position.x = off + Math.sin(t * 4.5) * 0.15 * (1 - t);
      g.current.position.z = Math.cos(t * 3.5 + off) * 0.1 * (1 - t);
    } else {
      const e = Math.min((t - 1.0) / 0.35, 1), e3 = 1 - Math.pow(1 - e, 3);
      g.current.rotation.x += (tgt[0] - g.current.rotation.x) * e3 * 0.18;
      g.current.rotation.y += (tgt[1] - g.current.rotation.y) * e3 * 0.18;
      g.current.rotation.z += (tgt[2] - g.current.rotation.z) * e3 * 0.18;
      g.current.position.y += (BOARD_DICE_Y - g.current.position.y) * 0.14;
      g.current.position.x += (off - g.current.position.x) * 0.12;
      g.current.position.z *= 0.9;
    }
  });
  return (
    <group ref={g} position={[off, BOARD_DICE_Y + 1.5, 0]}>
      <mesh><boxGeometry args={[DS, DS, DS]} /><meshStandardMaterial color="#FFFDF5" metalness={0.02} roughness={0.2} /></mesh>
      {ALL_PIPS.map((p, i) => <mesh key={i} position={p}><sphereGeometry args={[PR, 8, 8]} /><meshStandardMaterial color="#2C1810" /></mesh>)}
    </group>
  );
}

function AnimatedDice({ d1, d2, isDoubles }: { d1: number; d2: number; isDoubles: boolean }) {
  const [tr, setTr] = useState(0);
  const prev = useRef('');
  useEffect(() => { const k = `${d1}-${d2}`; if (k !== prev.current) { prev.current = k; setTr(t => t + 1); } }, [d1, d2]);
  return (
    <group position={[0, 0, 2.1]}>
      <SingleDie val={d1} off={-0.4} trigger={tr} />
      <SingleDie val={d2} off={0.4} trigger={tr} />
      {isDoubles && (
        <mesh position={[0, BOARD_DICE_Y + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.8, 0.95, 32]} />
          <meshStandardMaterial color="#FFD54F" emissive="#FFD54F" emissiveIntensity={2} transparent opacity={0.4} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

/* ================================================================ */
/*  ANIMAL TOKENS                                                    */
/* ================================================================ */
function DogToken({ color }: { color: string }) {
  const dk = useMemo(() => new THREE.Color(color).multiplyScalar(0.6).getStyle(), [color]);
  const m = <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} metalness={0.35} roughness={0.35} />;
  return (
    <group scale={[0.85, 0.85, 0.85]}>
      <mesh position={[0, 0.14, 0]}><capsuleGeometry args={[0.09, 0.1, 4, 8]} />{m}</mesh>
      <mesh position={[0, 0.32, 0.05]}><sphereGeometry args={[0.1, 12, 12]} />{m}</mesh>
      <mesh position={[-0.09, 0.36, 0.03]} rotation={[0.3, 0, -0.5]}><boxGeometry args={[0.06, 0.1, 0.03]} /><meshStandardMaterial color={dk} /></mesh>
      <mesh position={[0.09, 0.36, 0.03]} rotation={[0.3, 0, 0.5]}><boxGeometry args={[0.06, 0.1, 0.03]} /><meshStandardMaterial color={dk} /></mesh>
      <mesh position={[-0.035, 0.35, 0.1]}><sphereGeometry args={[0.024, 8, 8]} /><meshStandardMaterial color="#fff" /></mesh>
      <mesh position={[-0.035, 0.35, 0.118]}><sphereGeometry args={[0.014, 8, 8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
      <mesh position={[0.035, 0.35, 0.1]}><sphereGeometry args={[0.024, 8, 8]} /><meshStandardMaterial color="#fff" /></mesh>
      <mesh position={[0.035, 0.35, 0.118]}><sphereGeometry args={[0.014, 8, 8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
      <mesh position={[0, 0.3, 0.14]}><sphereGeometry args={[0.025, 8, 8]} /><meshStandardMaterial color="#333" /></mesh>
      <mesh position={[0, 0.22, -0.12]} rotation={[-0.8, 0, 0]}><cylinderGeometry args={[0.018, 0.008, 0.12, 6]} />{m}</mesh>
    </group>
  );
}

function CatToken({ color }: { color: string }) {
  const dk = useMemo(() => new THREE.Color(color).multiplyScalar(0.6).getStyle(), [color]);
  const m = <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} metalness={0.35} roughness={0.35} />;
  return (
    <group scale={[0.85, 0.85, 0.85]}>
      <mesh position={[0, 0.12, 0]}><cylinderGeometry args={[0.07, 0.09, 0.18, 8]} />{m}</mesh>
      <mesh position={[0, 0.3, 0.02]}><sphereGeometry args={[0.09, 12, 12]} />{m}</mesh>
      <mesh position={[-0.06, 0.42, 0.01]} rotation={[0, 0, -0.2]}><coneGeometry args={[0.03, 0.08, 4]} /><meshStandardMaterial color={dk} /></mesh>
      <mesh position={[0.06, 0.42, 0.01]} rotation={[0, 0, 0.2]}><coneGeometry args={[0.03, 0.08, 4]} /><meshStandardMaterial color={dk} /></mesh>
      <mesh position={[-0.03, 0.33, 0.08]}><sphereGeometry args={[0.02, 8, 8]} /><meshStandardMaterial color="#ADFF2F" /></mesh>
      <mesh position={[-0.03, 0.33, 0.097]}><sphereGeometry args={[0.011, 8, 8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
      <mesh position={[0.03, 0.33, 0.08]}><sphereGeometry args={[0.02, 8, 8]} /><meshStandardMaterial color="#ADFF2F" /></mesh>
      <mesh position={[0.03, 0.33, 0.097]}><sphereGeometry args={[0.011, 8, 8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
      <mesh position={[0, 0.2, -0.12]} rotation={[-1, 0, 0.3]}><cylinderGeometry args={[0.015, 0.01, 0.16, 6]} />{m}</mesh>
    </group>
  );
}

function BearToken({ color }: { color: string }) {
  const dk = useMemo(() => new THREE.Color(color).multiplyScalar(0.6).getStyle(), [color]);
  const m = <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} metalness={0.35} roughness={0.35} />;
  return (
    <group scale={[0.85, 0.85, 0.85]}>
      <mesh position={[0, 0.15, 0]}><sphereGeometry args={[0.12, 12, 12]} />{m}</mesh>
      <mesh position={[0, 0.33, 0]}><sphereGeometry args={[0.1, 12, 12]} />{m}</mesh>
      <mesh position={[-0.08, 0.42, 0]}><sphereGeometry args={[0.04, 8, 8]} /><meshStandardMaterial color={dk} /></mesh>
      <mesh position={[0.08, 0.42, 0]}><sphereGeometry args={[0.04, 8, 8]} /><meshStandardMaterial color={dk} /></mesh>
      <mesh position={[-0.035, 0.36, 0.08]}><sphereGeometry args={[0.022, 8, 8]} /><meshStandardMaterial color="#fff" /></mesh>
      <mesh position={[-0.035, 0.36, 0.098]}><sphereGeometry args={[0.014, 8, 8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
      <mesh position={[0.035, 0.36, 0.08]}><sphereGeometry args={[0.022, 8, 8]} /><meshStandardMaterial color="#fff" /></mesh>
      <mesh position={[0.035, 0.36, 0.098]}><sphereGeometry args={[0.014, 8, 8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
      <mesh position={[0, 0.3, 0.1]}><sphereGeometry args={[0.035, 8, 8]} /><meshStandardMaterial color="#F5DEB3" /></mesh>
      <mesh position={[0, 0.31, 0.13]}><sphereGeometry args={[0.015, 8, 8]} /><meshStandardMaterial color="#333" /></mesh>
    </group>
  );
}

function FoxToken({ color }: { color: string }) {
  const dk = useMemo(() => new THREE.Color(color).multiplyScalar(0.6).getStyle(), [color]);
  const m = <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} metalness={0.35} roughness={0.35} />;
  return (
    <group scale={[0.85, 0.85, 0.85]}>
      <mesh position={[0, 0.12, 0]}><capsuleGeometry args={[0.08, 0.08, 4, 8]} />{m}</mesh>
      <mesh position={[0, 0.3, 0.03]}><sphereGeometry args={[0.09, 12, 12]} />{m}</mesh>
      <mesh position={[0, 0.27, 0.12]} rotation={[0.4, 0, 0]}><coneGeometry args={[0.03, 0.08, 6]} />{m}</mesh>
      <mesh position={[-0.06, 0.44, 0]} rotation={[0, 0, -0.15]}><coneGeometry args={[0.03, 0.12, 4]} /><meshStandardMaterial color={dk} /></mesh>
      <mesh position={[0.06, 0.44, 0]} rotation={[0, 0, 0.15]}><coneGeometry args={[0.03, 0.12, 4]} /><meshStandardMaterial color={dk} /></mesh>
      <mesh position={[-0.03, 0.33, 0.08]}><sphereGeometry args={[0.02, 8, 8]} /><meshStandardMaterial color="#FFD54F" /></mesh>
      <mesh position={[-0.03, 0.33, 0.097]}><sphereGeometry args={[0.011, 8, 8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
      <mesh position={[0.03, 0.33, 0.08]}><sphereGeometry args={[0.02, 8, 8]} /><meshStandardMaterial color="#FFD54F" /></mesh>
      <mesh position={[0.03, 0.33, 0.097]}><sphereGeometry args={[0.011, 8, 8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
      <mesh position={[0, 0.29, 0.16]}><sphereGeometry args={[0.015, 8, 8]} /><meshStandardMaterial color="#333" /></mesh>
      <mesh position={[0, 0.18, -0.14]} rotation={[-0.6, 0, 0]}><sphereGeometry args={[0.06, 8, 8]} />{m}</mesh>
    </group>
  );
}

const ANIMALS = [DogToken, CatToken, BearToken, FoxToken];

/* ---------------------------------------------------------------- */
/*  Animated token — jail aware                                      */
/* ---------------------------------------------------------------- */
function AnimatedToken({ pi, pos, color, active, alive, inJail }: { pi: number; pos: number; color: string; active: boolean; alive: boolean; inJail: boolean }) {
  const gRef = useRef<THREE.Group>(null);
  const prevP = useRef(pos);
  const lastP = useRef(pos);
  const pathQ = useRef<[number, number, number][]>([]);
  const pathS = useRef(0);
  const Animal = ANIMALS[pi] || DogToken;

  useEffect(() => {
    if (pos === prevP.current) return;
    const fwd = (pos - prevP.current + 40) % 40;
    const path: [number, number, number][] = [];
    if (fwd > 0 && fwd <= 12) {
      let p = prevP.current;
      while (p !== pos) { p = (p + 1) % 40; const b = BOARD_POSITIONS[p], o = TOKEN_OFFSETS[pi]; path.push([b[0] + o[0], TOKEN_Y, b[2] + o[2]]); }
    } else {
      const b = BOARD_POSITIONS[pos], o = TOKEN_OFFSETS[pi]; path.push([b[0] + o[0], TOKEN_Y, b[2] + o[2]]);
    }
    lastP.current = prevP.current;
    pathQ.current = path;
    pathS.current = Date.now() + MOVE_DELAY;
    prevP.current = pos;
  }, [pos, pi]);

  useFrame(() => {
    if (!gRef.current || !alive) return;
    const path = pathQ.current;
    const elapsed = Date.now() - pathS.current;

    // Jail position: inside the cell
    const jailTile = BOARD_POSITIONS[10]; // jail corner
    const jailOff = JAIL_CELL_OFFSETS[pi];
    const jailPos: [number, number, number] = [jailTile[0] + jailOff[0], TOKEN_Y, jailTile[2] + jailOff[2]];

    if (elapsed < 0) {
      const bp = BOARD_POSITIONS[lastP.current] || BOARD_POSITIONS[0], o = TOKEN_OFFSETS[pi];
      gRef.current.position.x += (bp[0] + o[0] - gRef.current.position.x) * 0.06;
      gRef.current.position.z += (bp[2] + o[2] - gRef.current.position.z) * 0.06;
      gRef.current.position.y += (TOKEN_Y - gRef.current.position.y) * 0.1;
    } else if (path.length > 0) {
      const idx = Math.min(Math.floor(elapsed / HOP_MS), path.length - 1);
      const tgt = path[idx];
      gRef.current.position.x += (tgt[0] - gRef.current.position.x) * 0.2;
      gRef.current.position.z += (tgt[2] - gRef.current.position.z) * 0.2;
      const remaining = path.length - 1 - idx;
      const hopScale = remaining <= 0 ? 0 : Math.min(remaining / 2, 1);
      const hop = Math.sin(((elapsed % HOP_MS) / HOP_MS) * Math.PI) * 0.5 * hopScale;
      gRef.current.position.y = TOKEN_Y + hop;
      if (idx >= path.length - 1 && elapsed > path.length * HOP_MS + 400) pathQ.current = [];
    } else if (inJail && pos === 10) {
      // Sit inside jail cell
      gRef.current.position.x += (jailPos[0] - gRef.current.position.x) * 0.06;
      gRef.current.position.z += (jailPos[2] - gRef.current.position.z) * 0.06;
      gRef.current.position.y += (TOKEN_Y - gRef.current.position.y) * 0.1;
    } else {
      const b = BOARD_POSITIONS[pos] || BOARD_POSITIONS[0], o = TOKEN_OFFSETS[pi];
      gRef.current.position.x += (b[0] + o[0] - gRef.current.position.x) * 0.06;
      gRef.current.position.z += (b[2] + o[2] - gRef.current.position.z) * 0.06;
      gRef.current.position.y += (TOKEN_Y - gRef.current.position.y) * 0.1;
    }

    const s = active ? 1.15 + Math.sin(Date.now() * 0.004) * 0.06 : 1;
    gRef.current.scale.set(s, s, s);
  });

  if (!alive) return null;
  const b = BOARD_POSITIONS[pos] || BOARD_POSITIONS[0], o = TOKEN_OFFSETS[pi];
  return (
    <group ref={gRef} position={[b[0] + o[0], TOKEN_Y, b[2] + o[2]]}>
      <mesh position={[0, -TOKEN_Y + 0.13, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.32, 32]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 2.5 : 0.3} transparent opacity={active ? 0.35 : 0.1} side={THREE.DoubleSide} />
      </mesh>
      <Animal color={color} />
      {active && <ActiveRing color={color} />}
    </group>
  );
}

function ActiveRing({ color }: { color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => { if (ref.current) { const s = 1 + Math.sin(clock.elapsedTime * 4) * 0.15; ref.current.scale.set(s, s, 1); ref.current.rotation.z = clock.elapsedTime * 0.5; } });
  return <mesh ref={ref} position={[0, -TOKEN_Y + 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.35, 0.45, 6]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} transparent opacity={0.45} side={THREE.DoubleSide} /></mesh>;
}

/* ================================================================ */
/*  MONEY FX                                                         */
/* ================================================================ */
interface FxDef { id: number; from: [number, number, number]; to: [number, number, number]; start: number; }
function MoneyParticle({ fx, onDone }: { fx: FxDef; onDone: () => void }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    const t = Math.min((Date.now() - fx.start) / 1000, 1);
    if (t >= 1) { onDone(); return; }
    ref.current.position.x = fx.from[0] + (fx.to[0] - fx.from[0]) * t;
    ref.current.position.z = fx.from[2] + (fx.to[2] - fx.from[2]) * t;
    ref.current.position.y = 0.8 + Math.sin(t * Math.PI) * 2;
    ref.current.rotation.y = t * 14;
  });
  return <mesh ref={ref} position={[fx.from[0], 0.8, fx.from[2]]}><cylinderGeometry args={[0.09, 0.09, 0.035, 12]} /><meshStandardMaterial color="#FFD700" emissive="#FFA000" emissiveIntensity={1.5} metalness={0.9} roughness={0.1} /></mesh>;
}

/* ================================================================ */
/*  SCENE                                                            */
/* ================================================================ */
function JailSiren({ playerPos }: { playerPos: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  const start = useRef(Date.now());
  useFrame(() => {
    if (!ref.current) return;
    const t = (Date.now() - start.current) / 1000;
    if (t > 2.5) { ref.current.visible = false; return; }
    ref.current.visible = true;
    const pulse = 1 + Math.sin(t * 10) * 0.25;
    ref.current.scale.set(pulse, pulse, pulse);
    ref.current.rotation.y = t * 3;
  });
  return (
    <group ref={ref} position={[playerPos[0], 0.3, playerPos[2]]}>
      <mesh position={[-0.35, 0.3, 0]}><sphereGeometry args={[0.07, 8, 8]} /><meshStandardMaterial color="#E53935" emissive="#E53935" emissiveIntensity={3} /></mesh>
      <mesh position={[0.35, 0.3, 0]}><sphereGeometry args={[0.07, 8, 8]} /><meshStandardMaterial color="#1565C0" emissive="#1565C0" emissiveIntensity={3} /></mesh>
      <mesh position={[0, 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.4, 0.55, 16]} /><meshStandardMaterial color="#E53935" emissive="#E53935" emissiveIntensity={2} transparent opacity={0.5} side={THREE.DoubleSide} /></mesh>
    </group>
  );
}

function Scene({ snapshot, latestEvents, activeCard }: { snapshot: Snapshot | null; latestEvents: GameEvent[]; activeCard: { text: string; type: string } | null }) {
  const [effects, setEffects] = useState<FxDef[]>([]);
  const [jailTarget, setJailTarget] = useState<number | null>(null);
  const fxId = useRef(0);

  const owners = useMemo(() => {
    const o: Record<number, number> = {};
    if (!snapshot) return o;
    for (const p of snapshot.properties) { if (p.ownerIndex >= 0 && p.index < PROPERTY_TO_TILE.length) o[PROPERTY_TO_TILE[p.index]] = p.ownerIndex; }
    return o;
  }, [snapshot]);

  useEffect(() => {
    if (!snapshot || !latestEvents.length) return;
    const nf: FxDef[] = [];
    for (const ev of latestEvents) {
      if (ev.type === 'rentPaid' && (ev.from !== undefined || ev.player !== undefined)) {
        const payerIdx = ev.from ?? ev.player;
        const recvIdx = ev.to ?? ev.toPlayer;
        const fp = snapshot.players[payerIdx], tp = recvIdx !== undefined ? snapshot.players[recvIdx] : null;
        if (fp) {
          const fb = BOARD_POSITIONS[fp.position] || BOARD_POSITIONS[0], tb = tp ? (BOARD_POSITIONS[tp.position] || BOARD_POSITIONS[0]) : [0, 0, 0] as [number, number, number];
          for (let c = 0; c < 4; c++) nf.push({ id: fxId.current++, from: [fb[0], 0, fb[2]], to: [tb[0], 0, tb[2]], start: Date.now() + c * 100 });
        }
      } else if (ev.type === 'taxPaid' && ev.player !== undefined) {
        const fp = snapshot.players[ev.player];
        if (fp) {
          const fb = BOARD_POSITIONS[fp.position] || BOARD_POSITIONS[0];
          for (let c = 0; c < 3; c++) nf.push({ id: fxId.current++, from: [fb[0], 0, fb[2]], to: [0, 0, 0], start: Date.now() + c * 100 });
        }
      }
      if (ev.type === 'sentToJail' && ev.player !== undefined) {
        setJailTarget(ev.player);
        setTimeout(() => setJailTarget(null), 2600);
      }
    }
    if (nf.length) setEffects(p => [...p.slice(-12), ...nf]);
  }, [latestEvents, snapshot]);

  const rmFx = useCallback((id: number) => setEffects(p => p.filter(f => f.id !== id)), []);

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[10, 24, 7]} intensity={0.9} color="#FFFAF0" />
      <directionalLight position={[-7, 16, -5]} intensity={0.3} color="#FFF5E6" />
      <pointLight position={[0, 18, 0]} intensity={0.6} color="#FFFDE7" distance={40} />
      <pointLight position={[-10, 9, 10]} intensity={0.3} color="#FFB74D" distance={24} />
      <pointLight position={[10, 9, -10]} intensity={0.3} color="#4FC3F7" distance={24} />
      <fog attach="fog" args={['#0C1B3A', 32, 60]} />
      <Sparkles count={250} scale={32} size={4} color="#FFD54F" speed={0.3} opacity={0.25} />
      <Sparkles count={120} scale={26} size={3} color="#4FC3F7" speed={0.2} opacity={0.15} />

      <GameBoard propertyOwners={owners} />

      {snapshot?.players.map((p, i) => (
        <AnimatedToken key={i} pi={i} pos={p.position} color={PLAYER_COLORS[i]} active={i === snapshot.currentPlayerIndex} alive={p.alive} inJail={p.inJail} />
      ))}

      {jailTarget !== null && snapshot?.players[jailTarget] && (
        <JailSiren playerPos={BOARD_POSITIONS[snapshot.players[jailTarget].position] || BOARD_POSITIONS[0]} />
      )}

      {snapshot?.lastDice && <AnimatedDice d1={snapshot.lastDice.d1} d2={snapshot.lastDice.d2} isDoubles={snapshot.lastDice.isDoubles} />}
      {activeCard && <CardAnimation text={activeCard.text} type={activeCard.type} visible={!!activeCard} />}
      {effects.map(fx => <MoneyParticle key={fx.id} fx={fx} onDone={() => rmFx(fx.id)} />)}

      <OrbitControls target={[0, 0, 0]} maxPolarAngle={Math.PI / 2.1} minPolarAngle={0.15} minDistance={7} maxDistance={30} enableDamping dampingFactor={0.05} autoRotate={!snapshot} autoRotateSpeed={0.4} />
    </>
  );
}

/* ================================================================ */
/*  EXPORT                                                           */
/* ================================================================ */
export default function MonopolyScene({ snapshot, latestEvents = [], activeCard = null }: { snapshot: Snapshot | null; latestEvents?: GameEvent[]; activeCard?: { text: string; type: string } | null }) {
  return (
    <Canvas camera={{ position: [0, 18, 14], fov: 36 }} style={{ background: 'linear-gradient(180deg,#0C1B3A 0%,#15103A 40%,#0A2030 100%)' }} gl={{ antialias: true, alpha: false }} dpr={[1, 2]}>
      <Scene snapshot={snapshot} latestEvents={latestEvents} activeCard={activeCard} />
    </Canvas>
  );
}
