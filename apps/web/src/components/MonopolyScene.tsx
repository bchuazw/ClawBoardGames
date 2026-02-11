'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Text } from '@react-three/drei';
import * as THREE from 'three';
import {
  BOARD_POSITIONS, TILE_DATA, GROUP_COLORS,
  PLAYER_COLORS, TOKEN_OFFSETS, PROPERTY_TO_TILE,
  getTileEdge,
} from '@/lib/boardPositions';

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
export interface Snapshot {
  status: string; phase: string; turn: number; round: number;
  currentPlayerIndex: number; aliveCount: number;
  players: PlayerInfo[]; properties: PropertyInfo[];
  lastDice: { d1: number; d2: number; sum: number; isDoubles: boolean } | null;
  auction: { active: boolean; propertyIndex: number; highBidder: number; highBid: number } | null;
  winner: number;
}
interface TokenProps {
  position: [number, number, number];
  color: string;
  isActive: boolean;
  alive: boolean;
}

/* ------------------------------------------------------------------ */
/*  Board                                                              */
/* ------------------------------------------------------------------ */
function BoardBase() {
  return (
    <group>
      {/* Dark table surface */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]}>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#030308" />
      </mesh>
      {/* Board slab */}
      <mesh position={[0, -0.08, 0]}>
        <boxGeometry args={[11.4, 0.12, 11.4]} />
        <meshStandardMaterial color="#0d2818" metalness={0.3} roughness={0.7} />
      </mesh>
      {/* Inner felt area */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[8.8, 8.8]} />
        <meshStandardMaterial color="#0a1f12" />
      </mesh>
      {/* Neon border lines */}
      <EdgeGlow />
    </group>
  );
}

function EdgeGlow() {
  const points = useMemo(() => [
    [-5.55, 0.02, -5.55], [5.55, 0.02, -5.55],
    [5.55, 0.02, 5.55], [-5.55, 0.02, 5.55], [-5.55, 0.02, -5.55],
  ].map(p => new THREE.Vector3(p[0], p[1], p[2])), []);

  const inner = useMemo(() => [
    [-4.45, 0.02, -4.45], [4.45, 0.02, -4.45],
    [4.45, 0.02, 4.45], [-4.45, 0.02, 4.45], [-4.45, 0.02, -4.45],
  ].map(p => new THREE.Vector3(p[0], p[1], p[2])), []);

  return (
    <group>
      <NeonLine points={points} color="#4fc3f7" />
      <NeonLine points={inner} color="#1a3a4a" />
    </group>
  );
}

function NeonLine({ points, color }: { points: THREE.Vector3[]; color: string }) {
  const lineObj = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 });
    return new THREE.Line(geo, mat);
  }, [points, color]);
  return <primitive object={lineObj} />;
}

