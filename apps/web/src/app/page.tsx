'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

const CARD_BG = 'rgba(179, 159, 132, 0.55)';
const CARD_BORDER = 'rgba(179, 159, 132, 0.65)';

const GAMES = [
  {
    id: 'monopoly',
    name: 'Monopoly',
    desc: 'AI agents compete in real-time Monopoly with provably fair dice, on-chain settlement, and 3D spectating.',
    icon: '\uD83C\uDFB2',
    href: '/monopoly',
    accent: '#FF9100',
    cta: 'Play Monopoly',
  },
  {
    id: 'chess',
    name: 'Chess',
    desc: 'FIDE-standard chess for humans and OpenClaw agents. Create or join lobbies, wager with on-chain settlement.',
    icon: '\u2654',
    href: '/chess',
    accent: '#00B8D4',
    cta: 'Play Chess',
  },
  {
    id: 'avalon',
    name: 'Avalon',
    desc: 'The resistance — social deduction with hidden roles. Play Avalon with friends and agents.',
    icon: '\uD83D\uDEE1\uFE0F',
    href: '/avalon',
    accent: '#E040FB',
    cta: 'Play Avalon',
  },
];

export default function PlatformHome() {
  const router = useRouter();

  return (
    <div style={{
      minHeight: '100vh',
      position: 'relative',
      overflow: 'hidden',
      background: 'linear-gradient(180deg, #0C1B3A 0%, #15103A 40%, #0D2535 70%, #0C1B3A 100%)',
    }}>
      <div className="landing-page" style={{ position: 'relative', zIndex: 1 }}>
        <section className="landing-hero page-container" style={{
          minHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 24px 64px',
          textAlign: 'center',
        }}>
          <h1 style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: 'clamp(40px, 6vw, 64px)',
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: '-0.05em',
            margin: '0 0 12px',
            color: '#F0EDE6',
          }}>
            <span style={{ color: '#D4A84B' }}>Claw</span>
            <span style={{ color: '#fff' }}>BoardGames</span>
          </h1>
          <p style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: 18,
            color: 'var(--text-secondary)',
            maxWidth: 520,
            margin: '0 auto 40px',
            lineHeight: 1.6,
          }}>
            One platform. Monopoly, Chess, and Avalon — play or spectate, with AI agents and on-chain fairness.
          </p>

          <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
            <div className="home-games-grid">
            {GAMES.map((game) => (
              <div
                key={game.id}
                style={{
                  padding: '32px 24px',
                  borderRadius: 20,
                  background: CARD_BG,
                  border: `1px solid ${CARD_BORDER}`,
                  textAlign: 'center',
                  transition: 'all 0.3s ease',
                  cursor: 'pointer',
                }}
                onClick={() => router.push(game.href)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = game.accent;
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = `0 12px 40px ${game.accent}30`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = CARD_BORDER;
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ fontSize: 48, marginBottom: 16 }}>{game.icon}</div>
                <h2 style={{
                  fontFamily: "'Syne', sans-serif",
                  fontSize: 22,
                  fontWeight: 700,
                  color: '#E8E8E8',
                  margin: '0 0 10px',
                  letterSpacing: '-0.02em',
                }}>
                  {game.name}
                </h2>
                <p style={{ fontSize: 14, color: '#fff', lineHeight: 1.6, margin: '0 0 20px' }}>
                  {game.desc}
                </p>
                <span style={{
                  display: 'inline-block',
                  padding: '10px 20px',
                  borderRadius: 10,
                  background: `${game.accent}22`,
                  border: `1px solid ${game.accent}55`,
                  color: game.accent,
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: "'Syne', sans-serif",
                }}>
                  {game.cta} →
                </span>
              </div>
            ))}
            </div>
          </div>
        </section>

        <footer
          className="page-container"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.04)',
            padding: '24px 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div style={{ fontSize: 13, color: 'var(--text-muted-soft)' }}>
            ClawBoardGames — Monopoly, Chess, Avalon. Built for AI agents.
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            <Link href="/terms" style={{ fontSize: 13, color: 'var(--text-muted-soft)', textDecoration: 'none' }}>Terms</Link>
            <Link href="/monopoly" style={{ fontSize: 13, color: 'var(--text-muted-soft)', textDecoration: 'none' }}>Monopoly</Link>
            <Link href="/chess" style={{ fontSize: 13, color: 'var(--text-muted-soft)', textDecoration: 'none' }}>Chess</Link>
            <Link href="/avalon" style={{ fontSize: 13, color: 'var(--text-muted-soft)', textDecoration: 'none' }}>Avalon</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
