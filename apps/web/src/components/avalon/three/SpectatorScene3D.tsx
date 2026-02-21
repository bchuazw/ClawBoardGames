"use client";
import { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Float, Html } from '@react-three/drei';
import * as THREE from 'three';
import { CharacterFigurine, ROLE_CONFIGS } from './CharacterFigurines';
import { SpeechBubble, TypingIndicator, ChatMessage } from './SpeechBubble';
import FantasyLandscape from './FantasyLandscape';

// ============================================================
// Type definitions
// ============================================================
interface PlayerInfo {
  pubkey: string;
  role: string;
  alignment: string;
  index: number;
}

interface GameStateData {
  gameId: string;
  phase: string;
  playerCount: number;
  players: PlayerInfo[] | string[];
  currentQuest: number;
  successfulQuests: number;
  failedQuests: number;
  leader: string;
  winner: string | null;
  // Optional: team selection and voting data (if available from backend)
  proposedTeam?: string[];
  votes?: Record<string, boolean>;
}

interface SpectatorScene3DProps {
  gameState: GameStateData | null;
  chatMessages: ChatMessage[];
}

// Default roles for 5-player game when roles are unknown
const DEFAULT_5P_ROLES = ['Merlin', 'Percival', 'Servant', 'Assassin', 'Morgana'];

// Helper functions for stage labels and colors
function getStageLabel(phase: string, currentQuest: number): string {
  if (phase === 'Lobby') return 'LOBBY';
  if (phase === 'RoleAssignment') return 'ROLE ASSIGNMENT';
  if (phase === 'TeamBuilding') return `QUEST ${currentQuest + 1} - TEAM BUILDING`;
  if (phase === 'Voting') return `QUEST ${currentQuest + 1} - VOTING`;
  if (phase === 'Quest') return `QUEST ${currentQuest + 1} - IN PROGRESS`;
  if (phase === 'Assassination') return 'ASSASSINATION PHASE';
  if (phase === 'Ended') return 'GAME ENDED';
  return phase.replace(/([A-Z])/g, ' $1').toUpperCase().trim();
}

function getStageColor(phase: string, winner: string | null): string {
  if (winner) return winner.toLowerCase().includes('good') ? '#00ff64' : '#ff0064';
  if (phase === 'Ended') return '#ff0064';
  if (phase === 'Assassination') return '#ff4444';
  if (phase === 'Voting') return '#ffaa00';
  if (phase === 'TeamBuilding') return '#00ffff';
  if (phase === 'Quest') return '#00ff64';
  if (phase === 'Lobby') return '#00ff64';
  return '#00ffff';
}

// ============================================================
// Round table with glowing runes
// ============================================================
function RoundTable() {
  const runeRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (runeRef.current) {
      (runeRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.3 + Math.sin(state.clock.elapsedTime * 1.5) * 0.15;
    }
  });

  return (
    <group position={[0, -0.05, 0]}>
      {/* Table top */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[2.2, 2.2, 0.08, 64]} />
        <meshStandardMaterial color="#1a0e2e" roughness={0.3} metalness={0.1} />
      </mesh>
      {/* Table edge ring */}
      <mesh position={[0, 0.04, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.2, 0.05, 8, 64]} />
        <meshStandardMaterial
          color="#b026ff"
          emissive="#b026ff"
          emissiveIntensity={0.5}
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>
      {/* Inner rune ring */}
      <mesh ref={runeRef} position={[0, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.4, 0.03, 6, 64]} />
        <meshStandardMaterial
          color="#00ffff"
          emissive="#00ffff"
          emissiveIntensity={0.3}
          transparent
          opacity={0.6}
        />
      </mesh>
      {/* Center emblem */}
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.5, 6]} />
        <meshStandardMaterial color="#0a0a1a" emissive="#b026ff" emissiveIntensity={0.15} />
      </mesh>
      {/* Center glow */}
      <pointLight position={[0, 0.2, 0]} color="#b026ff" intensity={0.5} distance={3} />
      {/* Table legs */}
      <mesh position={[0, -0.35, 0]}>
        <cylinderGeometry args={[0.6, 0.8, 0.6, 12]} />
        <meshStandardMaterial color="#0e0620" roughness={0.6} metalness={0.2} />
      </mesh>
    </group>
  );
}

