'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ChessAgentsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/chess/agents/monad');
  }, [router]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#8b949e' }}>Redirecting to Agents...</p>
    </div>
  );
}
