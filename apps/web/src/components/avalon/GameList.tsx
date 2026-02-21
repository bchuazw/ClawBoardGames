"use client";
import { useEffect, useState } from 'react';
import { getAvalonBackendUrl } from '@/lib/avalon-api';

interface Game {
  gameId: string;
  phase: string;
  playerCount: number;
  successfulQuests: number;
  failedQuests: number;
  winner: string | null;
}

interface GameListProps {
  onSelectGame: (gameId: string) => void;
}

// Same logic as avalon_onchain/frontend — backend URL from env
export default function GameList({ onSelectGame }: GameListProps) {
  const BACKEND_URL = getAvalonBackendUrl();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGames();
    
    // Poll every 3 seconds (matches backend scan interval)
    const interval = setInterval(fetchGames, 3000);
    
    // Connect to WebSocket for real-time game list updates
    const wsUrl = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws';
    const websocket = new WebSocket(wsUrl);
    
    websocket.onopen = () => {
      console.log('[GameList] WebSocket connected');
    };
    
    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'newGame') {
        console.log('[GameList] New game received via WebSocket:', data.data.gameId);
        // Add new game to list immediately
        setGames((prevGames) => {
          // Check if game already exists
          const exists = prevGames.some(g => g.gameId === data.data.gameId);
          if (exists) return prevGames;
          
          // Add new game
          const newGame: Game = {
            gameId: data.data.gameId,
            phase: data.data.phase,
            playerCount: data.data.playerCount,
            successfulQuests: data.data.successfulQuests,
            failedQuests: data.data.failedQuests,
            winner: data.data.winner,
          };
          return [...prevGames, newGame];
        });
      } else if (data.type === 'stateUpdate') {
        // Update existing game when state changes
        setGames((prevGames) => {
          return prevGames.map(game => {
            if (game.gameId === data.data.gameId) {
              return {
                ...game,
                phase: data.data.phase,
                playerCount: data.data.playerCount,
                successfulQuests: data.data.successfulQuests,
                failedQuests: data.data.failedQuests,
                winner: data.data.winner,
              };
            }
            return game;
          });
        });
      }
    };
    
    websocket.onerror = (error) => {
      console.warn('[GameList] WebSocket error:', error);
    };
    
    websocket.onclose = () => {
      console.log('[GameList] WebSocket closed');
    };
    
    return () => {
      clearInterval(interval);
      websocket.close();
    };
  }, []);

  const fetchGames = async () => {
    try {
      console.log(`[GameList] Fetching games from ${BACKEND_URL}/games`);
      const response = await fetch(`${BACKEND_URL}/games`);
      console.log(`[GameList] Response status: ${response.status}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`[GameList] Received ${data.length} games:`, data);
      
      // Filter out games with invalid gameId
      const validGames = data.filter((game: Game) => game.gameId && game.gameId !== 'unknown');
      console.log(`[GameList] Valid games after filtering: ${validGames.length}`, validGames);
      
      setGames(validGames);
    } catch (error) {
      console.error('[GameList] Failed to fetch games:', error);
      console.error('[GameList] Error details:', error);
      // Don't use mock data - show empty state instead
      setGames([]);
    } finally {
      setLoading(false);
    }
  };

  const createGame = async () => {
    // This would integrate with the program
    console.log('Creating new game...');
    alert('Game creation feature coming soon!');
  };

  const getStatusClass = (phase: string) => {
    switch (phase) {
      case 'Lobby': return 'lobby';
      case 'Ended': return 'ended';
      default: return 'active';
    }
  };

  return (
    <div className="game-list">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2>ACTIVE GAMES</h2>
        <button 
          onClick={createGame}
          style={{
            padding: '14px 28px',
            background: 'linear-gradient(135deg, rgba(0, 255, 255, 0.2), rgba(182, 38, 255, 0.2))',
            border: '2px solid #00ffff',
            borderRadius: '12px',
            color: '#00ffff',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'Rajdhani, sans-serif',
            textTransform: 'uppercase',
            letterSpacing: '2px',
            fontSize: '1rem',
            boxShadow: '0 0 25px rgba(0, 255, 255, 0.4)',
            transition: 'all 0.3s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = '0 0 35px rgba(0, 255, 255, 0.6)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = '0 0 25px rgba(0, 255, 255, 0.4)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          + NEW GAME
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <div className="loading" style={{ margin: '0 auto', width: '40px', height: '40px', borderWidth: '4px' }}></div>
          <p style={{ marginTop: '1rem', color: 'rgba(255, 255, 255, 0.7)' }}>SCANNING NETWORK...</p>
        </div>
      ) : games.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem', filter: 'drop-shadow(0 0 20px rgba(0, 255, 255, 0.5))' }}>⚡</div>
          <h3 style={{ fontFamily: 'Orbitron, sans-serif', color: '#00ffff', fontSize: '1.5rem', marginBottom: '1rem' }}>NO ACTIVE GAMES</h3>
          <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '1.1rem' }}>Create a new game to begin</p>
        </div>
      ) : (
        <div className="games-grid">
          {games.map((game) => (
            <div 
              key={game.gameId} 
              className="game-card"
              onClick={() => onSelectGame(game.gameId)}
            >
              <div className="game-card-header">
                <h3>GAME #{game.gameId}</h3>
                <span className={`game-status ${getStatusClass(game.phase)}`}>
                  {game.phase.toUpperCase()}
                </span>
              </div>
              <div className="game-card-info">
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
