"use client";
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ============================================================
// Procedural mountain using cone + displacement
// ============================================================
function Mountain({ position, scale, color, snowColor }: {
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
  snowColor?: string;
}) {
  return (
    <group position={position} scale={scale}>
      {/* Main peak */}
      <mesh>
        <coneGeometry args={[1, 2.5, 7, 1]} />
        <meshStandardMaterial color={color} roughness={0.9} flatShading />
      </mesh>
      {/* Snow cap */}
      {snowColor && (
        <mesh position={[0, 0.7, 0]}>
          <coneGeometry args={[0.45, 1, 7, 1]} />
          <meshStandardMaterial color={snowColor} roughness={0.4} flatShading />
        </mesh>
      )}
    </group>
  );
}

// ============================================================
// Castle tower
// ============================================================
function CastleTower({ position, height, radius }: {
  position: [number, number, number];
  height: number;
  radius: number;
}) {
  return (
    <group position={position}>
      {/* Tower body */}
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[radius, radius * 1.1, height, 8]} />
        <meshStandardMaterial color="#3a3020" roughness={0.8} />
      </mesh>
      {/* Cone roof */}
      <mesh position={[0, height + radius * 0.6, 0]}>
        <coneGeometry args={[radius * 1.3, radius * 1.5, 8]} />
        <meshStandardMaterial color="#2a1a0a" roughness={0.7} />
      </mesh>
      {/* Window glow */}
      <mesh position={[0, height * 0.7, radius + 0.01]}>
        <planeGeometry args={[radius * 0.3, radius * 0.5]} />
        <meshStandardMaterial
          color="#ffcc44"
          emissive="#ffcc44"
          emissiveIntensity={2}
          toneMapped={false}
        />
      </mesh>
      <pointLight
        position={[0, height * 0.7, radius + 0.1]}
        color="#ffcc44"
        intensity={0.2}
        distance={2}
      />
    </group>
  );
}

