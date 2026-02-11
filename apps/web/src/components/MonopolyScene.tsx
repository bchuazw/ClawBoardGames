'use client';

import { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Sparkles } from '@react-three/drei';
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

const TOKEN_Y = 0.55;
const HOP_MS = 170;

/* ================================================================== */
/*  BOARD — Bright, vibrant, thick Monopoly Go style                   */
/* ================================================================== */
function GameBoard({ propertyOwners }: { propertyOwners: Record<number, number> }) {
  return (
    <group>
      {/* Board body — rich warm wood */}
      <mesh position={[0, -0.22, 0]}>
        <boxGeometry args={[12.2, 0.6, 12.2]} />
        <meshStandardMaterial color="#6D3A1A" metalness={0.15} roughness={0.65} />
      </mesh>
      {/* Board rim — lighter wood edge */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[12, 0.12, 12]} />
        <meshStandardMaterial color="#8B5E3C" metalness={0.1} roughness={0.7} />
      </mesh>
      {/* Playing surface — bright green felt */}
      <mesh position={[0, 0.07, 0]}>
        <boxGeometry args={[11.4, 0.06, 11.4]} />
        <meshStandardMaterial color="#2E8B3C" metalness={0.08} roughness={0.9} />
      </mesh>
      {/* Center area — slightly darker */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.11, 0]}>
        <planeGeometry args={[8.6, 8.6]} />
        <meshStandardMaterial color="#1F7030" />
      </mesh>

      {/* Gold trim — 4 edges */}
      {[
        [0, 0.12, 5.75, 11.8, 0.08, 0.12],
        [0, 0.12, -5.75, 11.8, 0.08, 0.12],
        [5.75, 0.12, 0, 0.12, 0.08, 11.8],
        [-5.75, 0.12, 0, 0.12, 0.08, 11.8],
      ].map(([x, y, z, w, h, d], i) => (
        <mesh key={i} position={[x, y, z]}>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color="#D4A84B" metalness={0.8} roughness={0.15} emissive="#D4A84B" emissiveIntensity={0.1} />
        </mesh>
      ))}

      {/* Inner border line */}
      <NeonBorder />

      {/* Tiles */}
      {TILE_DATA.map((tile, i) => (
        <BoardTile key={i} tile={tile} position={BOARD_POSITIONS[i]} ownerIndex={propertyOwners[tile.position] ?? -1} />
      ))}

      {/* Center logo */}
      <BoardCenter />

      {/* Corner accent lights */}
      <pointLight position={[5.5, 0.5, 5.5]} intensity={0.4} color="#FFD54F" distance={5} />
      <pointLight position={[-5.5, 0.5, 5.5]} intensity={0.4} color="#FF9100" distance={5} />
      <pointLight position={[-5.5, 0.5, -5.5]} intensity={0.4} color="#E040FB" distance={5} />
      <pointLight position={[5.5, 0.5, -5.5]} intensity={0.4} color="#00B8D4" distance={5} />
    </group>
  );
}

function NeonBorder() {
  const outer = useMemo(() => [
    [-5.55, 0.13, -5.55], [5.55, 0.13, -5.55],
    [5.55, 0.13, 5.55], [-5.55, 0.13, 5.55], [-5.55, 0.13, -5.55],
  ].map(p => new THREE.Vector3(...p)), []);
  const inner = useMemo(() => [
    [-4.45, 0.13, -4.45], [4.45, 0.13, -4.45],
    [4.45, 0.13, 4.45], [-4.45, 0.13, 4.45], [-4.45, 0.13, -4.45],
  ].map(p => new THREE.Vector3(...p)), []);
  return (
    <group>
      <PrimitiveLine pts={outer} color="#D4A84B" opacity={0.5} />
      <PrimitiveLine pts={inner} color="#D4A84B" opacity={0.3} />
    </group>
  );
}

function PrimitiveLine({ pts, color, opacity }: { pts: THREE.Vector3[]; color: string; opacity: number }) {
  const obj = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity, linewidth: 2 });
    return new THREE.Line(g, m);
  }, [pts, color, opacity]);
  return <primitive object={obj} />;
}

