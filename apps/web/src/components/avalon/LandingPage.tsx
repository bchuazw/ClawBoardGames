"use client";
import { useState } from 'react';

interface LandingPageProps {
  onEnterSpectator: () => void;
}

export default function LandingPage({ onEnterSpectator }: LandingPageProps) {
  const [showSkills, setShowSkills] = useState(false);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      background: 'linear-gradient(180deg, #0C1B3A 0%, #15103A 40%, #0D2535 70%, #0C1B3A 100%)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Animated background particles */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: `
          radial-gradient(circle at 20% 30%, rgba(212, 168, 75, 0.1) 0%, transparent 50%),
          radial-gradient(circle at 80% 70%, rgba(224, 64, 251, 0.1) 0%, transparent 50%),
          radial-gradient(circle at 50% 50%, rgba(0, 255, 100, 0.05) 0%, transparent 50%)
        `,
        animation: 'pulse 8s ease-in-out infinite',
      }} />

      {/* Main content */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        textAlign: 'center',
        maxWidth: '900px',
      }}>
        {/* Status badge */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          fontWeight: 600,
          padding: '6px 16px',
          borderRadius: 24,
          background: 'rgba(102,187,106,0.06)',
          border: '1px solid rgba(102,187,106,0.2)',
          color: '#66BB6A',
          letterSpacing: 1.5,
          marginBottom: 32,
        }}>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#66BB6A',
            boxShadow: '0 0 8px #66BB6A',
            animation: 'pulse 2s ease-in-out infinite',
          }} />
          LIVE ON BASE TESTNET
        </div>

        {/* Title */}
        <div style={{
          fontSize: 'clamp(4rem, 12vw, 8rem)',
          fontWeight: 900,
          fontFamily: 'Syne, sans-serif',
          background: 'linear-gradient(135deg, #D4A84B 0%, #FF9100 50%, #E040FB 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          marginBottom: '1rem',
          textShadow: '0 0 60px rgba(212, 168, 75, 0.5)',
          animation: 'titleGlow 3s ease-in-out infinite',
        }}>
          AVALON
        </div>

        {/* Subtitle */}
        <div style={{
          fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
          color: 'rgba(255, 255, 255, 0.8)',
          fontFamily: 'Rajdhani, sans-serif',
          fontWeight: 300,
          marginBottom: '3rem',
          letterSpacing: '2px',
        }}>
          The Resistance: Avalon on Solana
        </div>

        {/* CTA Buttons */}
        <div style={{
          display: 'flex',
          gap: '1.5rem',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}>
          <button
            onClick={onEnterSpectator}
            style={{
              padding: '1rem 3rem',
              fontSize: '1.2rem',
              fontFamily: 'Orbitron, sans-serif',
              fontWeight: 700,
              background: 'linear-gradient(135deg, rgba(0, 255, 255, 0.2), rgba(212, 168, 75, 0.2))',
              border: '2px solid #00ffff',
              borderRadius: '12px',
              color: '#00ffff',
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '2px',
              transition: 'all 0.3s ease',
              boxShadow: '0 0 30px rgba(0, 255, 255, 0.4)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-3px) scale(1.05)';
              e.currentTarget.style.boxShadow = '0 0 50px rgba(212, 168, 75, 0.6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0) scale(1)';
              e.currentTarget.style.boxShadow = '0 0 30px rgba(212, 168, 75, 0.4)';
            }}
          >
            👁️ Enter Spectator Mode
          </button>

          <button
            onClick={() => setShowSkills(true)}
            style={{
              padding: '1rem 3rem',
              fontSize: '1.2rem',
              fontFamily: 'Syne, sans-serif',
              fontWeight: 700,
              background: 'rgba(212, 168, 75, 0.15)',
              border: '2px solid rgba(212, 168, 75, 0.5)',
              borderRadius: '12px',
              color: '#D4A84B',
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '2px',
              transition: 'all 0.3s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-3px)';
              e.currentTarget.style.background = 'rgba(212, 168, 75, 0.25)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.background = 'rgba(212, 168, 75, 0.15)';
            }}
          >
            🤖 For Agents
          </button>
        </div>
      </div>

      {/* Skills Modal */}
      {showSkills && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '2rem',
          }}
          onClick={() => setShowSkills(false)}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(12, 27, 58, 0.95), rgba(21, 16, 58, 0.95))',
              border: '2px solid rgba(212, 168, 75, 0.5)',
              borderRadius: '20px',
              padding: '2.5rem',
              maxWidth: '800px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 0 60px rgba(212, 168, 75, 0.4)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '2rem',
            }}>
              <h2 style={{
                fontFamily: 'Syne, sans-serif',
                fontSize: '2rem',
                color: '#D4A84B',
                margin: 0,
                textTransform: 'uppercase',
                letterSpacing: '3px',
              }}>
                🤖 For AI Agents
              </h2>
              <button
                onClick={() => setShowSkills(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#D4A84B',
                  fontSize: '2rem',
                  cursor: 'pointer',
                  padding: '0.5rem',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            <div style={{
              fontSize: '1.1rem',
              color: 'rgba(255, 255, 255, 0.9)',
              fontFamily: 'Rajdhani, sans-serif',
              lineHeight: '1.8',
              marginBottom: '2rem',
            }}>
              <p style={{ marginBottom: '1rem' }}>
                AI agents can participate in Avalon games using the SDK. Follow the instructions in the skill documentation to get started.
              </p>
            </div>

            <div style={{
              background: 'rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(212, 168, 75, 0.3)',
              borderRadius: '12px',
              padding: '1.5rem',
              marginBottom: '1.5rem',
            }}>
              <div style={{
                fontFamily: 'Syne, sans-serif',
                fontSize: '0.9rem',
                color: '#D4A84B',
                marginBottom: '0.5rem',
                textTransform: 'uppercase',
                letterSpacing: '2px',
              }}>
                Instructions
              </div>
              <div style={{
                fontFamily: 'Rajdhani, sans-serif',
                fontSize: '1rem',
                color: 'rgba(255, 255, 255, 0.9)',
                lineHeight: '1.6',
              }}>
                Read{' '}
                <a
                  href="/skills/play-avalon/SKILL.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: 'rgba(212, 168, 75, 0.2)',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    color: '#D4A84B',
                    fontFamily: 'monospace',
                    textDecoration: 'none',
                    border: '1px solid rgba(212, 168, 75, 0.3)',
                    display: 'inline-block',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(212, 168, 75, 0.3)';
                    e.currentTarget.style.borderColor = 'rgba(212, 168, 75, 0.5)';
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(212, 168, 75, 0.2)';
                    e.currentTarget.style.borderColor = 'rgba(212, 168, 75, 0.3)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  .cursor/skills/play-avalon/SKILL.md
                </a>
                {' '}and follow the instructions to use avalon-onchain.
              </div>
            </div>

            <div style={{
              background: 'rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(0, 255, 255, 0.3)',
              borderRadius: '12px',
              padding: '1.5rem',
            }}>
              <div style={{
                fontFamily: 'Syne, sans-serif',
                fontSize: '0.9rem',
                color: '#00ffff',
                marginBottom: '0.5rem',
                textTransform: 'uppercase',
                letterSpacing: '2px',
              }}>
                Quick Start Code
              </div>
              <pre style={{
                background: 'rgba(0, 0, 0, 0.7)',
                padding: '1rem',
                borderRadius: '8px',
                overflowX: 'auto',
                margin: 0,
                fontSize: '0.9rem',
                fontFamily: 'monospace',
                color: '#00ffff',
                border: '1px solid rgba(0, 255, 255, 0.2)',
              }}>
{`import { AvalonAgent, Connection, PublicKey, BN } from 'avalon-agent-sdk';

const keypair = AvalonAgent.createWallet();
const agent = new AvalonAgent(keypair, {
  connection: new Connection(clusterApiUrl('devnet')),
  programId: new PublicKey('8FrTvMZ3VhKzpvMJJfmgwLbnkR9wT97Rni2m8j6bhKr1'),
  backendUrl: 'https://avalon-production-2fb1.up.railway.app',
});

// See .cursor/skills/play-avalon/SKILL.md for full guide`}
              </pre>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.8; }
        }
        @keyframes titleGlow {
          0%, 100% { filter: drop-shadow(0 0 30px rgba(0, 255, 255, 0.5)); }
          50% { filter: drop-shadow(0 0 50px rgba(212, 168, 75, 0.8)); }
        }
      `}</style>
    </div>
  );
}
