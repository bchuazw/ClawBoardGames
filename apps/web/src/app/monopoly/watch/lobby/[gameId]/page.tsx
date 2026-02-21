import { Suspense } from 'react';
import WatchGameView from '@/app/watch/WatchGameView';

export default async function MonopolyWatchLobbyGamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  if (!gameId) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0C1B3A', color: '#D4A84B' }}>
        <div>Invalid game. <a href="/monopoly/watch" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, color: '#fff', textDecoration: 'none', padding: '10px 18px', borderRadius: 8, background: '#CC5500', border: '1px solid rgba(204,85,0,0.5)', marginLeft: 8 }}>← Back to lobbies</a></div>
      </div>
    );
  }
  return (
    <Suspense fallback={
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0C1B3A', color: '#D4A84B' }}>Loading...</div>
    }>
      <WatchGameView gameId={gameId} watchBase="/monopoly/watch" />
    </Suspense>
  );
}
