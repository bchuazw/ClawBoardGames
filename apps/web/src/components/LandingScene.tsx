'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sparkles, Text, Image } from '@react-three/drei';
import * as THREE from 'three';
import {
  PLAYER_COLORS,
  TILE_DATA,
  BOARD_POSITIONS,
  GROUP_COLORS,
  getTileEdge,
} from '@/lib/boardPositions';

/* Scale factor: spectator board is ~14.9 units, we want ~6.5 for landing */
const S = 0.45;

/* Scaled-down replica of the spectator Monopoly board */
function MiniBoard() {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * 0.05;
    ref.current.position.y = -1.5 + Math.sin(clock.elapsedTime * 0.2) * 0.2;
  });

  return (
    <group ref={ref} rotation={[0.32, 0, 0.06]}>
      {/* Same structure as MonopolyScene GameBoard, scaled by S */}
      {/* Thick board body */}
      <mesh position={[0, -0.24 * S, 0]}>
        <boxGeometry args={[14.9 * S, 0.65 * S, 14.9 * S]} />
        <meshStandardMaterial color="#6D3A1A" metalness={0.15} roughness={0.65} />
      </mesh>
      {/* Board rim */}
      <mesh position={[0, -0.01 * S, 0]}>
        <boxGeometry args={[14.5 * S, 0.14 * S, 14.5 * S]} />
        <meshStandardMaterial color="#8B5E3C" metalness={0.1} roughness={0.7} />
      </mesh>
      {/* Green felt */}
      <mesh position={[0, 0.07 * S, 0]}>
        <boxGeometry args={[13.9 * S, 0.06 * S, 13.9 * S]} />
        <meshStandardMaterial color="#2E8B3C" metalness={0.05} roughness={0.92} />
      </mesh>
      {/* Inner play area */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.103 * S, 0]}>
        <planeGeometry args={[10.1 * S, 10.1 * S]} />
        <meshStandardMaterial color="#1E7832" />
      </mesh>
      {/* Gold trim rails (same as spectator) */}
      {[
        [0, 7.0 * S, 14.4 * S, 0.1 * S],
        [0, -7.0 * S, 14.4 * S, 0.1 * S],
        [7.0 * S, 0, 0.1 * S, 14.4 * S],
        [-7.0 * S, 0, 0.1 * S, 14.4 * S],
      ].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x as number, 0.12 * S, z as number]}>
          <boxGeometry args={[w as number, 0.07 * S, d as number]} />
          <meshStandardMaterial color="#D4A84B" metalness={0.8} roughness={0.15} emissive="#D4A84B" emissiveIntensity={0.08} />
        </mesh>
      ))}

      {/* All 40 tiles — same layout as spectator */}
      {TILE_DATA.map((tile, i) => {
        const pos = BOARD_POSITIONS[i];
        const edge = getTileEdge(tile.position);
        const isProp = tile.group > 0;
        let w = 1.1 * S,
          d = 1.1 * S;
        if (tile.isCorner) {
          w = 1.2 * S;
          d = 1.2 * S;
        } else if (edge === 'bottom' || edge === 'top') {
          w = 1.1 * S;
          d = 0.78 * S;
        } else {
          w = 0.78 * S;
          d = 1.1 * S;
        }
        const gc = GROUP_COLORS[tile.group] ?? '#2E8B3C';
        const tilePos: [number, number, number] = [pos[0] * S, 0.11 * S, pos[2] * S];
        return (
          <group key={i} position={tilePos}>
            <mesh>
              <boxGeometry args={[w, 0.06 * S, d]} />
              <meshStandardMaterial
                color={tile.isCorner ? '#E8DCC8' : '#F5EED6'}
                metalness={0.04}
                roughness={0.8}
              />
            </mesh>
            {isProp && !tile.isCorner && (
              <>
                {/* Color bar on property tile */}
                {edge === 'bottom' && (
                  <mesh position={[0, 0.03 * S, -d * 0.34]}>
                    <boxGeometry args={[w * 0.9, 0.04 * S, d * 0.28]} />
                    <meshStandardMaterial color={gc} emissive={gc} emissiveIntensity={0.2} metalness={0.3} roughness={0.5} />
                  </mesh>
                )}
                {edge === 'top' && (
                  <mesh position={[0, 0.03 * S, d * 0.34]}>
                    <boxGeometry args={[w * 0.9, 0.04 * S, d * 0.28]} />
                    <meshStandardMaterial color={gc} emissive={gc} emissiveIntensity={0.2} metalness={0.3} roughness={0.5} />
                  </mesh>
                )}
                {edge === 'left' && (
                  <mesh position={[w * 0.34, 0.03 * S, 0]}>
                    <boxGeometry args={[w * 0.28, 0.04 * S, d * 0.9]} />
                    <meshStandardMaterial color={gc} emissive={gc} emissiveIntensity={0.2} metalness={0.3} roughness={0.5} />
                  </mesh>
                )}
                {edge === 'right' && (
                  <mesh position={[-w * 0.34, 0.03 * S, 0]}>
                    <boxGeometry args={[w * 0.28, 0.04 * S, d * 0.9]} />
                    <meshStandardMaterial color={gc} emissive={gc} emissiveIntensity={0.2} metalness={0.3} roughness={0.5} />
                  </mesh>
                )}
              </>
            )}
          </group>
        );
      })}

      {/* Corner labels — GO, JAIL, FREE PARKING, GO TO JAIL */}
      <group position={[6 * S, 0.08 * S, 6 * S]} rotation={[-Math.PI / 2, 0, 0]}>
        <Text fontSize={0.22 * S} color="#2E7D32" anchorX="center" anchorY="middle" fontWeight={800}>GO</Text>
      </group>
      <group position={[-6 * S, 0.08 * S, 6 * S]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        <Text fontSize={0.17 * S} color="#D84315" anchorX="center" anchorY="middle" fontWeight={800}>JAIL</Text>
      </group>
      <group position={[-6 * S, 0.08 * S, -6 * S]} rotation={[-Math.PI / 2, 0, Math.PI]}>
        <Text fontSize={0.1 * S} color="#F9A825" anchorX="center" anchorY="middle">FREE PARKING</Text>
      </group>
      <group position={[6 * S, 0.08 * S, -6 * S]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]}>
        <Text fontSize={0.12 * S} color="#C62828" anchorX="center" anchorY="middle" fontWeight={800}>GO TO JAIL</Text>
      </group>

      {/* Board center — logo fills inner square (same size as inner play area 10.1*S) */}
      <Image url="/clawboardgames-logo.png" position={[0, 0.131 * S, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[10.1 * S, 10.1 * S]} />

      {/* Corner gold pillars with orbs (like spectator) */}
      {[
        [6.4 * S, 6.4 * S],
        [-6.4 * S, 6.4 * S],
        [-6.4 * S, -6.4 * S],
        [6.4 * S, -6.4 * S],
      ].map(([x, z], i) => (
        <group key={i} position={[x, 0.12 * S, z]}>
          <mesh position={[0, 0.04 * S, 0]}>
            <boxGeometry args={[0.2 * S, 0.08 * S, 0.2 * S]} />
            <meshStandardMaterial color="#D4A84B" metalness={0.9} roughness={0.1} />
          </mesh>
          <mesh position={[0, 0.42 * S, 0]}>
            <cylinderGeometry args={[0.05 * S, 0.065 * S, 0.65 * S, 8]} />
            <meshStandardMaterial color="#D4A84B" metalness={0.85} roughness={0.15} />
          </mesh>
          <mesh position={[0, 0.78 * S, 0]}>
            <sphereGeometry args={[0.09 * S, 12, 12]} />
            <meshStandardMaterial color="#FFD700" metalness={0.9} roughness={0.08} emissive="#FFD700" emissiveIntensity={0.2} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* Pip layout: half-size 0.175, pip radius 0.022, offset from face center 0.055, pip just off face at 0.195 */
const DIE_PIP_R = 0.022;
const DIE_PIP_OFF = 0.055;
const DIE_PIP_Z = 0.175 + 0.02;

function DiePips() {
  const pipMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.6 }), []);
  return (
    <>
      {/* +X face: 1 pip */}
      <mesh position={[DIE_PIP_Z, 0, 0]} material={pipMat}><sphereGeometry args={[DIE_PIP_R, 10, 10]} /></mesh>
      {/* -X face: 6 pips */}
      {[[DIE_PIP_OFF, DIE_PIP_OFF], [-DIE_PIP_OFF, -DIE_PIP_OFF], [DIE_PIP_OFF, -DIE_PIP_OFF], [-DIE_PIP_OFF, DIE_PIP_OFF], [0, DIE_PIP_OFF], [0, -DIE_PIP_OFF]].map(([y, z], i) => (
        <mesh key={i} position={[-DIE_PIP_Z, y, z]} material={pipMat}><sphereGeometry args={[DIE_PIP_R, 10, 10]} /></mesh>
      ))}
      {/* +Y face: 2 pips */}
      <mesh position={[DIE_PIP_OFF, DIE_PIP_Z, DIE_PIP_OFF]} material={pipMat}><sphereGeometry args={[DIE_PIP_R, 10, 10]} /></mesh>
      <mesh position={[-DIE_PIP_OFF, DIE_PIP_Z, -DIE_PIP_OFF]} material={pipMat}><sphereGeometry args={[DIE_PIP_R, 10, 10]} /></mesh>
      {/* -Y face: 5 pips */}
      {[[DIE_PIP_OFF, DIE_PIP_OFF], [-DIE_PIP_OFF, -DIE_PIP_OFF], [DIE_PIP_OFF, -DIE_PIP_OFF], [-DIE_PIP_OFF, DIE_PIP_OFF], [0, 0]].map(([x, z], i) => (
        <mesh key={i} position={[x, -DIE_PIP_Z, z]} material={pipMat}><sphereGeometry args={[DIE_PIP_R, 10, 10]} /></mesh>
      ))}
      {/* +Z face: 3 pips */}
      <mesh position={[DIE_PIP_OFF, DIE_PIP_OFF, DIE_PIP_Z]} material={pipMat}><sphereGeometry args={[DIE_PIP_R, 10, 10]} /></mesh>
      <mesh position={[0, 0, DIE_PIP_Z]} material={pipMat}><sphereGeometry args={[DIE_PIP_R, 10, 10]} /></mesh>
      <mesh position={[-DIE_PIP_OFF, -DIE_PIP_OFF, DIE_PIP_Z]} material={pipMat}><sphereGeometry args={[DIE_PIP_R, 10, 10]} /></mesh>
      {/* -Z face: 4 pips */}
      {[[DIE_PIP_OFF, DIE_PIP_OFF], [-DIE_PIP_OFF, DIE_PIP_OFF], [DIE_PIP_OFF, -DIE_PIP_OFF], [-DIE_PIP_OFF, -DIE_PIP_OFF]].map(([x, y], i) => (
        <mesh key={i} position={[x, y, -DIE_PIP_Z]} material={pipMat}><sphereGeometry args={[DIE_PIP_R, 10, 10]} /></mesh>
      ))}
    </>
  );
}

/* Floating tumbling dice */
function FloatingDie({ startPos, speed }: { startPos: [number, number, number]; speed: number }) {
  const ref = useRef<THREE.Group>(null);
  const off = useRef(Math.random() * Math.PI * 2);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime * speed + off.current;
    ref.current.position.y = startPos[1] + Math.sin(t) * 0.4;
    ref.current.position.x = startPos[0] + Math.cos(t * 0.6) * 0.2;
    ref.current.rotation.x = t * 0.4;
    ref.current.rotation.y = t * 0.3;
  });
  return (
    <group ref={ref} position={startPos}>
      <mesh>
        <boxGeometry args={[0.35, 0.35, 0.35]} />
        <meshStandardMaterial color="#F8F4E8" metalness={0.05} roughness={0.25} />
      </mesh>
      <DiePips />
    </group>
  );
}