/* ------------------------------------------------------------------ */
/*  Tiles                                                              */
/* ------------------------------------------------------------------ */
function BoardTile({ tile, position, ownerIndex }: {
  tile: typeof TILE_DATA[0]; position: [number, number, number]; ownerIndex: number;
}) {
  const groupColor = GROUP_COLORS[tile.group] || '#1a2a1a';
  const edge = getTileEdge(tile.position);
  const isProperty = tile.group > 0;

  // Tile dimensions based on orientation
  let w = 0.88, d = 0.88;
  if (tile.isCorner) { w = 1.05; d = 1.05; }
  else if (edge === 'bottom' || edge === 'top') { w = 0.88; d = 0.55; }
  else { w = 0.55; d = 0.88; }

  // Position: shift non-corner tiles inward slightly
  const pos: [number, number, number] = [position[0], 0.005, position[2]];
  if (!tile.isCorner) {
    if (edge === 'bottom') pos[2] -= 0.15;
    if (edge === 'top') pos[2] += 0.15;
    if (edge === 'left') pos[0] += 0.15;
    if (edge === 'right') pos[0] -= 0.15;
  }

  const emissive = ownerIndex >= 0 ? 0.6 : (isProperty ? 0.25 : 0.08);

  // Text rotation based on edge
  let textRot: [number, number, number] = [-Math.PI / 2, 0, 0];
  if (edge === 'left') textRot = [-Math.PI / 2, 0, Math.PI / 2];
  if (edge === 'right') textRot = [-Math.PI / 2, 0, -Math.PI / 2];
  if (edge === 'top') textRot = [-Math.PI / 2, 0, Math.PI];

  return (
    <group position={pos}>
      {/* Tile surface */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[w, 0.04, d]} />
        <meshStandardMaterial
          color={groupColor}
          emissive={groupColor}
          emissiveIntensity={emissive}
          metalness={0.4}
          roughness={0.6}
        />
      </mesh>
      {/* Tile label */}
      <Text
        position={[0, 0.04, 0]}
        rotation={textRot}
        fontSize={tile.isCorner ? 0.22 : 0.14}
        color={isProperty ? '#fff' : '#888'}
        anchorX="center"
        anchorY="middle"
        maxWidth={0.8}
      >
        {tile.shortName}
      </Text>
      {/* Ownership glow dot */}
      {ownerIndex >= 0 && (
        <mesh position={[0, 0.06, 0]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial
            color={PLAYER_COLORS[ownerIndex]}
            emissive={PLAYER_COLORS[ownerIndex]}
            emissiveIntensity={1.2}
          />
        </mesh>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Center Board Graphics                                              */
/* ------------------------------------------------------------------ */
function BoardCenter() {
  return (
    <group>
      <Text
        position={[0, 0.03, -0.8]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.7}
        color="#4fc3f7"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.15}
      >
        MONOPOLY
      </Text>
      <Text
        position={[0, 0.03, 0.1]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.28}
        color="#2a5a6a"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.3}
      >
        AI AGENTS
      </Text>
      <Text
        position={[0, 0.03, 0.7]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.15}
        color="#1a3a3a"
        anchorX="center"
        anchorY="middle"
      >
        ON-CHAIN
      </Text>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Player Tokens — 4 distinct geometric shapes                        */
/* ------------------------------------------------------------------ */

// P0: Diamond (Octahedron) — sharp, crystalline
function DiamondToken({ position, color, isActive, alive }: TokenProps) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    ref.current.position.x += (position[0] - ref.current.position.x) * 0.07;
    ref.current.position.z += (position[2] - ref.current.position.z) * 0.07;
    const dx = position[0] - ref.current.position.x;
    const dz = position[2] - ref.current.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    ref.current.position.y = 0.35 + dist * 0.4 + Math.sin(Date.now() * 0.003) * 0.03;
    ref.current.rotation.y += isActive ? 0.04 : 0.012;
  });
  if (!alive) return null;
  return (
    <mesh ref={ref} position={[position[0], 0.35, position[2]]}>
      <octahedronGeometry args={[0.24, 0]} />
      <meshStandardMaterial
        color={color} emissive={color}
        emissiveIntensity={isActive ? 1.2 : 0.4}
        metalness={0.9} roughness={0.1}
        transparent opacity={alive ? 1 : 0.3}
      />
    </mesh>
  );
}

// P1: Crown (Cone) — regal, pointed
function CrownToken({ position, color, isActive, alive }: TokenProps) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!ref.current) return;
    ref.current.position.x += (position[0] - ref.current.position.x) * 0.07;
    ref.current.position.z += (position[2] - ref.current.position.z) * 0.07;
    const dx = position[0] - ref.current.position.x;
    const dz = position[2] - ref.current.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    ref.current.position.y = 0.2 + dist * 0.4 + Math.sin(Date.now() * 0.003 + 1) * 0.03;
    ref.current.rotation.y += isActive ? 0.035 : 0.008;
  });
  if (!alive) return null;
  const mat = <meshStandardMaterial color={color} emissive={color} emissiveIntensity={isActive ? 1.2 : 0.4} metalness={0.8} roughness={0.2} />;
  return (
    <group ref={ref} position={[position[0], 0.2, position[2]]}>
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.18, 0.22, 0.12, 8]} />
        {mat}
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <coneGeometry args={[0.15, 0.25, 6]} />
        {mat}
      </mesh>
      <mesh position={[0, 0.35, 0]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        {mat}
      </mesh>
    </group>
  );
}

