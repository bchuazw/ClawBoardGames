"use client";
import GameList from './GameList';

interface GameSceneProps {
  gameId?: string | null;
  onSelectGame: (gameId: string) => void;
}

export default function GameScene({ gameId, onSelectGame }: GameSceneProps) {
  if (gameId) {
    return (
      <div style={{ padding: '3rem', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ 
          background: 'rgba(15, 15, 25, 0.8)',
          backdropFilter: 'blur(10px)',
          borderRadius: '20px',
          padding: '3rem',
          border: '2px solid rgba(0, 255, 255, 0.3)',
          boxShadow: '0 0 40px rgba(0, 255, 255, 0.2)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <h2 style={{ 
              fontFamily: 'Orbitron, sans-serif',
              fontSize: '2rem',
              color: '#00ffff',
              textTransform: 'uppercase',
              letterSpacing: '3px',
              margin: 0
            }}>GAME #{gameId}</h2>
            <button onClick={() => onSelectGame('')} style={{
              padding: '10px 20px',
              background: 'rgba(255, 0, 100, 0.2)',
              border: '2px solid rgba(255, 0, 100, 0.5)',
              borderRadius: '10px',
              color: '#ff0064',
              cursor: 'pointer',
              fontFamily: 'Rajdhani, sans-serif',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}>
              ← BACK
            </button>
          </div>
          <div style={{ 
            textAlign: 'center',
            padding: '4rem 2rem',
            color: 'rgba(255, 255, 255, 0.7)'
          }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem', filter: 'drop-shadow(0 0 20px rgba(0, 255, 255, 0.5))' }}>⚙️</div>
            <h3 style={{ 
              fontFamily: 'Orbitron, sans-serif',
              color: '#00ffff',
              fontSize: '1.5rem',
              marginBottom: '1rem'
            }}>GAME INTERFACE LOADING</h3>
            <p style={{ fontSize: '1.1rem' }}>Full game view coming soon...</p>
          </div>
        </div>
      </div>
    );
  }

  return <GameList onSelectGame={onSelectGame} />;
}