/* Floating coins */
function FloatingCoin({ startPos, speed }: { startPos: [number, number, number]; speed: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const off = useRef(Math.random() * Math.PI * 2);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime * speed + off.current;
    ref.current.position.y = startPos[1] + Math.sin(t) * 0.6;
    ref.current.position.x = startPos[0] + Math.cos(t * 0.7) * 0.25;
    ref.current.rotation.y = t * 1.2;
  });
  return (
    <mesh ref={ref} position={startPos}>
      <cylinderGeometry args={[0.1, 0.1, 0.03, 24]} />
      <meshStandardMaterial color="#E65C00" metalness={0.85} roughness={0.12} emissive="#CC5500" emissiveIntensity={0.25} />
    </mesh>
  );
}

/* Floating cube for side decoration */
function FloatingCube({ startPos, speed }: { startPos: [number, number, number]; speed: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const off = useRef(Math.random() * Math.PI * 2);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime * speed + off.current;
    ref.current.position.y = startPos[1] + Math.sin(t * 0.8) * 0.35;
    ref.current.rotation.y = t * 0.4;
    ref.current.rotation.x = Math.sin(t * 0.5) * 0.15;
  });
  return (
    <mesh ref={ref} position={startPos}>
      <boxGeometry args={[0.4, 0.4, 0.4]} />
      <meshStandardMaterial color="#78909C" metalness={0.2} roughness={0.6} />
    </mesh>
  );
}