/* ------------------------------------------------------------------ */
/*  Tile                                                               */
/* ------------------------------------------------------------------ */
function BoardTile({ tile, position, ownerIndex }: {
  tile: typeof TILE_DATA[0]; position: [number, number, number]; ownerIndex: number;
}) {
  const groupColor = GROUP_COLORS[tile.group] || '#2E8B3C';
  const edge = getTileEdge(tile.position);
  const isProperty = tile.group > 0;
  let w = 0.88, d = 0.88;
  if (tile.isCorner) { w = 1.1; d = 1.1; }
  else if (edge === 'bottom' || edge === 'top') { w = 0.88; d = 0.55; }
  else { w = 0.55; d = 0.88; }

  const pos: [number, number, number] = [position[0], 0.11, position[2]];

  // Color strip placement on inner edge of tile
  let stripPos: [number, number, number] = [0, 0.03, 0];
  let stripW = w, stripD = d * 0.35;
  if (!tile.isCorner && isProperty) {
    if (edge === 'bottom') { stripPos = [0, 0.03, -d * 0.33]; }
    if (edge === 'top') { stripPos = [0, 0.03, d * 0.33]; }
    if (edge === 'left') { stripPos = [w * 0.33, 0.03, 0]; stripW = w * 0.35; stripD = d; }
    if (edge === 'right') { stripPos = [-w * 0.33, 0.03, 0]; stripW = w * 0.35; stripD = d; }
  }

  let textRot: [number, number, number] = [-Math.PI / 2, 0, 0];
  if (edge === 'left') textRot = [-Math.PI / 2, 0, Math.PI / 2];
  if (edge === 'right') textRot = [-Math.PI / 2, 0, -Math.PI / 2];
  if (edge === 'top') textRot = [-Math.PI / 2, 0, Math.PI];

  return (
    <group position={pos}>
      {/* Tile body — cream/ivory */}
      <mesh>
        <boxGeometry args={[w, 0.06, d]} />
        <meshStandardMaterial color={tile.isCorner ? '#E8DCC8' : '#F5EED6'} metalness={0.05} roughness={0.8} />
      </mesh>
      {/* Color strip */}
      {isProperty && !tile.isCorner && (
        <mesh position={stripPos}>
          <boxGeometry args={[stripW, 0.07, stripD]} />
          <meshStandardMaterial color={groupColor} emissive={groupColor} emissiveIntensity={ownerIndex >= 0 ? 0.5 : 0.15} metalness={0.3} roughness={0.5} />
        </mesh>
      )}
      {/* Corner tile accent */}
      {tile.isCorner && (
        <mesh position={[0, 0.02, 0]}>
          <boxGeometry args={[w * 0.85, 0.04, d * 0.85]} />
          <meshStandardMaterial color="#E0D5B8" emissive="#D4A84B" emissiveIntensity={0.05} />
        </mesh>
      )}
      {/* Label */}
      <Text position={[0, 0.08, 0]} rotation={textRot} fontSize={tile.isCorner ? 0.22 : 0.11}
        color={tile.isCorner ? '#5D3A1A' : '#3A3A3A'}
        anchorX="center" anchorY="middle" maxWidth={0.8} font={undefined}>
        {tile.shortName}
      </Text>
      {/* Owner house */}
      {ownerIndex >= 0 && <SmallHouse position={[0, 0.04, 0]} color={PLAYER_COLORS[ownerIndex]} />}
    </group>
  );
}

function SmallHouse({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <group position={position} scale={[0.1, 0.1, 0.1]}>
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.4]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0, 0.65, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.4, 0.35, 4]} />
        <meshStandardMaterial color="#D32F2F" />
      </mesh>
    </group>
  );
}