// ============================================================
// Fantasy castle complex
// ============================================================
function Castle({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={[scale, scale, scale]}>
      {/* Main keep */}
      <mesh position={[0, 1.5, 0]}>
        <boxGeometry args={[1.5, 3, 1.2]} />
        <meshStandardMaterial color="#3a3020" roughness={0.8} />
      </mesh>
      {/* Keep roof spires */}
      <mesh position={[0, 3.5, 0]}>
        <coneGeometry args={[0.5, 2, 6]} />
        <meshStandardMaterial color="#2a1a0a" roughness={0.7} />
      </mesh>
      {/* Corner towers */}
      <CastleTower position={[-0.9, 0, -0.7]} height={3.5} radius={0.3} />
      <CastleTower position={[0.9, 0, -0.7]} height={4} radius={0.25} />
      <CastleTower position={[-0.9, 0, 0.7]} height={3.8} radius={0.28} />
      <CastleTower position={[0.9, 0, 0.7]} height={3.2} radius={0.3} />
      {/* Central tall spire */}
      <CastleTower position={[0, 3, 0]} height={3} radius={0.2} />
      {/* Walls */}
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[3, 1, 2.5]} />
        <meshStandardMaterial color="#3a3020" roughness={0.85} />
      </mesh>
      {/* Wall battlements */}
      {[-1.2, -0.6, 0, 0.6, 1.2].map((x, i) => (
        <mesh key={i} position={[x, 1.1, 1.25]}>
          <boxGeometry args={[0.2, 0.3, 0.1]} />
          <meshStandardMaterial color="#3a3020" roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

// ============================================================
// Stone bridge
// ============================================================
function Bridge({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Bridge deck */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[4, 0.15, 0.8]} />
        <meshStandardMaterial color="#5a4a30" roughness={0.85} />
      </mesh>
      {/* Arch */}
      <mesh position={[0, -0.5, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.7, 0.12, 8, 12, Math.PI]} />
        <meshStandardMaterial color="#5a4a30" roughness={0.85} />
      </mesh>
      {/* Railings */}
      {[-1.5, -0.75, 0, 0.75, 1.5].map((x, i) => (
        <mesh key={i} position={[x, 0.25, 0.35]}>
          <boxGeometry args={[0.06, 0.4, 0.06]} />
          <meshStandardMaterial color="#4a3a25" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

// ============================================================
// Flowing river with animated material
// ============================================================
function River() {
  const riverRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (riverRef.current) {
      const mat = riverRef.current.material as THREE.MeshStandardMaterial;
      // Shimmer effect via emissive oscillation
      mat.emissiveIntensity = 0.15 + Math.sin(state.clock.elapsedTime * 0.8) * 0.05;
    }
  });

  // Create a winding river path
  const riverShape = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-35, -0.5, 20),
      new THREE.Vector3(-22, -0.5, 16),
      new THREE.Vector3(-12, -0.45, 12),
      new THREE.Vector3(-8, -0.4, 8),
      new THREE.Vector3(-6, -0.45, 3),
      new THREE.Vector3(-8, -0.5, -5),
      new THREE.Vector3(-14, -0.5, -12),
      new THREE.Vector3(-22, -0.5, -18),
    ]);
    const tubeGeo = new THREE.TubeGeometry(curve, 40, 0.6, 4, false);
    return tubeGeo;
  }, []);

  return (
    <mesh ref={riverRef} geometry={riverShape}>
      <meshStandardMaterial
        color="#2266aa"
        emissive="#1155aa"
        emissiveIntensity={0.15}
        roughness={0.2}
        metalness={0.3}
        transparent
        opacity={0.75}
      />
    </mesh>
  );
}

// ============================================================
// Waterfall
// ============================================================
function Waterfall({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (ref.current) {
      (ref.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.3 + Math.sin(state.clock.elapsedTime * 3) * 0.1;
    }
  });

  return (
    <group position={position}>
      <mesh ref={ref}>
        <planeGeometry args={[0.4, 2]} />
        <meshStandardMaterial
          color="#88bbdd"
          emissive="#6699cc"
          emissiveIntensity={0.3}
          transparent
          opacity={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Mist at base */}
      <mesh position={[0, -1.2, 0]}>
        <sphereGeometry args={[0.5, 8, 8]} />
        <meshStandardMaterial
          color="#aaccee"
          transparent
          opacity={0.15}
        />
      </mesh>
    </group>
  );
}

// ============================================================
// Trees/forest cluster
// ============================================================
function TreeCluster({ position, count = 5 }: { position: [number, number, number]; count?: number }) {
  const trees = useMemo(() => {
    const arr = [];
    for (let i = 0; i < count; i++) {
      arr.push({
        x: (Math.random() - 0.5) * 3,
        z: (Math.random() - 0.5) * 3,
        height: 0.8 + Math.random() * 1.5,
        radius: 0.3 + Math.random() * 0.4,
      });
    }
    return arr;
  }, [count]);

  return (
    <group position={position}>
      {trees.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]}>
          {/* Trunk */}
          <mesh position={[0, t.height * 0.3, 0]}>
            <cylinderGeometry args={[0.04, 0.06, t.height * 0.5, 5]} />
            <meshStandardMaterial color="#4a3520" roughness={0.9} />
          </mesh>
          {/* Canopy */}
          <mesh position={[0, t.height * 0.6, 0]}>
            <coneGeometry args={[t.radius, t.height * 0.7, 6, 1]} />
            <meshStandardMaterial color="#1a4a1a" roughness={0.8} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ============================================================
// Clouds
// ============================================================
function Clouds() {
  const cloudsRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (cloudsRef.current) {
      cloudsRef.current.rotation.y = state.clock.elapsedTime * 0.003;
    }
  });

  const cloudData = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 30;
      arr.push({
        x: Math.cos(angle) * dist,
        y: 8 + Math.random() * 12,
        z: Math.sin(angle) * dist,
        scaleX: 2 + Math.random() * 5,
        scaleY: 0.5 + Math.random() * 1,
        scaleZ: 1.5 + Math.random() * 3,
        opacity: 0.15 + Math.random() * 0.3,
      });
    }
    return arr;
  }, []);

  return (
    <group ref={cloudsRef}>
      {cloudData.map((c, i) => (
        <mesh key={i} position={[c.x, c.y, c.z]} scale={[c.scaleX, c.scaleY, c.scaleZ]}>
          <sphereGeometry args={[1, 6, 6]} />
          <meshStandardMaterial
            color="#ffeecc"
            emissive="#ffddaa"
            emissiveIntensity={0.1}
            transparent
            opacity={c.opacity}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

// ============================================================
// Sun with god-rays effect
// ============================================================
function Sun() {
  const glowRef = useRef<THREE.Mesh>(null);
  const raysRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (glowRef.current) {
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.4 + Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
    }
    if (raysRef.current) {
      raysRef.current.rotation.z = state.clock.elapsedTime * 0.02;
    }
  });

  return (
    <group position={[0, 18, -35]}>
      {/* Sun core */}
      <mesh>
        <sphereGeometry args={[3, 32, 32]} />
        <meshBasicMaterial color="#fff8e0" />
      </mesh>
      {/* Inner glow */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[5, 16, 16]} />
        <meshBasicMaterial color="#ffdd88" transparent opacity={0.4} depthWrite={false} />
      </mesh>
      {/* Outer glow */}
      <mesh>
        <sphereGeometry args={[8, 16, 16]} />
        <meshBasicMaterial color="#ffcc66" transparent opacity={0.12} depthWrite={false} />
      </mesh>
      {/* God rays */}
      <mesh ref={raysRef}>
        <sphereGeometry args={[12, 16, 16]} />
        <meshBasicMaterial color="#ffddaa" transparent opacity={0.06} depthWrite={false} />
      </mesh>
      {/* Sunlight */}
      <pointLight color="#ffeecc" intensity={2} distance={80} />
    </group>
  );
}

// ============================================================
// Sky gradient dome
// ============================================================
function SkyDome() {
  const skyMat = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color('#4a7ab5') },
        midColor: { value: new THREE.Color('#d4a86a') },
        bottomColor: { value: new THREE.Color('#8b6530') },
        offset: { value: 10 },
        exponent: { value: 0.4 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          float t = max(pow(max(h, 0.0), exponent), 0.0);
          vec3 col;
          if (t > 0.5) {
            col = mix(midColor, topColor, (t - 0.5) * 2.0);
          } else {
            col = mix(bottomColor, midColor, t * 2.0);
          }
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
    });
  }, []);

  return (
    <mesh material={skyMat}>
      <sphereGeometry args={[60, 32, 32]} />
    </mesh>
  );
}