/* Token shapes orbiting the board */
function OrbitingToken({ index, color }: { index: number; color: string }) {
  const ref = useRef<THREE.Group>(null);
  const startAngle = useRef(index * Math.PI / 2);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime * 0.2 + startAngle.current;
    const r = 3.8;
    ref.current.position.x = Math.cos(t) * r;
    ref.current.position.z = Math.sin(t) * r;
    ref.current.position.y = -0.5 + Math.sin(t * 2) * 0.35;
    ref.current.rotation.y = -t + Math.PI / 2;
  });
  return (
    <group ref={ref} scale={[1.2, 1.2, 1.2]}>
      <mesh position={[0, 0.12, 0]}><capsuleGeometry args={[0.07, 0.06, 4, 8]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} metalness={0.3} roughness={0.4} /></mesh>
      <mesh position={[0, 0.26, 0.02]}><sphereGeometry args={[0.06, 8, 8]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} metalness={0.3} roughness={0.4} /></mesh>
      <mesh position={[-0.04, 0.32, 0]}><sphereGeometry args={[0.02, 6, 6]} /><meshStandardMaterial color={new THREE.Color(color).multiplyScalar(0.6).getStyle()} /></mesh>
      <mesh position={[0.04, 0.32, 0]}><sphereGeometry args={[0.02, 6, 6]} /><meshStandardMaterial color={new THREE.Color(color).multiplyScalar(0.6).getStyle()} /></mesh>
    </group>
  );
}

