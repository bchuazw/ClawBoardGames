"use client";
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ============================================================
// Role color configs
// ============================================================
export const ROLE_CONFIGS: Record<string, {
  primary: string;
  secondary: string;
  glow: string;
  alignment: 'good' | 'evil';
  label: string;
}> = {
  Merlin:   { primary: '#4488ff', secondary: '#aaddff', glow: '#66aaff', alignment: 'good', label: 'Merlin' },
  Percival: { primary: '#88bbff', secondary: '#cceeff', glow: '#aaccff', alignment: 'good', label: 'Percival' },
  Servant:  { primary: '#44cc66', secondary: '#aaffbb', glow: '#66ee88', alignment: 'good', label: 'Servant' },
  Assassin: { primary: '#ff2244', secondary: '#ff6688', glow: '#ff4466', alignment: 'evil', label: 'Assassin' },
  Morgana:  { primary: '#9922cc', secondary: '#cc66ff', glow: '#aa44dd', alignment: 'evil', label: 'Morgana' },
  Mordred:  { primary: '#cc0000', secondary: '#ff4444', glow: '#dd2222', alignment: 'evil', label: 'Mordred' },
  Oberon:   { primary: '#444466', secondary: '#8888aa', glow: '#666688', alignment: 'evil', label: 'Oberon' },
  Unknown:  { primary: '#888888', secondary: '#aaaaaa', glow: '#999999', alignment: 'good', label: 'Unknown' },
};

// ============================================================
// Merlin Figurine – Wizard with tall hat & staff
// ============================================================
export function MerlinFigurine({ color = '#4488ff', glowColor = '#66aaff' }: { color?: string; glowColor?: string }) {
  const staffRef = useRef<THREE.Group>(null);
  const orbRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (orbRef.current) {
      orbRef.current.position.y = 1.95 + Math.sin(state.clock.elapsedTime * 3) * 0.04;
      (orbRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        1.5 + Math.sin(state.clock.elapsedTime * 4) * 0.5;
    }
  });

  return (
    <group>
      {/* Robe / Body */}
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.12, 0.22, 0.7, 8]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      {/* Robe bottom flare */}
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.22, 0.28, 0.1, 8]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0.85, 0]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color="#ffe0c0" roughness={0.5} />
      </mesh>
      {/* Wizard Hat */}
      <mesh position={[0, 1.08, 0]}>
        <coneGeometry args={[0.15, 0.4, 8]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      {/* Hat brim */}
      <mesh position={[0, 0.92, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.14, 0.02, 8, 16]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      {/* Beard */}
      <mesh position={[0, 0.72, 0.08]}>
        <coneGeometry args={[0.06, 0.15, 6]} />
        <meshStandardMaterial color="#ddddcc" roughness={0.8} />
      </mesh>
      {/* Staff */}
      <group ref={staffRef} position={[0.2, 0, 0]}>
        <mesh position={[0, 0.7, 0]}>
          <cylinderGeometry args={[0.015, 0.02, 1.4, 6]} />
          <meshStandardMaterial color="#8B4513" roughness={0.7} />
        </mesh>
        {/* Staff orb */}
        <mesh ref={orbRef} position={[0, 1.45, 0]}>
          <sphereGeometry args={[0.06, 16, 16]} />
          <meshStandardMaterial
            color={glowColor}
            emissive={glowColor}
            emissiveIntensity={1.5}
            toneMapped={false}
          />
        </mesh>
        {/* Staff orb glow */}
        <pointLight position={[0, 1.45, 0]} color={glowColor} intensity={0.5} distance={1.5} />
      </group>
    </group>
  );
}

// ============================================================
// Percival Figurine – Knight with shield
// ============================================================
export function PercivalFigurine({ color = '#88bbff', glowColor = '#aaccff' }: { color?: string; glowColor?: string }) {
  const shieldRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (shieldRef.current) {
      shieldRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
    }
  });

  return (
    <group>
      {/* Armor Body */}
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.14, 0.18, 0.7, 8]} />
        <meshStandardMaterial color="#c0c0d0" metalness={0.6} roughness={0.3} />
      </mesh>
      {/* Shoulder pads */}
      <mesh position={[-0.16, 0.6, 0]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#d0d0e0" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0.16, 0.6, 0]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#d0d0e0" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0.85, 0]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color="#ffe0c0" roughness={0.5} />
      </mesh>
      {/* Helmet */}
      <mesh position={[0, 0.94, 0]}>
        <sphereGeometry args={[0.13, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={color} metalness={0.5} roughness={0.3} />
      </mesh>
      {/* Shield */}
      <group ref={shieldRef} position={[-0.22, 0.4, 0.05]}>
        <mesh rotation={[0, 0.3, 0]}>
          <boxGeometry args={[0.03, 0.25, 0.2]} />
          <meshStandardMaterial color={color} metalness={0.5} roughness={0.3} />
        </mesh>
        {/* Shield emblem */}
        <mesh position={[-0.02, 0, 0.05]} rotation={[0, 0.3, 0]}>
          <circleGeometry args={[0.04, 6]} />
          <meshStandardMaterial color={glowColor} emissive={glowColor} emissiveIntensity={0.5} />
        </mesh>
      </group>
      {/* Sword */}
      <mesh position={[0.2, 0.55, 0]} rotation={[0, 0, -0.3]}>
        <boxGeometry args={[0.02, 0.5, 0.01]} />
        <meshStandardMaterial color="#e0e0e0" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[0.2, 0.3, 0]}>
        <boxGeometry args={[0.08, 0.02, 0.02]} />
        <meshStandardMaterial color="#8B4513" roughness={0.6} />
      </mesh>
    </group>
  );
}

