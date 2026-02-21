"use client";
import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

export interface ChatMessage {
  id: string;
  playerIndex: number;
  role: string;
  text: string;
  timestamp: number;
}

interface SpeechBubbleProps {
  message: string;
  role: string;
  color: string;
  visible: boolean;
  position?: [number, number, number];
}

export function SpeechBubble({ message, role, color, visible, position = [0, 1.6, 0] }: SpeechBubbleProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [opacity, setOpacity] = useState(0);

  useFrame((_, delta) => {
    if (visible && opacity < 1) {
      setOpacity(Math.min(1, opacity + delta * 3));
    } else if (!visible && opacity > 0) {
      setOpacity(Math.max(0, opacity - delta * 3));
    }
    if (groupRef.current) {
      groupRef.current.scale.setScalar(opacity);
    }
  });

  if (opacity <= 0.01 && !visible) return null;

  return (
    <group ref={groupRef} position={position}>
      <Html
        center
        distanceFactor={4}
        style={{
          opacity,
          transition: 'opacity 0.3s',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            background: `linear-gradient(135deg, rgba(10,10,20,0.95), rgba(20,20,40,0.95))`,
            border: `2px solid ${color}`,
            borderRadius: '16px',
            padding: '10px 16px',
            maxWidth: '220px',
            minWidth: '80px',
            position: 'relative',
            boxShadow: `0 0 20px ${color}40, 0 4px 15px rgba(0,0,0,0.5)`,
            backdropFilter: 'blur(10px)',
          }}
        >
          {/* Role label */}
          <div
            style={{
              fontSize: '10px',
              fontFamily: 'Orbitron, monospace',
              color,
              textTransform: 'uppercase',
              letterSpacing: '2px',
              marginBottom: '4px',
              fontWeight: 700,
            }}
          >
            {role}
          </div>
          {/* Message text */}
          <div
            style={{
              fontSize: '13px',
              fontFamily: 'Rajdhani, sans-serif',
              color: '#e0e0e0',
              lineHeight: 1.4,
              fontWeight: 500,
            }}
          >
            {message}
          </div>
          {/* Bubble tail */}
          <div
            style={{
              position: 'absolute',
              bottom: '-10px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '10px solid transparent',
              borderRight: '10px solid transparent',
              borderTop: `10px solid ${color}`,
            }}
          />
        </div>
      </Html>
    </group>
  );
}

// ============================================================
// Typing indicator (three dots animation)
// ============================================================
export function TypingIndicator({ color, visible, position = [0, 1.6, 0] }: { color: string; visible: boolean; position?: [number, number, number] }) {
  const [opacity, setOpacity] = useState(0);
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (visible && opacity < 1) {
      setOpacity(Math.min(1, opacity + delta * 3));
    } else if (!visible && opacity > 0) {
      setOpacity(Math.max(0, opacity - delta * 3));
    }
  });

  if (opacity <= 0.01 && !visible) return null;

  return (
    <group ref={groupRef} position={position}>
      <Html center distanceFactor={4} style={{ opacity, pointerEvents: 'none' }}>
        <div
          style={{
            background: 'rgba(10,10,20,0.9)',
            border: `2px solid ${color}`,
            borderRadius: '20px',
            padding: '8px 16px',
            display: 'flex',
            gap: '5px',
            boxShadow: `0 0 15px ${color}40`,
          }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: color,
                animation: `typingBounce 1.4s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
        <style>{`
          @keyframes typingBounce {
            0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
            30% { transform: translateY(-6px); opacity: 1; }
          }
        `}</style>
      </Html>
    </group>
  );
}
