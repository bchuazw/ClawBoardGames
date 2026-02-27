'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useNetwork } from '@/context/NetworkContext';

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

interface HistoryEntry {
  gameId: number;
  winner: string;
  players: string[];
  status: number;
}

export default function HistoryPage() {
  const { config: networkConfig, network } = useNetwork();
  const [gmRestUrl, setGmRestUrl] = useState(networkConfig.gmRestUrl);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setGmRestUrl(networkConfig.gmRestUrl); }, [networkConfig.gmRestUrl]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const url = `${gmRestUrl}/games/history?chain=${network}`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { history?: HistoryEntry[] }) => {
        setHistory(Array.isArray(data.history) ? data.history : []);
      })
      .catch((e) => {
        setError(e?.message || 'Failed to load history');
        setHistory([]);
      })
      .finally(() => setLoading(false));
  }, [gmRestUrl, network]);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary, #0C1B3A)',
      color: '#fff',
      fontFamily: 'var(--font-display, "DM Sans", sans-serif)',
    }}>
      <main style={{ maxWidth: 900, margin: '0 auto', padding: 'clamp(16px, 4vw, 32px)', width: '100%', boxSizing: 'border-box' }}>
        <Link href="/monopoly" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, color: '#fff', textDecoration: 'none', marginBottom: 24, padding: '10px 18px', borderRadius: 8, background: '#CC5500', border: '1px solid rgba(204,85,0,0.5)' }}>
          <span style={{ fontSize: 18 }}>←</span> Back to Monopoly
        </Link>
        <h1 style={{
          fontSize: 'clamp(24px, 4vw, 32px)',
          fontWeight: 800,
          marginBottom: 8,
          background: 'linear-gradient(135deg, #fff 0%, #D4A84B 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          Game history
        </h1>
        <p style={{ color: 'var(--text-secondary, #94a3b8)', marginBottom: 24, fontSize: 15 }}>
          Settled games from the contract. Winner and players are on-chain.
        </p>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 8 }}>GM REST URL</label>
          <input
            type="text"
            value={gmRestUrl}
            onChange={(e) => setGmRestUrl(e.target.value)}
            placeholder={networkConfig.gmRestUrl}
            style={{
              width: '100%',
              maxWidth: 320,
              padding: '10px 12px',
              borderRadius: 8,
              fontSize: 12,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(212,168,75,0.2)',
              color: '#fff',
              fontFamily: 'var(--font-mono, monospace)',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
            <div style={{ display: 'inline-block', width: 32, height: 32, border: '3px solid rgba(212,168,75,0.3)', borderTopColor: '#D4A84B', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <div style={{ marginTop: 12 }}>Loading history...</div>
          </div>
        )}

        {error && !loading && (
          <div style={{ padding: 24, borderRadius: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>
            {error}
          </div>
        )}

        {!loading && !error && history.length === 0 && (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', borderRadius: 16, border: '1px dashed rgba(212,168,75,0.3)' }}>
            No settled games yet. Finish a game on-chain to see it here.
          </div>
        )}

        {!loading && !error && history.length > 0 && (
          <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid rgba(212,168,75,0.2)', background: 'rgba(12,27,58,0.6)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(212,168,75,0.25)' }}>
                  <th style={{ textAlign: 'left', padding: '14px 16px', color: '#D4A84B', fontWeight: 700 }}>Game ID</th>
                  <th style={{ textAlign: 'left', padding: '14px 16px', color: '#D4A84B', fontWeight: 700 }}>Winner</th>
                  <th style={{ textAlign: 'left', padding: '14px 16px', color: '#D4A84B', fontWeight: 700 }}>Players</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.gameId} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{row.gameId}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', color: '#86efac' }} title={row.winner}>
                      {truncateAddress(row.winner)}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                      {row.players.filter(Boolean).map((p) => truncateAddress(p)).join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
