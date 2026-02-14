'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { PLAYER_COLORS } from '@/lib/boardPositions';

/* Slowly rotating simplified Monopoly board */
function MiniBoard() {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * 0.06;
    ref.current.position.y = -1.5 + Math.sin(clock.elapsedTime * 0.25) * 0.25;
  });
  return (
    <group ref={ref} rotation={[0.35, 0, 0.08]}>
      <mesh><boxGeometry args={[5.5, 0.28, 5.5]} /><meshStandardMaterial color="#6D3A1A" metalness={0.15} roughness={0.65} /></mesh>
      <mesh position={[0, 0.15, 0]}><boxGeometry args={[5.2, 0.04, 5.2]} /><meshStandardMaterial color="#2E8B3C" metalness={0.05} roughness={0.9} /></mesh>
      <mesh position={[0, 0.18, 0]}><boxGeometry args={[5.4, 0.02, 5.4]} /><meshStandardMaterial color="#D4A84B" metalness={0.8} roughness={0.15} emissive="#D4A84B" emissiveIntensity={0.1} /></mesh>
      {/* Tile strips along edges */}
      {[-2, -1, 0, 1, 2].map(i => (
        <group key={i}>
          <mesh position={[i, 0.2, 2.5]}><boxGeometry args={[0.7, 0.04, 0.4]} /><meshStandardMaterial color="#F5EED6" /></mesh>
          <mesh position={[i, 0.2, -2.5]}><boxGeometry args={[0.7, 0.04, 0.4]} /><meshStandardMaterial color="#F5EED6" /></mesh>
          <mesh position={[2.5, 0.2, i]}><boxGeometry args={[0.4, 0.04, 0.7]} /><meshStandardMaterial color="#F5EED6" /></mesh>
          <mesh position={[-2.5, 0.2, i]}><boxGeometry args={[0.4, 0.04, 0.7]} /><meshStandardMaterial color="#F5EED6" /></mesh>
        </group>
      ))}
      {/* Color strips */}
      {[['#9C27B0', -2], ['#2196F3', -1], ['#4CAF50', 0], ['#F44336', 1], ['#FF9800', 2]].map(([c, i], k) => (
        <mesh key={k} position={[i as number, 0.24, 2.5]}><boxGeometry args={[0.65, 0.025, 0.12]} /><meshStandardMaterial color={c as string} emissive={c as string} emissiveIntensity={0.15} /></mesh>
      ))}
      {/* Corner pillars */}
      {[[2.6, 2.6], [-2.6, 2.6], [-2.6, -2.6], [2.6, -2.6]].map(([x, z], i) => (
        <group key={i} position={[x, 0.18, z]}>
          <mesh position={[0, 0.18, 0]}><cylinderGeometry args={[0.035, 0.045, 0.32, 8]} /><meshStandardMaterial color="#D4A84B" metalness={0.85} roughness={0.15} /></mesh>
          <mesh position={[0, 0.36, 0]}><sphereGeometry args={[0.06, 10, 10]} /><meshStandardMaterial color="#FFD700" metalness={0.9} roughness={0.08} emissive="#FFD700" emissiveIntensity={0.25} /></mesh>
        </group>
      ))}
    </group>
  );
}

/* Floating tumbling dice */
function FloatingDie({ startPos, speed }: { startPos: [number, number, number]; speed: number }) {
  const ref = useRef<THREE.Mesh>(null);
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
    <mesh ref={ref} position={startPos}>
      <boxGeometry args={[0.35, 0.35, 0.35]} />
      <meshStandardMaterial color="#FFFDF5" metalness={0.02} roughness={0.2} />
    </mesh>
  );
}

/* Floating gold coins */
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
      <cylinderGeometry args={[0.1, 0.1, 0.03, 16]} />
      <meshStandardMaterial color="#FFD700" metalness={0.9} roughness={0.1} emissive="#FFA000" emissiveIntensity={0.3} />
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
      <ambientLight intensity={0.35} />
      <directionalLight position={[6, 12, 5]} intensity={0.6} color="#FFFAF0" />
      <pointLight position={[-5, 8, -5]} intensity={0.25} color="#D4A84B" distance={20} />
      <pointLight position={[5, 5, 5]} intensity={0.2} color="#4FC3F7" distance={15} />
      <fog attach="fog" args={['#0C1B3A', 12, 30]} />

      <Sparkles count={180} scale={22} size={3} color="#FFD54F" speed={0.2} opacity={0.2} />
      <Sparkles count={80} scale={18} size={2} color="#E040FB" speed={0.15} opacity={0.1} />

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
      camera={{ position: [0, 4, 10], fov: 40 }}
      style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 1.5]}
    >
      <SceneContent />
    </Canvas>
  );
}