// ============================================================
// Quest stones (track quest progress)
// ============================================================
function QuestStones({ successfulQuests, failedQuests }: { successfulQuests: number; failedQuests: number }) {
  const results: ('success' | 'fail' | 'pending')[] = [];
  let s = successfulQuests;
  let f = failedQuests;
  for (let i = 0; i < 5; i++) {
    if (s > 0) { results.push('success'); s--; }
    else if (f > 0) { results.push('fail'); f--; }
    else { results.push('pending'); }
  }

  return (
    <group position={[0, 0.12, 0]}>
      {results.map((result, i) => {
        const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(angle) * 0.8;
        const z = Math.sin(angle) * 0.8;
        const color = result === 'success' ? '#00ff64' : result === 'fail' ? '#ff0064' : '#333355';
        const emissive = result === 'success' ? '#00ff64' : result === 'fail' ? '#ff0064' : '#222244';
        const intensity = result === 'pending' ? 0.1 : 0.8;

        return (
          <group key={i} position={[x, 0, z]}>
            <mesh>
              <dodecahedronGeometry args={[0.12, 0]} />
              <meshStandardMaterial
                color={color}
                emissive={emissive}
                emissiveIntensity={intensity}
                roughness={0.3}
                metalness={0.5}
              />
            </mesh>
            {result !== 'pending' && (
              <pointLight color={color} intensity={0.15} distance={0.6} />
            )}
            {/* Quest label using Html (no external font needed) */}
            <Html position={[0, 0.22, 0]} center style={{ pointerEvents: 'none' }}>
              <div style={{
                fontFamily: 'Orbitron, monospace',
                fontSize: '9px',
                color,
                fontWeight: 700,
                textShadow: `0 0 6px ${color}`,
                userSelect: 'none',
              }}>
                Q{i + 1}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

// ============================================================
// Phase indicator hologram (using Html instead of Text)
// ============================================================
function PhaseIndicator({ phase, winner, currentQuest }: { phase: string; winner: string | null; currentQuest: number }) {
  // Build detailed phase text
  let phaseText = '';
  let phaseColor = '#00ffff';

  if (winner) {
    phaseText = `${winner.toUpperCase()} WINS!`;
    phaseColor = winner.toLowerCase().includes('good') ? '#00ff64' : '#ff0064';
  } else if (phase === 'Ended') {
    phaseText = 'GAME ENDED';
    phaseColor = '#ff0064';
  } else if (phase === 'Assassination') {
    phaseText = 'ASSASSINATION PHASE';
    phaseColor = '#ff4444';
  } else if (phase === 'Lobby') {
    phaseText = 'LOBBY';
    phaseColor = '#00ff64';
  } else if (phase === 'RoleAssignment') {
    phaseText = 'ROLE ASSIGNMENT';
    phaseColor = '#00ffff';
  } else if (phase === 'TeamBuilding') {
    phaseText = `QUEST ${currentQuest + 1} - TEAM BUILDING`;
    phaseColor = '#00ffff';
  } else if (phase === 'Voting') {
    phaseText = `QUEST ${currentQuest + 1} - VOTING`;
    phaseColor = '#ffaa00';
  } else if (phase === 'Quest') {
    phaseText = `QUEST ${currentQuest + 1} - IN PROGRESS`;
    phaseColor = '#00ff64';
  } else {
    phaseText = phase.replace(/([A-Z])/g, ' $1').toUpperCase().trim();
  }

  return (
    <group position={[0, 2.8, 0]}>
      {/* Phase text via Html */}
      <Html center distanceFactor={6} style={{ pointerEvents: 'none' }}>
        <div style={{
          fontFamily: 'Orbitron, monospace',
          fontSize: '20px',
          fontWeight: 900,
          color: phaseColor,
          textShadow: `0 0 20px ${phaseColor}, 0 0 40px ${phaseColor}80`,
          letterSpacing: '4px',
          whiteSpace: 'nowrap',
          userSelect: 'none',
          textAlign: 'center',
        }}>
          {phaseText}
        </div>
      </Html>
      <pointLight color={phaseColor} intensity={0.5} distance={3} />
    </group>
  );
}

// ============================================================
// Player seat with figurine + name plate + speech bubble
// ============================================================
function PlayerSeat({
  player,
  index,
  totalPlayers,
  isLeader,
  chatMessage,
  isTyping,
  isOnTeam,
  hasVoted,
  voteResult,
}: {
  player: PlayerInfo;
  index: number;
  totalPlayers: number;
  isLeader: boolean;
  chatMessage: ChatMessage | null;
  isTyping: boolean;
  isOnTeam?: boolean;
  hasVoted?: boolean;
  voteResult?: boolean | null;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const teamIndicatorRef = useRef<THREE.Mesh>(null);

  const angle = (index / totalPlayers) * Math.PI * 2 - Math.PI / 2;
  const radius = 2.8;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;

  const config = ROLE_CONFIGS[player.role] || ROLE_CONFIGS.Unknown;

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.8 + index) * 0.02;
      // Face center
      const target = new THREE.Vector3(0, groupRef.current.position.y, 0);
      groupRef.current.lookAt(target);
    }
    if (glowRef.current) {
      (glowRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.3 + Math.sin(state.clock.elapsedTime * 2 + index) * 0.15;
    }
    // Pulse team indicator
    if (teamIndicatorRef.current && isOnTeam) {
      (teamIndicatorRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        1.5 + Math.sin(state.clock.elapsedTime * 3) * 0.5;
    }
  });

  return (
    <group position={[x, 0, z]}>
      <group ref={groupRef}>
        {/* Base platform */}
        <mesh position={[0, -0.02, 0]}>
          <cylinderGeometry args={[0.35, 0.4, 0.04, 16]} />
          <meshStandardMaterial
            color={config.alignment === 'evil' ? '#1a0010' : '#001a10'}
            roughness={0.4}
            metalness={0.3}
          />
        </mesh>
        {/* Glow ring */}
        <mesh ref={glowRef} position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.37, 0.015, 8, 32]} />
          <meshStandardMaterial
            color={config.glow}
            emissive={config.glow}
            emissiveIntensity={0.3}
            toneMapped={false}
          />
        </mesh>

        {/* Team selection indicator - glowing ring around base */}
        {isOnTeam && (
          <mesh ref={teamIndicatorRef} position={[0, -0.01, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.42, 0.025, 8, 32]} />
            <meshStandardMaterial
              color="#00ffff"
              emissive="#00ffff"
              emissiveIntensity={1.5}
              toneMapped={false}
            />
          </mesh>
        )}

        {/* Vote indicator - checkmark or X above player */}
        {hasVoted !== undefined && (
          <Html position={[0, 1.9, 0]} center style={{ pointerEvents: 'none' }}>
            <div style={{
              fontSize: '24px',
              filter: voteResult === true ? 'drop-shadow(0 0 8px #00ff64)' : voteResult === false ? 'drop-shadow(0 0 8px #ff0064)' : 'none',
            }}>
              {voteResult === true ? '✓' : voteResult === false ? '✗' : '○'}
            </div>
          </Html>
        )}

        {/* Figurine */}
        <Float speed={1.5} rotationIntensity={0} floatIntensity={0.15} floatingRange={[0, 0.05]}>
          <CharacterFigurine role={player.role} />
        </Float>

        {/* Leader crown indicator */}
        {isLeader && (
          <Float speed={2} rotationIntensity={0.3} floatIntensity={0.2}>
            <mesh position={[0, 1.5, 0]}>
              <octahedronGeometry args={[0.08, 0]} />
              <meshStandardMaterial
                color="#ffcc00"
                emissive="#ffcc00"
                emissiveIntensity={2}
                toneMapped={false}
              />
            </mesh>
            <pointLight position={[0, 1.5, 0]} color="#ffcc00" intensity={0.3} distance={1} />
          </Float>
        )}

        {/* Name plate via Html */}
        <Html position={[0, -0.2, 0.5]} center style={{ pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center', userSelect: 'none' }}>
            <div style={{
              fontFamily: 'Orbitron, monospace',
              fontSize: '11px',
              fontWeight: 700,
              color: config.glow,
              textShadow: `0 0 8px ${config.glow}`,
              letterSpacing: '2px',
            }}>
              {player.role}
            </div>
            <div style={{
              fontFamily: 'Rajdhani, sans-serif',
              fontSize: '9px',
              fontWeight: 600,
              color: config.alignment === 'evil' ? '#ff6688' : '#88ffaa',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              marginTop: '2px',
            }}>
              {config.alignment === 'evil' ? 'EVIL' : 'GOOD'}
            </div>
          </div>
        </Html>

        {/* Alignment indicator glow */}
        <pointLight
          position={[0, 0.3, 0]}
          color={config.alignment === 'evil' ? '#ff0044' : '#00ff44'}
          intensity={0.15}
          distance={1.2}
        />

        {/* Speech Bubble */}
        <SpeechBubble
          message={chatMessage?.text || ''}
          role={player.role}
          color={config.glow}
          visible={!!chatMessage}
          position={[0, 1.7, 0]}
        />

        {/* Typing Indicator */}
        <TypingIndicator
          color={config.glow}
          visible={isTyping}
          position={[0, 1.6, 0]}
        />
      </group>
    </group>
  );
}

// ============================================================
// Ambient particles
// ============================================================
function AmbientParticles() {
  const particlesRef = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const arr = new Float32Array(200 * 3);
    for (let i = 0; i < 200; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 12;
      arr[i * 3 + 1] = Math.random() * 5;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 12;
    }
    return arr;
  }, []);

  useFrame((state) => {
    if (particlesRef.current) {
      particlesRef.current.rotation.y = state.clock.elapsedTime * 0.02;
      const pos = particlesRef.current.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        pos.setY(i, y > 5 ? 0 : y + 0.002);
      }
      pos.needsUpdate = true;
    }
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={200}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial size={0.04} color="#ffdd88" transparent opacity={0.5} sizeAttenuation />
    </points>
  );
}

// FloorGrid removed -- replaced by FantasyLandscape terrain

// ============================================================
// Team connection lines (visualize team selection)
// ============================================================
function TeamConnections({ players, teamMembers }: { players: PlayerInfo[]; teamMembers: Set<number> }) {
  if (teamMembers.size === 0) return null;

  const teamIndices = Array.from(teamMembers);
  const lines: Array<{ from: [number, number, number]; to: [number, number, number] }> = [];

  // Connect team members to center, then to each other
  const angle = (idx: number, total: number) => (idx / total) * Math.PI * 2 - Math.PI / 2;
  const radius = 2.8;

  for (let i = 0; i < teamIndices.length; i++) {
    const idx1 = teamIndices[i];
    const x1 = Math.cos(angle(idx1, players.length)) * radius;
    const z1 = Math.sin(angle(idx1, players.length)) * radius;
    
    // Line to center
    lines.push({ from: [x1, 0.3, z1], to: [0, 0.3, 0] });
    
    // Lines to other team members
    for (let j = i + 1; j < teamIndices.length; j++) {
      const idx2 = teamIndices[j];
      const x2 = Math.cos(angle(idx2, players.length)) * radius;
      const z2 = Math.sin(angle(idx2, players.length)) * radius;
      lines.push({ from: [x1, 0.3, z1], to: [x2, 0.3, z2] });
    }
  }

  return (
    <group>
      {lines.map((line, i) => (
        <line key={i}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={2}
              array={new Float32Array([...line.from, ...line.to])}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#00ffff" transparent opacity={0.4} linewidth={2} />
        </line>
      ))}
    </group>
  );
}

// ============================================================
// Main scene (no external fonts, no Suspense-blocking loads)
// ============================================================
function Scene({ gameState, chatMessages }: SpectatorScene3DProps) {
  const { camera } = useThree();

  // Set camera on mount
  useEffect(() => {
    camera.position.set(4, 3.5, 4);
    camera.lookAt(0, 0.5, 0);
  }, [camera]);

  const players = useMemo(() => {
    if (!gameState?.players || gameState.players.length === 0) return [];

    return gameState.players.map((p: any, idx: number) => {
      if (typeof p === 'string') {
        // Players are pubkey strings -- assign demo roles based on index
        const role = DEFAULT_5P_ROLES[idx % DEFAULT_5P_ROLES.length];
        const config = ROLE_CONFIGS[role] || ROLE_CONFIGS.Unknown;
        return { pubkey: p, role, alignment: config.alignment, index: idx };
      }
      return {
        pubkey: p.pubkey || `Player ${idx + 1}`,
        role: p.role || DEFAULT_5P_ROLES[idx % DEFAULT_5P_ROLES.length],
        alignment: p.alignment || ROLE_CONFIGS[p.role]?.alignment || 'unknown',
        index: idx,
      };
    });
  }, [gameState?.players]);

  const [activeMessages, setActiveMessages] = useState<Map<number, ChatMessage>>(new Map());
  const [typingPlayers, setTypingPlayers] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (chatMessages.length === 0) return;
    const latest = chatMessages[chatMessages.length - 1];

    setTypingPlayers((prev) => new Set(prev).add(latest.playerIndex));

    const typingTimeout = setTimeout(() => {
      setTypingPlayers((prev) => {
        const next = new Set(prev);
        next.delete(latest.playerIndex);
        return next;
      });
      setActiveMessages((prev) => {
        const next = new Map(prev);
        next.set(latest.playerIndex, latest);
        return next;
      });
    }, 800);

    const clearTimeout2 = setTimeout(() => {
      setActiveMessages((prev) => {
        const next = new Map(prev);
        if (next.get(latest.playerIndex)?.id === latest.id) {
          next.delete(latest.playerIndex);
        }
        return next;
      });
    }, 6000);

    return () => {
      clearTimeout(typingTimeout);
      clearTimeout(clearTimeout2);
    };
  }, [chatMessages]);

  return (
    <>
      {/* Lighting -- warm golden sunlight to match landscape */}
      <ambientLight intensity={0.5} color="#ffe8cc" />
      <directionalLight position={[0, 15, -30]} intensity={1.2} color="#ffddaa" castShadow />
      <directionalLight position={[-10, 10, 5]} intensity={0.3} color="#88aacc" />
      <pointLight position={[0, 4, 0]} intensity={0.6} color="#b026ff" distance={10} />
      <pointLight position={[0, 1, 0]} intensity={0.4} color="#00ffff" distance={6} />
      {/* Warm hemisphere matching sky */}
      <hemisphereLight args={['#88aabb', '#3a5530', 0.4]} />

      {/* Atmospheric fog -- warm golden */}
      <fog attach="fog" args={['#c8a870', 20, 60]} />

      {/* Fantasy landscape background */}
      <FantasyLandscape />

      {/* Stone platform under the table */}
      <mesh position={[0, -0.65, 0]}>
        <cylinderGeometry args={[4, 4.5, 0.15, 32]} />
        <meshStandardMaterial color="#5a5040" roughness={0.9} />
      </mesh>
      <mesh position={[0, -0.58, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[4.2, 0.06, 6, 32]} />
        <meshStandardMaterial color="#b026ff" emissive="#b026ff" emissiveIntensity={0.3} />
      </mesh>

      {/* Table */}
      <RoundTable />

      {/* Quest stones */}
      <QuestStones
        successfulQuests={gameState?.successfulQuests || 0}
        failedQuests={gameState?.failedQuests || 0}
      />

      {/* Phase indicator */}
      <PhaseIndicator 
        phase={gameState?.phase || 'Lobby'} 
        winner={gameState?.winner || null}
        currentQuest={gameState?.currentQuest || 0}
      />

      {/* Team connections - visualize selected team */}
      {(() => {
        const phase = gameState?.phase || 'Lobby';
        const isTeamPhase = phase === 'Voting' || phase === 'Quest';
        if (!isTeamPhase || !gameState?.proposedTeam || gameState.proposedTeam.length === 0) return null;
        
        // Map proposed team pubkeys to player indices
        const teamMembers = new Set<number>();
        players.forEach((p, idx) => {
          if (gameState.proposedTeam?.includes(p.pubkey)) {
            teamMembers.add(idx);
          }
        });
        
        return teamMembers.size > 0 ? <TeamConnections players={players} teamMembers={teamMembers} /> : null;
      })()}

      {/* Players */}
      {players.map((player, idx) => {
        // Determine if player is on proposed team
        const phase = gameState?.phase || 'Lobby';
        const isVotingPhase = phase === 'Voting' || phase === 'Quest';
        const isOnTeam = isVotingPhase && gameState?.proposedTeam?.includes(player.pubkey) || false;
        
        // Determine vote status from gameState.votes
        const hasVoted = phase === 'Voting' && gameState?.votes ? gameState.votes[player.pubkey] !== undefined : undefined;
        const voteResult = hasVoted !== undefined ? gameState?.votes?.[player.pubkey] : undefined;

        return (
          <PlayerSeat
            key={idx}
            player={player}
            index={idx}
            totalPlayers={players.length}
            isLeader={gameState?.leader === player.pubkey}
            chatMessage={activeMessages.get(idx) || null}
            isTyping={typingPlayers.has(idx)}
            isOnTeam={isOnTeam}
            hasVoted={hasVoted}
            voteResult={voteResult}
          />
        );
      })}

      {/* Ambient particles */}
      <AmbientParticles />

      {/* Camera controls */}
      <OrbitControls
        enablePan={false}
        minDistance={3}
        maxDistance={25}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2.2}
        autoRotate
        autoRotateSpeed={0.3}
        target={[0, 0.5, 0]}
      />
    </>
  );
}

// ============================================================
// Exported Canvas wrapper
// ============================================================
export default function SpectatorScene3D({ gameState, chatMessages }: SpectatorScene3DProps) {
  const [showStageBanner, setShowStageBanner] = useState(true);

  // Show banner when phase/quest changes
  useEffect(() => {
    if (gameState?.phase) {
      setShowStageBanner(true);
      const timer = setTimeout(() => setShowStageBanner(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [gameState?.phase, gameState?.currentQuest]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Canvas
        camera={{ position: [4, 3.5, 4], fov: 50, near: 0.1, far: 200 }}
        style={{ background: '#8b7040' }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
      >
        <Scene gameState={gameState} chatMessages={chatMessages} />
      </Canvas>

      {/* Stage Banner - Prominent display (fades out after 4 seconds) */}
      {gameState && showStageBanner && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(15, 10, 5, 0.92), rgba(30, 20, 10, 0.92))',
              border: '3px solid',
              borderColor: getStageColor(gameState.phase, gameState.winner),
              borderRadius: '20px',
              padding: '20px 40px',
              backdropFilter: 'blur(20px)',
              boxShadow: `0 0 40px ${getStageColor(gameState.phase, gameState.winner)}60`,
              textAlign: 'center',
              animation: 'stageBannerPulse 4s ease-in-out forwards',
            }}
          >
            <div style={{
              fontFamily: 'Orbitron, monospace',
              fontSize: '28px',
              fontWeight: 900,
              color: getStageColor(gameState.phase, gameState.winner),
              textShadow: `0 0 20px ${getStageColor(gameState.phase, gameState.winner)}`,
              letterSpacing: '6px',
              textTransform: 'uppercase',
              marginBottom: '8px',
            }}>
              {getStageLabel(gameState.phase, gameState.currentQuest || 0)}
            </div>
            {gameState.phase === 'TeamBuilding' && (
              <div style={{
                fontFamily: 'Rajdhani, sans-serif',
                fontSize: '14px',
                color: 'rgba(255,255,255,0.7)',
                marginTop: '8px',
              }}>
                Leader is selecting team members...
              </div>
            )}
            {gameState.phase === 'Voting' && (
              <div style={{
                fontFamily: 'Rajdhani, sans-serif',
                fontSize: '14px',
                color: 'rgba(255,255,255,0.7)',
                marginTop: '8px',
              }}>
                Players are voting on the proposed team...
              </div>
            )}
          </div>
          <style>{`
            @keyframes stageBannerPulse {
              0% { opacity: 0; transform: scale(0.9); }
              15% { opacity: 1; transform: scale(1); }
              85% { opacity: 1; transform: scale(1); }
              100% { opacity: 0; transform: scale(0.95); }
            }
          `}</style>
        </div>
      )}

      {/* HUD overlay */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          pointerEvents: 'none',
          padding: 'clamp(0.75rem, 2vw, 1rem) clamp(1rem, 3vw, 1.5rem)',
          display: 'flex',
          flexDirection: window.innerWidth <= 768 ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: window.innerWidth <= 768 ? '0.5rem' : '0',
        }}
      >
        <div
          style={{
            background: 'rgba(5, 5, 16, 0.8)',
            border: '1px solid rgba(176, 38, 255, 0.3)',
            borderRadius: '12px',
            padding: 'clamp(8px, 2vw, 12px) clamp(12px, 3vw, 20px)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div style={{
            fontFamily: 'Orbitron, monospace',
            fontSize: 'clamp(8px, 2vw, 10px)',
            color: '#b026ff',
            textTransform: 'uppercase',
            letterSpacing: 'clamp(2px, 0.5vw, 3px)',
            marginBottom: '4px',
          }}>
            Game #{gameState?.gameId || '---'}
          </div>
          <div style={{ display: 'flex', gap: 'clamp(8px, 2vw, 16px)', fontSize: 'clamp(11px, 2.5vw, 13px)', fontFamily: 'Rajdhani, sans-serif', fontWeight: 600, flexWrap: 'wrap' }}>
            {gameState?.phase !== 'Ended' && (
              <span style={{ color: '#00ffff' }}>Quest {(gameState?.currentQuest || 0) + 1}/5</span>
            )}
            {gameState?.phase === 'Ended' && gameState?.winner && (
              <span style={{ color: gameState.winner.toLowerCase().includes('good') ? '#00ff64' : '#ff0064' }}>
                {gameState.winner.toUpperCase()} WINS!
              </span>
            )}
            {gameState?.phase === 'Ended' && !gameState?.winner && (
              <span style={{ color: '#ff0064' }}>GAME ENDED</span>
            )}
            <span style={{ color: '#00ff64' }}>{gameState?.successfulQuests || 0} Won</span>
            <span style={{ color: '#ff0064' }}>{gameState?.failedQuests || 0} Lost</span>
          </div>
        </div>
        {window.innerWidth > 768 && (
          <div
            style={{
              background: 'rgba(5, 5, 16, 0.6)',
              border: '1px solid rgba(0, 255, 255, 0.15)',
              borderRadius: '8px',
              padding: 'clamp(6px, 1.5vw, 8px) clamp(10px, 2.5vw, 14px)',
              fontSize: 'clamp(9px, 2vw, 11px)',
              fontFamily: 'Rajdhani, sans-serif',
              color: 'rgba(255,255,255,0.4)',
            }}
          >
            Drag to orbit | Scroll to zoom
          </div>
        )}
      </div>
    </div>
  );
}