// ============================================================
// Ground terrain
// ============================================================
function Terrain() {
  const terrainGeo = useMemo(() => {
    const geo = new THREE.PlaneGeometry(100, 100, 60, 60);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      // Keep center flat for the table, raise edges for hills
      const dist = Math.sqrt(x * x + y * y);
      const flatRadius = 5;
      if (dist > flatRadius) {
        const hillFactor = (dist - flatRadius) * 0.03;
        const noise = Math.sin(x * 0.3) * Math.cos(y * 0.4) * 0.5
          + Math.sin(x * 0.15 + 1) * Math.cos(y * 0.2 + 2) * 1
          + Math.sin(x * 0.08) * Math.cos(y * 0.06) * 2;
        pos.setZ(i, noise * hillFactor);
      }
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  return (
    <mesh geometry={terrainGeo} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.7, 0]}>
      <meshStandardMaterial
        color="#2a4a1a"
        roughness={0.9}
        flatShading
      />
    </mesh>
  );
}

// ============================================================
// Full landscape composition
// ============================================================
export default function FantasyLandscape() {
  return (
    <group>
      {/* Sky dome */}
      <SkyDome />

      {/* Sun */}
      <Sun />

      {/* Clouds */}
      <Clouds />

      {/* Terrain */}
      <Terrain />

      {/* River winding through */}
      <River />

      {/* === MOUNTAIN RANGES === */}
      {/* Back range - tall, distant, snow-capped */}
      <Mountain position={[0, 2, -30]} scale={[6, 8, 6]} color="#4a5a6a" snowColor="#ddeeff" />
      <Mountain position={[-15, 1, -35]} scale={[8, 10, 7]} color="#3a4a55" snowColor="#ccdde8" />
      <Mountain position={[18, 1.5, -32]} scale={[7, 9, 6]} color="#4a5565" snowColor="#dde5ee" />
      <Mountain position={[-28, 0.5, -30]} scale={[5, 7, 5]} color="#556070" snowColor="#cce0f0" />
      <Mountain position={[30, 0, -28]} scale={[6, 6, 5]} color="#506070" snowColor="#dde8f0" />

      {/* Mid range - green/brown peaks */}
      <Mountain position={[-12, 0, -18]} scale={[4, 5, 4]} color="#3a5530" />
      <Mountain position={[14, 0, -20]} scale={[5, 6, 4]} color="#445530" />
      <Mountain position={[-25, 0, -15]} scale={[4, 4, 4]} color="#3a5535" />
      <Mountain position={[22, 0, -16]} scale={[3, 4, 3]} color="#4a5a35" />

      {/* Side mountains */}
      <Mountain position={[-30, 0, 0]} scale={[5, 6, 5]} color="#4a5a50" snowColor="#cce0e8" />
      <Mountain position={[32, 0, 5]} scale={[4, 5, 4]} color="#4a5545" />
      <Mountain position={[-35, 0, 10]} scale={[3, 4, 3]} color="#5a6555" />
      <Mountain position={[28, 0, -5]} scale={[4, 5, 4]} color="#555a4a" snowColor="#dde5e0" />

      {/* === CASTLES === */}
      {/* Main castle on the mountain - base at Y=0 relative, terrain at -0.7 with elevation */}
      <Castle position={[0, -0.5, -28]} scale={1.8} />
      {/* Distant castle */}
      <Castle position={[-20, -0.6, -22]} scale={0.8} />
      {/* Small tower/ruins */}
      <Castle position={[20, -0.6, -18]} scale={0.5} />

      {/* === BRIDGES === */}
      <Bridge position={[-8, -0.3, 10]} rotation={0.2} />
      <Bridge position={[-10, -0.3, -3]} rotation={-0.4} />

      {/* === WATERFALLS === */}
      <Waterfall position={[-10, 1, -16]} />
      <Waterfall position={[16, 0.5, -14]} />

      {/* === FORESTS === */}
      <TreeCluster position={[-14, -0.5, -6]} count={8} />
      <TreeCluster position={[10, -0.5, -10]} count={6} />
      <TreeCluster position={[-18, -0.3, 3]} count={10} />
      <TreeCluster position={[14, -0.3, 6]} count={7} />
      <TreeCluster position={[-10, -0.4, 14]} count={5} />
      <TreeCluster position={[8, -0.5, 12]} count={6} />
      <TreeCluster position={[-20, -0.3, -10]} count={12} />
      <TreeCluster position={[22, -0.3, -10]} count={9} />
      <TreeCluster position={[6, -0.4, 14]} count={8} />
    </group>
  );
}