function SceneContent() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[4, 14, 6]} intensity={0.7} color="#FFF8F0" />
      <directionalLight position={[-3, 8, -4]} intensity={0.25} color="#CC5500" />
      <pointLight position={[0, 6, 4]} intensity={0.4} color="#CC5500" distance={25} />
      <pointLight position={[-4, 5, 2]} intensity={0.2} color="#FFD54F" distance={18} />
      <pointLight position={[5, 4, -2]} intensity={0.15} color="#4FC3F7" distance={15} />
      <fog attach="fog" args={['#0C1B3A', 14, 35]} />

      <Sparkles count={200} scale={24} size={2.5} color="#CC5500" speed={0.15} opacity={0.25} />
      <Sparkles count={100} scale={20} size={1.5} color="#FFD54F" speed={0.2} opacity={0.15} />
      <Sparkles count={60} scale={16} size={2} color="#E040FB" speed={0.1} opacity={0.08} />

      <MiniBoard />

      <FloatingDie startPos={[3.5, 1.5, -1.5]} speed={0.7} />
      <FloatingDie startPos={[-3, 2.2, 1]} speed={0.9} />
      {/* Extra dice on the sides so left/right feel less empty */}
      <FloatingDie startPos={[-5.5, 1.8, 0]} speed={0.5} />
      <FloatingDie startPos={[5.2, 0.8, -2]} speed={0.6} />
      <FloatingDie startPos={[-5, 2.5, -2.5]} speed={0.55} />
      <FloatingDie startPos={[5.8, 1.2, 1.5]} speed={0.65} />

      {[[-3.5, 0.5, 2.5], [4, 1, -2], [-1.5, 3, -3.5], [2.5, 0, 3], [0, 3.5, 1.5], [-4, 2, -1], [3, 2.5, 0],
        [-5.5, 2, 1], [-5.2, 0.6, -1.5], [-5.8, 1.5, 2], [5.5, 1.8, -0.5], [5, 0.4, 2.2], [5.8, 2.2, -2.5],
      ].map((p, i) => (
        <FloatingCoin key={i} startPos={p as [number, number, number]} speed={0.35 + i * 0.06} />
      ))}

      {/* Side cubes and orbs — fill left/right */}
      <FloatingCube startPos={[-5.2, 0.8, -1]} speed={0.3} />
      <FloatingCube startPos={[-5.5, 1.6, 2.2]} speed={0.35} />
      <FloatingCube startPos={[5.3, 1.2, -2]} speed={0.32} />
      <FloatingCube startPos={[5.6, 0.5, 1.5]} speed={0.28} />

      {PLAYER_COLORS.map((c, i) => (
        <OrbitingToken key={i} index={i} color={c} />
      ))}
    </>
  );
}

export default function LandingScene() {
  return (
    <Canvas
      camera={{ position: [0, 3.5, 11], fov: 38 }}
      style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 1.5]}
    >
      <SceneContent />
    </Canvas>
  );
}