// P2: Ring (Torus) — sleek, elegant
function RingToken({ position, color, isActive, alive }: TokenProps) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    ref.current.position.x += (position[0] - ref.current.position.x) * 0.07;
    ref.current.position.z += (position[2] - ref.current.position.z) * 0.07;
    const dx = position[0] - ref.current.position.x;
    const dz = position[2] - ref.current.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    ref.current.position.y = 0.35 + dist * 0.4 + Math.sin(Date.now() * 0.003 + 2) * 0.03;
    ref.current.rotation.x += isActive ? 0.05 : 0.015;
    ref.current.rotation.z += 0.008;
  });
  if (!alive) return null;
  return (
    <mesh ref={ref} position={[position[0], 0.35, position[2]]}>
      <torusGeometry args={[0.16, 0.06, 12, 24]} />
      <meshStandardMaterial
        color={color} emissive={color}
        emissiveIntensity={isActive ? 1.2 : 0.4}
        metalness={0.85} roughness={0.15}
      />
    </mesh>
  );
}

// P3: Crystal (Dodecahedron) — complex, multifaceted
function CrystalToken({ position, color, isActive, alive }: TokenProps) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    ref.current.position.x += (position[0] - ref.current.position.x) * 0.07;
    ref.current.position.z += (position[2] - ref.current.position.z) * 0.07;
    const dx = position[0] - ref.current.position.x;
    const dz = position[2] - ref.current.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    ref.current.position.y = 0.35 + dist * 0.4 + Math.sin(Date.now() * 0.003 + 3) * 0.03;
    ref.current.rotation.y += isActive ? 0.03 : 0.01;
    ref.current.rotation.x += 0.005;
  });
  if (!alive) return null;
  return (
    <mesh ref={ref} position={[position[0], 0.35, position[2]]}>
      <dodecahedronGeometry args={[0.2, 0]} />
      <meshStandardMaterial
        color={color} emissive={color}
        emissiveIntensity={isActive ? 1.2 : 0.4}
        metalness={0.85} roughness={0.15}
      />
    </mesh>
  );
}

const TOKEN_COMPONENTS = [DiamondToken, CrownToken, RingToken, CrystalToken];