function BoardCenter() {
  return (
    <group>
      <Text position={[0, 0.13, -0.6]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.65}
        color="#D4A84B" anchorX="center" anchorY="middle" letterSpacing={0.12}>
        MONOPOLY
      </Text>
      <Text position={[0, 0.13, 0.3]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.25}
        color="#5D3A1A" anchorX="center" anchorY="middle" letterSpacing={0.3}>
        AI AGENTS
      </Text>
      {/* Decorative gold emblem */}
      <mesh position={[0, 0.15, 1.1]} rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[0.35, 0.03, 0.35]} />
        <meshStandardMaterial color="#D4A84B" metalness={0.9} roughness={0.1} emissive="#D4A84B" emissiveIntensity={0.2} />
      </mesh>
      {/* Star decorations */}
      {[[-1.5, 1.5], [1.5, 1.5], [-1.5, -1.2], [1.5, -1.2]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.13, z]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
          <circleGeometry args={[0.12, 6]} />
          <meshStandardMaterial color="#D4A84B" emissive="#D4A84B" emissiveIntensity={0.15} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

/* ================================================================== */
/*  ANIMATED DICE                                                      */
/* ================================================================== */
const DIE_SIZE = 0.44;
const DIE_HALF = DIE_SIZE / 2;
const PIP_R = DIE_SIZE * 0.06;
const PS = DIE_SIZE * 0.155;
const PD = DIE_HALF + 0.005;

const ALL_PIPS: [number, number, number][] = [
  [0, PD, 0],
  [-PS, -PD, -PS], [-PS, -PD, 0], [-PS, -PD, PS], [PS, -PD, -PS], [PS, -PD, 0], [PS, -PD, PS],
  [PS, PS, PD], [-PS, -PS, PD],
  [PS, PS, -PD], [-PS, PS, -PD], [0, 0, -PD], [PS, -PS, -PD], [-PS, -PS, -PD],
  [PD, PS, -PS], [PD, 0, 0], [PD, -PS, PS],
  [-PD, PS, -PS], [-PD, PS, PS], [-PD, -PS, -PS], [-PD, -PS, PS],
];

const DICE_ROT: Record<number, [number, number, number]> = {
  1: [0, 0, 0], 2: [-Math.PI / 2, 0, 0], 3: [0, 0, Math.PI / 2],
  4: [0, 0, -Math.PI / 2], 5: [Math.PI / 2, 0, 0], 6: [Math.PI, 0, 0],
};

function SingleDie({ targetValue, offset, rollTrigger }: { targetValue: number; offset: number; rollTrigger: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const rollStart = useRef(0);
  const spin = useRef([0, 0, 0].map(() => Math.random() * 8 - 4));

  useEffect(() => {
    rollStart.current = Date.now();
    spin.current = [0, 0, 0].map(() => Math.random() * 8 - 4);
  }, [rollTrigger]);

  useFrame(() => {
    if (!groupRef.current) return;
    const t = (Date.now() - rollStart.current) / 1000;
    const target = DICE_ROT[targetValue] || [0, 0, 0];
    if (t < 0.9) {
      const spd = Math.max(0, 1 - t * 0.9);
      groupRef.current.rotation.x += spin.current[0] * spd * 0.12;
      groupRef.current.rotation.y += spin.current[1] * spd * 0.12;
      groupRef.current.rotation.z += spin.current[2] * spd * 0.12;
      groupRef.current.position.y = 0.7 + Math.abs(Math.sin(t * 6)) * (1 - t) * 1.2;
      groupRef.current.position.x = offset + Math.sin(t * 3) * 0.1 * (1 - t);
    } else {
      const ease = Math.min((t - 0.9) / 0.4, 1);
      const e3 = 1 - Math.pow(1 - ease, 3);
      groupRef.current.rotation.x += (target[0] - groupRef.current.rotation.x) * e3 * 0.15;
      groupRef.current.rotation.y += (target[1] - groupRef.current.rotation.y) * e3 * 0.15;
      groupRef.current.rotation.z += (target[2] - groupRef.current.rotation.z) * e3 * 0.15;
      groupRef.current.position.y += (0.45 - groupRef.current.position.y) * 0.12;
      groupRef.current.position.x += (offset - groupRef.current.position.x) * 0.1;
    }
  });

  return (
    <group ref={groupRef} position={[offset, 1.8, 0]}>
      <mesh castShadow>
        <boxGeometry args={[DIE_SIZE, DIE_SIZE, DIE_SIZE]} />
        <meshStandardMaterial color="#FFFDF5" metalness={0.02} roughness={0.2} />
      </mesh>
      {ALL_PIPS.map((pos, i) => (
        <mesh key={i} position={pos}>
          <sphereGeometry args={[PIP_R, 8, 8]} />
          <meshStandardMaterial color="#2C1810" />
        </mesh>
      ))}
    </group>
  );
}

function AnimatedDice({ d1, d2, isDoubles }: { d1: number; d2: number; isDoubles: boolean }) {
  const [rollTrigger, setRollTrigger] = useState(0);
  const prev = useRef('');
  useEffect(() => {
    const k = `${d1}-${d2}`;
    if (k !== prev.current) { prev.current = k; setRollTrigger(t => t + 1); }
  }, [d1, d2]);
  return (
    <group position={[0, 0, 0]}>
      <SingleDie targetValue={d1} offset={-0.38} rollTrigger={rollTrigger} />
      <SingleDie targetValue={d2} offset={0.38} rollTrigger={rollTrigger} />
      {isDoubles && (
        <mesh position={[0, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.75, 0.9, 32]} />
          <meshStandardMaterial color="#FFD54F" emissive="#FFD54F" emissiveIntensity={2} transparent opacity={0.45} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

/* ================================================================== */
/*  ANIMAL TOKENS                                                      */
/* ================================================================== */
function DogToken({ color }: { color: string }) {
  const darker = useMemo(() => new THREE.Color(color).multiplyScalar(0.65).getStyle(), [color]);
  const mat = <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} metalness={0.35} roughness={0.35} />;
  return (
    <group scale={[0.65, 0.65, 0.65]}>
      <mesh position={[0, 0.14, 0]}><capsuleGeometry args={[0.09, 0.1, 4, 8]} />{mat}</mesh>
      <mesh position={[0, 0.32, 0.05]}><sphereGeometry args={[0.1, 12, 12]} />{mat}</mesh>
      {/* Floppy ears */}
      <mesh position={[-0.09, 0.36, 0.03]} rotation={[0.3, 0, -0.5]}>
        <boxGeometry args={[0.06, 0.1, 0.03]} />
        <meshStandardMaterial color={darker} />
      </mesh>
      <mesh position={[0.09, 0.36, 0.03]} rotation={[0.3, 0, 0.5]}>
        <boxGeometry args={[0.06, 0.1, 0.03]} />
        <meshStandardMaterial color={darker} />
      </mesh>
      {/* Eyes */}
      <mesh position={[-0.035, 0.35, 0.1]}><sphereGeometry args={[0.022, 8, 8]} /><meshStandardMaterial color="#fff" /></mesh>
      <mesh position={[-0.035, 0.35, 0.115]}><sphereGeometry args={[0.013, 8, 8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
      <mesh position={[0.035, 0.35, 0.1]}><sphereGeometry args={[0.022, 8, 8]} /><meshStandardMaterial color="#fff" /></mesh>
      <mesh position={[0.035, 0.35, 0.115]}><sphereGeometry args={[0.013, 8, 8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
      {/* Nose */}
      <mesh position={[0, 0.3, 0.14]}><sphereGeometry args={[0.025, 8, 8]} /><meshStandardMaterial color="#333" /></mesh>
      {/* Tail */}
      <mesh position={[0, 0.22, -0.12]} rotation={[-0.8, 0, 0]}>
        <cylinderGeometry args={[0.018, 0.008, 0.12, 6]} />{mat}
      </mesh>
    </group>
  );
}

function CatToken({ color }: { color: string }) {
  const darker = useMemo(() => new THREE.Color(color).multiplyScalar(0.65).getStyle(), [color]);
  const mat = <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} metalness={0.35} roughness={0.35} />;
  return (
    <group scale={[0.65, 0.65, 0.65]}>
      <mesh position={[0, 0.12, 0]}><cylinderGeometry args={[0.07, 0.09, 0.18, 8]} />{mat}</mesh>
      <mesh position={[0, 0.3, 0.02]}><sphereGeometry args={[0.09, 12, 12]} />{mat}</mesh>
      {/* Pointed ears */}
      <mesh position={[-0.06, 0.42, 0.01]} rotation={[0, 0, -0.2]}>
        <coneGeometry args={[0.03, 0.08, 4]} /><meshStandardMaterial color={darker} />
      </mesh>
      <mesh position={[0.06, 0.42, 0.01]} rotation={[0, 0, 0.2]}>
        <coneGeometry args={[0.03, 0.08, 4]} /><meshStandardMaterial color={darker} />
      </mesh>
      {/* Eyes */}
      <mesh position={[-0.03, 0.33, 0.08]}><sphereGeometry args={[0.02, 8, 8]} /><meshStandardMaterial color="#ADFF2F" /></mesh>
      <mesh position={[-0.03, 0.33, 0.095]}><sphereGeometry args={[0.01, 8, 8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
      <mesh position={[0.03, 0.33, 0.08]}><sphereGeometry args={[0.02, 8, 8]} /><meshStandardMaterial color="#ADFF2F" /></mesh>
      <mesh position={[0.03, 0.33, 0.095]}><sphereGeometry args={[0.01, 8, 8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
      {/* Tail */}
      <mesh position={[0, 0.2, -0.12]} rotation={[-1, 0, 0.3]}>
        <cylinderGeometry args={[0.015, 0.01, 0.16, 6]} />{mat}
      </mesh>
    </group>
  );
}

function BearToken({ color }: { color: string }) {
  const darker = useMemo(() => new THREE.Color(color).multiplyScalar(0.65).getStyle(), [color]);
  const mat = <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} metalness={0.35} roughness={0.35} />;
  return (
    <group scale={[0.65, 0.65, 0.65]}>
      <mesh position={[0, 0.15, 0]}><sphereGeometry args={[0.12, 12, 12]} />{mat}</mesh>
      <mesh position={[0, 0.33, 0]}><sphereGeometry args={[0.1, 12, 12]} />{mat}</mesh>
      {/* Round ears */}
      <mesh position={[-0.08, 0.42, 0]}><sphereGeometry args={[0.04, 8, 8]} /><meshStandardMaterial color={darker} /></mesh>
      <mesh position={[0.08, 0.42, 0]}><sphereGeometry args={[0.04, 8, 8]} /><meshStandardMaterial color={darker} /></mesh>
      {/* Eyes */}
      <mesh position={[-0.035, 0.36, 0.08]}><sphereGeometry args={[0.02, 8, 8]} /><meshStandardMaterial color="#fff" /></mesh>
      <mesh position={[-0.035, 0.36, 0.095]}><sphereGeometry args={[0.013, 8, 8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
      <mesh position={[0.035, 0.36, 0.08]}><sphereGeometry args={[0.02, 8, 8]} /><meshStandardMaterial color="#fff" /></mesh>
      <mesh position={[0.035, 0.36, 0.095]}><sphereGeometry args={[0.013, 8, 8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
      {/* Snout */}
      <mesh position={[0, 0.3, 0.1]}><sphereGeometry args={[0.035, 8, 8]} /><meshStandardMaterial color="#F5DEB3" /></mesh>
      <mesh position={[0, 0.31, 0.13]}><sphereGeometry args={[0.015, 8, 8]} /><meshStandardMaterial color="#333" /></mesh>
    </group>
  );
}

function FoxToken({ color }: { color: string }) {
  const darker = useMemo(() => new THREE.Color(color).multiplyScalar(0.65).getStyle(), [color]);
  const mat = <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} metalness={0.35} roughness={0.35} />;
  return (
    <group scale={[0.65, 0.65, 0.65]}>
      <mesh position={[0, 0.12, 0]}><capsuleGeometry args={[0.08, 0.08, 4, 8]} />{mat}</mesh>
      <mesh position={[0, 0.3, 0.03]}><sphereGeometry args={[0.09, 12, 12]} />{mat}</mesh>
      {/* Pointed snout */}
      <mesh position={[0, 0.27, 0.12]} rotation={[0.4, 0, 0]}>
        <coneGeometry args={[0.03, 0.08, 6]} />{mat}
      </mesh>
      {/* Big ears */}
      <mesh position={[-0.06, 0.44, 0]} rotation={[0, 0, -0.15]}>
        <coneGeometry args={[0.03, 0.12, 4]} /><meshStandardMaterial color={darker} />
      </mesh>
      <mesh position={[0.06, 0.44, 0]} rotation={[0, 0, 0.15]}>
        <coneGeometry args={[0.03, 0.12, 4]} /><meshStandardMaterial color={darker} />
      </mesh>
      {/* Eyes */}
      <mesh position={[-0.03, 0.33, 0.08]}><sphereGeometry args={[0.018, 8, 8]} /><meshStandardMaterial color="#FFD54F" /></mesh>
      <mesh position={[-0.03, 0.33, 0.095]}><sphereGeometry args={[0.01, 8, 8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
      <mesh position={[0.03, 0.33, 0.08]}><sphereGeometry args={[0.018, 8, 8]} /><meshStandardMaterial color="#FFD54F" /></mesh>
      <mesh position={[0.03, 0.33, 0.095]}><sphereGeometry args={[0.01, 8, 8]} /><meshStandardMaterial color="#1a1a1a" /></mesh>
      {/* Nose */}
      <mesh position={[0, 0.29, 0.16]}><sphereGeometry args={[0.015, 8, 8]} /><meshStandardMaterial color="#333" /></mesh>
      {/* Bushy tail */}
      <mesh position={[0, 0.18, -0.14]} rotation={[-0.6, 0, 0]}>
        <sphereGeometry args={[0.06, 8, 8]} />{mat}
      </mesh>
    </group>
  );
}

const ANIMAL_COMPONENTS = [DogToken, CatToken, BearToken, FoxToken];

/* ================================================================== */
/*  ANIMATED TOKEN WRAPPER — Path-following hop animation               */
/* ================================================================== */
function AnimatedToken({ playerIndex, boardPosition, color, isActive, alive }: {
  playerIndex: number; boardPosition: number; color: string; isActive: boolean; alive: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const prevPos = useRef(boardPosition);
  const pathQueue = useRef<[number, number, number][]>([]);
  const pathStart = useRef(0);
  const spinRef = useRef(0);
  const AnimalComponent = ANIMAL_COMPONENTS[playerIndex] || DogToken;

  useEffect(() => {
    if (boardPosition === prevPos.current) return;
    const fwd = (boardPosition - prevPos.current + 40) % 40;
    if (fwd > 0 && fwd <= 12) {
      const path: [number, number, number][] = [];
      let p = prevPos.current;
      while (p !== boardPosition) {
        p = (p + 1) % 40;
        const b = BOARD_POSITIONS[p], o = TOKEN_OFFSETS[playerIndex];
        path.push([b[0] + o[0], TOKEN_Y, b[2] + o[2]]);
      }
      pathQueue.current = path;
    } else {
      const b = BOARD_POSITIONS[boardPosition], o = TOKEN_OFFSETS[playerIndex];
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
      groupRef.current.position.x += (target[0] - groupRef.current.position.x) * 0.18;
      groupRef.current.position.z += (target[2] - groupRef.current.position.z) * 0.18;
      const hop = Math.sin(((elapsed % HOP_MS) / HOP_MS) * Math.PI) * 0.5;
      groupRef.current.position.y = TOKEN_Y + hop;
      if (done) pathQueue.current = [];
    } else {
      const b = BOARD_POSITIONS[boardPosition] || BOARD_POSITIONS[0], o = TOKEN_OFFSETS[playerIndex];
      groupRef.current.position.x += (b[0] + o[0] - groupRef.current.position.x) * 0.06;
      groupRef.current.position.z += (b[2] + o[2] - groupRef.current.position.z) * 0.06;
      groupRef.current.position.y = TOKEN_Y + Math.sin(Date.now() * 0.003 + playerIndex) * 0.04;
    }
    spinRef.current += isActive ? 0.035 : 0.008;
    const s = isActive ? 1.2 + Math.sin(Date.now() * 0.005) * 0.08 : 1;
    groupRef.current.scale.set(s, s, s);
  });

  if (!alive) return null;
  const b = BOARD_POSITIONS[boardPosition] || BOARD_POSITIONS[0], o = TOKEN_OFFSETS[playerIndex];

  return (
    <group ref={groupRef} position={[b[0] + o[0], TOKEN_Y, b[2] + o[2]]}>
      {/* Ground glow */}
      <mesh position={[0, -TOKEN_Y + 0.13, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.35, 32]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={isActive ? 2.5 : 0.4}
          transparent opacity={isActive ? 0.4 : 0.12} side={THREE.DoubleSide} />
      </mesh>
      <group rotation={[0, spinRef.current, 0]}>
        <AnimalComponent color={color} />
      </group>
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
    <mesh ref={ref} position={[0, -TOKEN_Y + 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.38, 0.48, 6]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} transparent opacity={0.5} side={THREE.DoubleSide} />
    </mesh>
  );
}

/* ================================================================== */
/*  MONEY EFFECTS                                                      */
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
    ref.current.position.y = 0.8 + Math.sin(t * Math.PI) * 2;
    ref.current.rotation.y = t * 14;
    const sc = 0.9 + Math.sin(t * Math.PI) * 0.4;
    ref.current.scale.set(sc, sc, sc);
  });
  return (
    <mesh ref={ref} position={[fx.from[0], 0.8, fx.from[2]]}>
      <cylinderGeometry args={[0.09, 0.09, 0.035, 12]} />
      <meshStandardMaterial color="#FFD700" emissive="#FFA000" emissiveIntensity={1.5} metalness={0.9} roughness={0.1} />
    </mesh>
  );
}

/* ================================================================== */
/*  SCENE                                                              */
/* ================================================================== */
function Scene({ snapshot, latestEvents }: { snapshot: Snapshot | null; latestEvents: GameEvent[] }) {
  const [effects, setEffects] = useState<FxDef[]>([]);
  const fxId = useRef(0);

  const propertyOwners = useMemo(() => {
    const o: Record<number, number> = {};
    if (!snapshot) return o;
    for (const p of snapshot.properties) {
      if (p.ownerIndex >= 0 && p.index < PROPERTY_TO_TILE.length) o[PROPERTY_TO_TILE[p.index]] = p.ownerIndex;
    }
    return o;
  }, [snapshot]);

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
          for (let c = 0; c < 4; c++) {
            newFx.push({ id: fxId.current++, from: [fb[0], 0, fb[2]], to: [tb[0], 0, tb[2]], color: '#ffd700', start: Date.now() + c * 100 });
          }
        }
      }
    }
    if (newFx.length > 0) setEffects(prev => [...prev.slice(-12), ...newFx]);
  }, [latestEvents, snapshot]);

  const removeFx = useCallback((id: number) => setEffects(prev => prev.filter(f => f.id !== id)), []);

  return (
    <>
      {/* Rich bright lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[8, 20, 6]} intensity={0.9} color="#FFFAF0" castShadow />
      <directionalLight position={[-6, 14, -4]} intensity={0.3} color="#FFF5E6" />
      <pointLight position={[0, 15, 0]} intensity={0.6} color="#FFFDE7" distance={35} />
      <pointLight position={[-8, 8, 8]} intensity={0.3} color="#FFB74D" distance={20} />
      <pointLight position={[8, 8, -8]} intensity={0.3} color="#4FC3F7" distance={20} />

      {/* Colorful atmosphere */}
      <fog attach="fog" args={['#0C1B3A', 28, 55]} />
      <Sparkles count={300} scale={30} size={4} color="#FFD54F" speed={0.3} opacity={0.3} />
      <Sparkles count={150} scale={25} size={3} color="#4FC3F7" speed={0.2} opacity={0.2} />

      {/* Board */}
      <GameBoard propertyOwners={propertyOwners} />

      {/* Tokens */}
      {snapshot?.players.map((player, i) => (
        <AnimatedToken key={i} playerIndex={i} boardPosition={player.position} color={PLAYER_COLORS[i]}
          isActive={i === snapshot.currentPlayerIndex} alive={player.alive} />
      ))}

      {/* Dice */}
      {snapshot?.lastDice && (
        <AnimatedDice d1={snapshot.lastDice.d1} d2={snapshot.lastDice.d2} isDoubles={snapshot.lastDice.isDoubles} />
      )}

      {/* Money effects */}
      {effects.map(fx => (
        <MoneyParticle key={fx.id} fx={fx} onDone={() => removeFx(fx.id)} />
      ))}

      <OrbitControls target={[0, 0, 0]} maxPolarAngle={Math.PI / 2.1} minPolarAngle={0.15}
        minDistance={6} maxDistance={26} enableDamping dampingFactor={0.05}
        autoRotate={!snapshot} autoRotateSpeed={0.4} />
    </>
  );
}

/* ================================================================== */
/*  EXPORT                                                             */
/* ================================================================== */
export default function MonopolyScene({ snapshot, latestEvents = [] }: { snapshot: Snapshot | null; latestEvents?: GameEvent[] }) {
  return (
    <Canvas camera={{ position: [0, 16, 12], fov: 36 }}
      style={{ background: 'linear-gradient(180deg, #0C1B3A 0%, #15103A 40%, #0A2030 100%)' }}
      gl={{ antialias: true, alpha: false }} dpr={[1, 2]}>
      <Scene snapshot={snapshot} latestEvents={latestEvents} />
    </Canvas>
  );
}
