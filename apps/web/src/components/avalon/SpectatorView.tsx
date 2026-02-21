"use client";
import { useState, useEffect, useRef } from 'react';
import SpectatorScene3D from './three/SpectatorScene3D';
import { ChatMessage } from './three/SpeechBubble';
import { getAvalonBackendUrl } from '@/lib/avalon-api';

// Hook for responsive breakpoints
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  return isMobile;
}

interface SpectatorViewProps {
  gameId: string | null;
  onSelectGame: (gameId: string | null) => void;
}

interface Game {
  gameId: string;
  phase: string;
  playerCount: number;
  successfulQuests: number;
  failedQuests: number;
  winner: string | null;
}

// Same logic as avalon_onchain/frontend — backend URL from env
// Auto-generated dialogue removed - only real agent chat messages are shown
// Agents send chat via POST /chat/:gameId endpoint, which broadcasts via WebSocket

// ============================================================
// SpectatorView component
// ============================================================
export default function SpectatorView({ gameId, onSelectGame }: SpectatorViewProps) {
  const BACKEND_URL = getAvalonBackendUrl();
  const [gameState, setGameState] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const currentGameIdRef = useRef<string | null>(null);
  // Store chat messages per gameId so they persist when navigating away and back
  const chatMessagesByGameRef = useRef<Map<string, ChatMessage[]>>(new Map());
  const isMobile = useIsMobile();

  useEffect(() => {
    fetchGames();
    const interval = setInterval(fetchGames, 5000);
    return () => clearInterval(interval);
  }, []);

  // Load chat messages for the current game when gameId changes (persists across navigation)
  useEffect(() => {
    if (gameId !== currentGameIdRef.current) {
      // Save current game's messages before switching
      const previousGameId = currentGameIdRef.current;
      if (previousGameId) {
        // Get current messages from state before they're cleared
        setChatMessages((currentMessages) => {
          if (currentMessages.length > 0) {
            chatMessagesByGameRef.current.set(previousGameId, currentMessages);
          }
          // Load messages for the new game (or empty array if none exist)
          const savedMessages = gameId ? chatMessagesByGameRef.current.get(gameId) || [] : [];
          return savedMessages;
        });
      } else {
        // No previous game, just load messages for the new game
        const savedMessages = gameId ? chatMessagesByGameRef.current.get(gameId) || [] : [];
        setChatMessages(savedMessages);
      }
      currentGameIdRef.current = gameId;
    }
  }, [gameId]);

  useEffect(() => {
    if (gameId) {
      fetchGameState(gameId);
      connectWebSocket(gameId);
      
      // Poll for game state updates every 2 seconds (fallback if WebSocket fails)
      // This ensures spectators see updates even when WebSocket on port 8081 isn't accessible
      const pollInterval = setInterval(() => {
        fetchGameState(gameId, true); // silent=true to avoid loading spinner on each poll
      }, 2000);
      
      return () => {
        if (ws) {
          ws.close();
        }
        clearInterval(pollInterval);
      };
    }
  }, [gameId]);

  // Auto-generated dialogue disabled - only show real agent chat messages
  // Chat messages come from agents via POST /chat/:gameId endpoint and WebSocket

  const fetchGames = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/games`);
      const data = await response.json();
      setGames(data);
    } catch (error) {
      console.error('Failed to fetch games:', error);
    } finally {
      setGamesLoading(false);
    }
  };

  const fetchGameState = async (id: string, silent: boolean = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/game/${id}`);
      const data = await response.json();
      setGameState(data);
    } catch (error) {
      console.error('Failed to fetch game state:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const connectWebSocket = (id: string) => {
    // WebSocket is now served on the same port as HTTP via /ws path
    const wsUrl = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws';
    const websocket = new WebSocket(wsUrl);

    websocket.onopen = () => {
      websocket.send(JSON.stringify({ type: 'subscribe', gameId: id }));
    };

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'stateUpdate') {
        setGameState(data.data);
      } else if (data.type === 'chatMessage') {
        // Handle chat message from backend
        const chatMsg: ChatMessage = {
          id: data.data.id,
          playerIndex: data.data.playerIndex,
          role: data.data.role,
          text: data.data.text,
          timestamp: data.data.timestamp,
        };
        setChatMessages((prev) => {
          const updated = [...prev.slice(-20), chatMsg];
          // Persist messages for this game
          if (id) {
            chatMessagesByGameRef.current.set(id, updated);
          }
          return updated;
        });
      }
    };

    websocket.onerror = (error) => {
      console.warn('[WebSocket] Connection failed:', error);
      // Polling will handle updates if WebSocket fails
    };
    
    websocket.onclose = () => {
      console.log('[WebSocket] Connection closed');
    };

    setWs(websocket);
  };

  // ============================================================
  // Game selection screen (no game selected)
  // ============================================================
  if (!gameId) {
    return (
      <div className="spectator-view">
        <div style={{ textAlign: 'center', padding: 'clamp(1rem, 4vw, 2rem) 0' }}>
          <div style={{ fontSize: 'clamp(3rem, 10vw, 5rem)', marginBottom: '1.5rem', filter: 'drop-shadow(0 0 30px rgba(182, 38, 255, 0.5))' }}>
            👁️
          </div>
          <h2
            style={{
              fontFamily: 'Orbitron, sans-serif',
              fontSize: 'clamp(1.5rem, 5vw, 2.5rem)',
              color: '#b026ff',
              marginBottom: '1rem',
              textTransform: 'uppercase',
              letterSpacing: 'clamp(2px, 1vw, 4px)',
            }}
          >
            SPECTATOR MODE
          </h2>
          <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: 'clamp(1rem, 3vw, 1.2rem)', marginBottom: '0.5rem', padding: '0 1rem' }}>
            Select a game to view its complete state in 3D
          </p>
          <p style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: 'clamp(0.85rem, 2.5vw, 0.95rem)', marginBottom: '2rem', padding: '0 1rem' }}>
            <span style={{ color: '#b026ff' }}>GOD VIEW:</span> See all roles, conversations, and hidden information
          </p>
        </div>

        {gamesLoading ? (
          <div style={{ textAlign: 'center', padding: 'clamp(2rem, 6vw, 3rem)' }}>
            <div className="loading" style={{ margin: '0 auto', width: '40px', height: '40px', borderWidth: '4px' }} />
            <p style={{ marginTop: '1rem', color: 'rgba(255, 255, 255, 0.7)', fontSize: 'clamp(0.9rem, 3vw, 1rem)' }}>SCANNING NETWORK...</p>
          </div>
        ) : games.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'clamp(1.5rem, 4vw, 2rem)', color: 'rgba(255, 255, 255, 0.5)' }}>
            <p style={{ fontSize: 'clamp(1rem, 3vw, 1.1rem)' }}>No games found. Run a simulation to create a game.</p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
              gap: '1.5rem',
              padding: '0 clamp(1rem, 4vw, 2rem) clamp(1rem, 4vw, 2rem)',
            }}
          >
            {games.map((game) => (
              <div
                key={game.gameId}
                onClick={() => onSelectGame(game.gameId)}
                style={{
                  padding: 'clamp(1rem, 3vw, 1.5rem)',
                  background: 'rgba(182, 38, 255, 0.1)',
                  border: '2px solid rgba(182, 38, 255, 0.3)',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(182, 38, 255, 0.2)';
                  e.currentTarget.style.borderColor = 'rgba(182, 38, 255, 0.5)';
                  e.currentTarget.style.transform = 'translateY(-5px)';
                  e.currentTarget.style.boxShadow = '0 10px 30px rgba(182, 38, 255, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(182, 38, 255, 0.1)';
                  e.currentTarget.style.borderColor = 'rgba(182, 38, 255, 0.3)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h3 style={{ fontFamily: 'Orbitron, sans-serif', color: '#b026ff', fontSize: 'clamp(0.9rem, 2.5vw, 1.1rem)', margin: 0 }}>
                    GAME #{game.gameId}
                  </h3>
                  <span
                    style={{
                      padding: '0.3rem clamp(0.6rem, 2vw, 0.8rem)',
                      borderRadius: '20px',
                      fontSize: 'clamp(0.7rem, 2vw, 0.8rem)',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      background:
                        game.phase === 'Ended'
                          ? 'rgba(255, 0, 0, 0.2)'
                          : game.phase === 'Lobby'
                          ? 'rgba(0, 255, 0, 0.2)'
                          : 'rgba(182, 38, 255, 0.2)',
                      color: game.phase === 'Ended' ? '#ff0064' : game.phase === 'Lobby' ? '#00ff64' : '#b026ff',
                      border: `1px solid ${game.phase === 'Ended' ? '#ff0064' : game.phase === 'Lobby' ? '#00ff64' : '#b026ff'}`,
                    }}
                  >
                    {game.phase}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 'clamp(0.5rem, 2vw, 1rem)', fontSize: 'clamp(0.85rem, 2.5vw, 0.95rem)', color: 'rgba(255, 255, 255, 0.8)', flexWrap: 'wrap' }}>
                  <span>👥 {game.playerCount}/8</span>
                  <span style={{ color: '#00ff64' }}>✅ {game.successfulQuests}</span>
                  <span style={{ color: '#ff0064' }}>❌ {game.failedQuests}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ============================================================
  // Loading state
  // ============================================================
  if (loading) {
    return (
      <div className="spectator-view">
        <div style={{ textAlign: 'center', padding: 'clamp(2rem, 8vw, 4rem)' }}>
          <div className="loading" style={{ margin: '0 auto', width: 'clamp(40px, 10vw, 50px)', height: 'clamp(40px, 10vw, 50px)', borderWidth: '5px' }} />
          <p style={{ marginTop: '1.5rem', color: 'rgba(255, 255, 255, 0.7)', fontSize: 'clamp(0.95rem, 3vw, 1.1rem)' }}>LOADING GAME DATA...</p>
        </div>
      </div>
    );
  }

  // ============================================================
  // 3D Spectator View
  // ============================================================
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top bar */}
      <div
        style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'stretch' : 'center',
          gap: isMobile ? '0.75rem' : '0',
          padding: 'clamp(0.6rem, 2vw, 0.8rem) clamp(1rem, 3vw, 1.5rem)',
          background: 'rgba(5, 5, 16, 0.9)',
          borderBottom: '1px solid rgba(176, 38, 255, 0.3)',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(0.5rem, 2vw, 1rem)', flexWrap: 'wrap' }}>
          <button
            onClick={() => onSelectGame(null)}
            style={{
              padding: 'clamp(6px, 1.5vw, 8px) clamp(12px, 3vw, 16px)',
              background: 'rgba(182, 38, 255, 0.15)',
              border: '1px solid rgba(182, 38, 255, 0.4)',
              borderRadius: '8px',
              color: '#b026ff',
              cursor: 'pointer',
              fontFamily: 'Rajdhani, sans-serif',
              fontWeight: 600,
              fontSize: 'clamp(0.75rem, 2vw, 0.9rem)',
              textTransform: 'uppercase',
              letterSpacing: '1px',
            }}
          >
            ← BACK
          </button>
          <h2
            style={{
              margin: 0,
              fontFamily: 'Orbitron, sans-serif',
              fontSize: 'clamp(0.9rem, 3vw, 1.2rem)',
              color: '#b026ff',
              letterSpacing: 'clamp(1px, 0.5vw, 2px)',
            }}
          >
            GAME #{gameId}
          </h2>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 'clamp(0.75rem, 2vw, 1.5rem)',
            alignItems: 'center',
            fontFamily: 'Rajdhani, sans-serif',
            fontWeight: 600,
            fontSize: 'clamp(0.75rem, 2vw, 0.9rem)',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ 
            color: gameState?.phase === 'Ended' 
              ? (gameState?.winner?.toLowerCase().includes('good') ? '#00ff64' : '#ff0064')
              : '#00ffff'
          }}>
            {(() => {
              // Handle phase display - prioritize ended/winner states
              if (gameState?.phase === 'Ended' && gameState?.winner) {
                return `${gameState.winner.toUpperCase()} WINS!`;
              }
              if (gameState?.phase === 'Ended') {
                return 'GAME ENDED';
              }
              // Handle object phase format (fallback)
              if (typeof gameState?.phase === 'object' && gameState?.phase !== null) {
                const phaseKey = Object.keys(gameState.phase)[0];
                return phaseKey ? phaseKey.toUpperCase() : 'LOADING';
              }
              // Handle string phase format
              return (gameState?.phase || 'LOADING').toUpperCase();
            })()}
          </span>
          <span style={{ color: '#00ff64' }}>✅ {gameState?.successfulQuests || 0}</span>
          <span style={{ color: '#ff0064' }}>❌ {gameState?.failedQuests || 0}</span>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>👥 {gameState?.playerCount || 0}</span>
        </div>
      </div>

      {/* 3D Scene */}
      <div style={{ flex: 1, position: 'relative' }}>
        <SpectatorScene3D gameState={gameState} chatMessages={chatMessages} />

        {/* Chat log sidebar */}
        <div
          style={{
            position: 'absolute',
            right: isMobile ? '0.5rem' : '1rem',
            bottom: isMobile ? '0.5rem' : '1rem',
            left: isMobile ? '0.5rem' : 'auto',
            width: isMobile ? 'auto' : '280px',
            maxWidth: isMobile ? 'calc(100% - 1rem)' : '280px',
            maxHeight: isMobile ? '200px' : '300px',
            background: 'rgba(5, 5, 16, 0.95)',
            border: '1px solid rgba(0, 255, 255, 0.2)',
            borderRadius: '12px',
            padding: 'clamp(8px, 2vw, 12px)',
            overflowY: 'auto',
            backdropFilter: 'blur(10px)',
            boxShadow: isMobile ? '0 -4px 20px rgba(0, 0, 0, 0.5)' : 'none',
          }}
        >
          <div
            style={{
              fontFamily: 'Orbitron, monospace',
              fontSize: 'clamp(7px, 2vw, 9px)',
              color: '#00ffff',
              textTransform: 'uppercase',
              letterSpacing: 'clamp(2px, 0.5vw, 3px)',
              marginBottom: '8px',
              borderBottom: '1px solid rgba(0, 255, 255, 0.15)',
              paddingBottom: '6px',
            }}
          >
            Conversation Log
          </div>
          {chatMessages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255, 255, 255, 0.5)' }}>
              <p>No messages yet.</p>
              <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Waiting for agents to send chat...</p>
            </div>
          ) : (
            chatMessages.slice(-15).map((msg) => (
              <div
                key={msg.id}
                style={{
                  marginBottom: '6px',
                  padding: 'clamp(4px, 1.5vw, 6px) clamp(6px, 2vw, 8px)',
                  borderRadius: '6px',
                  background: 'rgba(255,255,255,0.03)',
                  borderLeft: `3px solid ${getMessageColor(msg.role)}`,
                }}
              >
                <div
                  style={{
                    fontFamily: 'Orbitron, monospace',
                    fontSize: 'clamp(7px, 2vw, 9px)',
                    color: getMessageColor(msg.role),
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                  }}
                >
                  {msg.role}
                </div>
                <div
                  style={{
                    fontFamily: 'Rajdhani, sans-serif',
                    fontSize: 'clamp(10px, 2.5vw, 12px)',
                    color: 'rgba(255,255,255,0.8)',
                    marginTop: '2px',
                    wordBreak: 'break-word',
                  }}
                >
                  {msg.text}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function getMessageColor(role: string): string {
  const colors: Record<string, string> = {
    Merlin: '#4488ff',
    Percival: '#88bbff',
    Servant: '#44cc66',
    Assassin: '#ff2244',
    Morgana: '#9922cc',
    Mordred: '#cc0000',
    Oberon: '#444466',
  };
  return colors[role] || '#888888';
}