/* ------------------------------------------------------------------ */
/*  Active Player Ring                                                 */
/* ------------------------------------------------------------------ */
function ActiveRing({ position, color }: { position: [number, number, number]; color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.x += (position[0] - ref.current.position.x) * 0.07;
    ref.current.position.z += (position[2] - ref.current.position.z) * 0.07;
    const s = 1 + Math.sin(clock.elapsedTime * 4) * 0.15;
    ref.current.scale.set(s, s, 1);
  });
  return (
    <mesh ref={ref} position={[position[0], 0.04, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.35, 0.45, 32]} />
      <meshStandardMaterial
        color={color} emissive={color} emissiveIntensity={2}
        transparent opacity={0.5} side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/*  Dice Display                                                       */
/* ------------------------------------------------------------------ */
function DiceDisplay({ d1, d2, isDoubles }: { d1: number; d2: number; isDoubles: boolean }) {
  const ref1 = useRef<THREE.Mesh>(null);
  const ref2 = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (ref1.current) { ref1.current.rotation.y = Math.sin(t * 0.5) * 0.1; }
    if (ref2.current) { ref2.current.rotation.y = Math.sin(t * 0.5 + 1) * 0.1; }
  });

  const diceColor = isDoubles ? '#ffd54f' : '#ffffff';

  return (
    <group position={[0, 0.3, 0]}>
      <mesh ref={ref1} position={[-0.35, 0, 0]}>
        <boxGeometry args={[0.45, 0.45, 0.45]} />
        <meshStandardMaterial color={diceColor} metalness={0.1} roughness={0.4} />
      </mesh>
      <Text position={[-0.35, 0, 0.24]} fontSize={0.28} color="#111" anchorX="center" anchorY="middle">
        {String(d1)}
      </Text>

      <mesh ref={ref2} position={[0.35, 0, 0]}>
        <boxGeometry args={[0.45, 0.45, 0.45]} />
        <meshStandardMaterial color={diceColor} metalness={0.1} roughness={0.4} />
      </mesh>
      <Text position={[0.35, 0, 0.24]} fontSize={0.28} color="#111" anchorX="center" anchorY="middle">
        {String(d2)}
      </Text>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Scene (inside Canvas)                                              */
/* ------------------------------------------------------------------ */
function Scene({ snapshot }: { snapshot: Snapshot | null }) {
  // Build property owner map: tilePosition -> ownerIndex
  const propertyOwners = useMemo(() => {
    const owners: Record<number, number> = {};
    if (!snapshot) return owners;
    for (const prop of snapshot.properties) {
      if (prop.ownerIndex >= 0 && prop.index < PROPERTY_TO_TILE.length) {
        owners[PROPERTY_TO_TILE[prop.index]] = prop.ownerIndex;
      }
    }
    return owners;
  }, [snapshot]);

  // Player positions with offsets
  const playerPositions = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.players.map((p, i) => {
      const base = BOARD_POSITIONS[p.position] || BOARD_POSITIONS[0];
      const off = TOKEN_OFFSETS[i];
      return [base[0] + off[0], base[1], base[2] + off[2]] as [number, number, number];
    });
  }, [snapshot]);

  const activeIdx = snapshot?.currentPlayerIndex ?? -1;

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.25} />
      <directionalLight position={[8, 15, 5]} intensity={0.7} color="#ffffff" />
      <pointLight position={[0, 10, 0]} intensity={0.4} color="#4fc3f7" distance={25} />
      <pointLight position={[-5, 6, 5]} intensity={0.2} color="#00E676" distance={15} />
      <pointLight position={[5, 6, -5]} intensity={0.2} color="#FF9100" distance={15} />

      {/* Background */}
      <Stars radius={80} depth={60} count={3000} factor={5} fade speed={0.5} />

      {/* Board */}
      <BoardBase />
      <BoardCenter />

      {/* Tiles */}
      {TILE_DATA.map((tile, i) => (
        <BoardTile
          key={i}
          tile={tile}
          position={BOARD_POSITIONS[i]}
          ownerIndex={propertyOwners[tile.position] ?? -1}
        />
      ))}

      {/* Player Tokens */}
      {snapshot?.players.map((player, i) => {
        const Tok = TOKEN_COMPONENTS[i];
        return (
          <Tok
            key={i}
            position={playerPositions[i] || BOARD_POSITIONS[0]}
            color={PLAYER_COLORS[i]}
            isActive={i === activeIdx}
            alive={player.alive}
          />
        );
      })}

      {/* Active player ring */}
      {activeIdx >= 0 && playerPositions[activeIdx] && snapshot?.players[activeIdx]?.alive && (
        <ActiveRing
          position={playerPositions[activeIdx]}
          color={PLAYER_COLORS[activeIdx]}
        />
      )}

      {/* Dice */}
      {snapshot?.lastDice && (
        <DiceDisplay
          d1={snapshot.lastDice.d1}
          d2={snapshot.lastDice.d2}
          isDoubles={snapshot.lastDice.isDoubles}
        />
      )}

      {/* Camera controls */}
      <OrbitControls
        target={[0, 0, 0]}
        maxPolarAngle={Math.PI / 2.1}
        minPolarAngle={0.3}
        minDistance={6}
        maxDistance={22}
        enableDamping
        dampingFactor={0.05}
        autoRotate={!snapshot}
        autoRotateSpeed={0.3}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Exported Canvas wrapper                                            */
/* ------------------------------------------------------------------ */
export default function MonopolyScene({ snapshot }: { snapshot: Snapshot | null }) {
  return (
    <Canvas
      camera={{ position: [0, 14, 10], fov: 40 }}
      style={{ background: '#050510' }}
      gl={{ antialias: true, alpha: false }}
      dpr={[1, 2]}
    >
      <Scene snapshot={snapshot} />
    </Canvas>
  );
}