// ============================================================
// Servant Figurine – Simple villager
// ============================================================
export function ServantFigurine({ color = '#44cc66' }: { color?: string; glowColor?: string }) {
  return (
    <group>
      {/* Tunic Body */}
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.12, 0.18, 0.7, 8]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      {/* Belt */}
      <mesh position={[0, 0.25, 0]}>
        <cylinderGeometry args={[0.17, 0.17, 0.04, 16]} />
        <meshStandardMaterial color="#8B4513" roughness={0.6} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0.85, 0]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color="#ffe0c0" roughness={0.5} />
      </mesh>
      {/* Cap */}
      <mesh position={[0, 0.94, 0]}>
        <sphereGeometry args={[0.13, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.5]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      {/* Arms */}
      <mesh position={[-0.17, 0.45, 0]} rotation={[0, 0, 0.4]}>
        <cylinderGeometry args={[0.03, 0.03, 0.3, 6]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <mesh position={[0.17, 0.45, 0]} rotation={[0, 0, -0.4]}>
        <cylinderGeometry args={[0.03, 0.03, 0.3, 6]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      {/* Lantern (hand) */}
      <mesh position={[0.24, 0.35, 0]}>
        <boxGeometry args={[0.06, 0.08, 0.06]} />
        <meshStandardMaterial
          color="#ffcc44"
          emissive="#ffcc44"
          emissiveIntensity={0.4}
        />
      </mesh>
      <pointLight position={[0.24, 0.35, 0]} color="#ffcc44" intensity={0.2} distance={0.8} />
    </group>
  );
}

// ============================================================
// Assassin Figurine – Hooded figure with dagger
// ============================================================
export function AssassinFigurine({ color = '#ff2244', glowColor = '#ff4466' }: { color?: string; glowColor?: string }) {
  const daggerRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (daggerRef.current) {
      daggerRef.current.rotation.z = -0.3 + Math.sin(state.clock.elapsedTime * 2) * 0.05;
    }
  });

  return (
    <group>
      {/* Dark Cloak Body */}
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.13, 0.24, 0.7, 8]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.8} />
      </mesh>
      {/* Cloak overlay */}
      <mesh position={[0, 0.42, 0.04]}>
        <cylinderGeometry args={[0.14, 0.22, 0.65, 8, 1, true]} />
        <meshStandardMaterial color={color} roughness={0.7} transparent opacity={0.4} side={THREE.DoubleSide} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0.85, 0]}>
        <sphereGeometry args={[0.11, 16, 16]} />
        <meshStandardMaterial color="#ffe0c0" roughness={0.5} />
      </mesh>
      {/* Hood */}
      <mesh position={[0, 0.92, -0.02]}>
        <sphereGeometry args={[0.15, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.8]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
      {/* Glowing eyes */}
      <mesh position={[-0.04, 0.85, 0.1]}>
        <sphereGeometry args={[0.015, 8, 8]} />
        <meshStandardMaterial color={glowColor} emissive={glowColor} emissiveIntensity={3} toneMapped={false} />
      </mesh>
      <mesh position={[0.04, 0.85, 0.1]}>
        <sphereGeometry args={[0.015, 8, 8]} />
        <meshStandardMaterial color={glowColor} emissive={glowColor} emissiveIntensity={3} toneMapped={false} />
      </mesh>
      {/* Dagger */}
      <group ref={daggerRef} position={[0.18, 0.45, 0.05]}>
        <mesh rotation={[0, 0, -0.3]}>
          <boxGeometry args={[0.015, 0.25, 0.005]} />
          <meshStandardMaterial color="#e0e0e0" metalness={0.9} roughness={0.1} />
        </mesh>
        <mesh position={[0, -0.13, 0]}>
          <boxGeometry args={[0.05, 0.02, 0.015]} />
          <meshStandardMaterial color="#333" roughness={0.5} />
        </mesh>
        {/* Blood drip glow */}
        <mesh position={[0, 0.13, 0]}>
          <sphereGeometry args={[0.01, 8, 8]} />
          <meshStandardMaterial color={glowColor} emissive={glowColor} emissiveIntensity={2} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

// ============================================================
// Morgana Figurine – Sorceress with flowing robes
// ============================================================
export function MorganaFigurine({ color = '#9922cc', glowColor = '#aa44dd' }: { color?: string; glowColor?: string }) {
  const magicRef = useRef<THREE.Points>(null);

  const particles = useMemo(() => {
    const positions = new Float32Array(30 * 3);
    for (let i = 0; i < 30; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 0.4;
      positions[i * 3 + 1] = Math.random() * 1.2;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
    }
    return positions;
  }, []);

  useFrame((state) => {
    if (magicRef.current) {
      magicRef.current.rotation.y = state.clock.elapsedTime * 0.3;
      const pos = magicRef.current.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        pos.setY(i, ((y + 0.005) % 1.2));
      }
      pos.needsUpdate = true;
    }
  });

  return (
    <group>
      {/* Flowing Robe */}
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.12, 0.26, 0.7, 12]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      {/* Robe details */}
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.26, 0.3, 0.12, 12]} />
        <meshStandardMaterial color={color} roughness={0.6} transparent opacity={0.7} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0.85, 0]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color="#ffe0c0" roughness={0.5} />
      </mesh>
      {/* Hair / Headdress */}
      <mesh position={[0, 0.92, -0.03]}>
        <sphereGeometry args={[0.14, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#220033" roughness={0.6} />
      </mesh>
      {/* Crown/tiara */}
      <mesh position={[0, 0.97, 0]} rotation={[0.2, 0, 0]}>
        <torusGeometry args={[0.1, 0.01, 4, 8]} />
        <meshStandardMaterial color={glowColor} emissive={glowColor} emissiveIntensity={1} metalness={0.8} />
      </mesh>
      {/* Magic hands */}
      <mesh position={[-0.18, 0.5, 0.1]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial color={glowColor} emissive={glowColor} emissiveIntensity={1.5} toneMapped={false} />
      </mesh>
      <mesh position={[0.18, 0.5, 0.1]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial color={glowColor} emissive={glowColor} emissiveIntensity={1.5} toneMapped={false} />
      </mesh>
      {/* Floating magic particles */}
      <points ref={magicRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={30}
            array={particles}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial size={0.02} color={glowColor} transparent opacity={0.6} sizeAttenuation />
      </points>
      <pointLight position={[0, 0.5, 0.1]} color={glowColor} intensity={0.3} distance={1} />
    </group>
  );
}

// ============================================================
// Generic figurine for other roles (Mordred, Oberon, etc.)
// ============================================================
export function GenericFigurine({ color = '#888888', glowColor = '#999999', isEvil = false }: { color?: string; glowColor?: string; isEvil?: boolean }) {
  return (
    <group>
      {/* Body */}
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.12, 0.2, 0.7, 8]} />
        <meshStandardMaterial color={isEvil ? '#1a1a2e' : color} roughness={0.6} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0.85, 0]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color="#ffe0c0" roughness={0.5} />
      </mesh>
      {/* Accessory */}
      <mesh position={[0, 0.97, 0]}>
        <sphereGeometry args={[0.13, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.5]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      {/* Arms */}
      <mesh position={[-0.17, 0.45, 0]} rotation={[0, 0, 0.3]}>
        <cylinderGeometry args={[0.03, 0.03, 0.3, 6]} />
        <meshStandardMaterial color={isEvil ? '#1a1a2e' : color} roughness={0.7} />
      </mesh>
      <mesh position={[0.17, 0.45, 0]} rotation={[0, 0, -0.3]}>
        <cylinderGeometry args={[0.03, 0.03, 0.3, 6]} />
        <meshStandardMaterial color={isEvil ? '#1a1a2e' : color} roughness={0.7} />
      </mesh>
      {/* Glow mark */}
      <mesh position={[0, 0.65, 0.13]}>
        <circleGeometry args={[0.03, 8]} />
        <meshStandardMaterial color={glowColor} emissive={glowColor} emissiveIntensity={1} />
      </mesh>
    </group>
  );
}

// ============================================================
// Figurine selector component
// ============================================================
export function CharacterFigurine({ role }: { role: string }) {
  const config = ROLE_CONFIGS[role] || ROLE_CONFIGS.Unknown;

  switch (role) {
    case 'Merlin':
      return <MerlinFigurine color={config.primary} glowColor={config.glow} />;
    case 'Percival':
      return <PercivalFigurine color={config.primary} glowColor={config.glow} />;
    case 'Servant':
      return <ServantFigurine color={config.primary} glowColor={config.glow} />;
    case 'Assassin':
      return <AssassinFigurine color={config.primary} glowColor={config.glow} />;
    case 'Morgana':
      return <MorganaFigurine color={config.primary} glowColor={config.glow} />;
    default:
      return <GenericFigurine color={config.primary} glowColor={config.glow} isEvil={config.alignment === 'evil'} />;
  }
}
