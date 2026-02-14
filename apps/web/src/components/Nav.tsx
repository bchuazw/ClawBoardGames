'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/watch', label: 'Spectate' },
  { href: '/agents', label: 'For Agents' },
  { href: '/terms', label: 'Terms' },
] as const;

const linkStyle = {
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  textDecoration: 'none',
  letterSpacing: '0.02em',
  transition: 'color 0.2s',
  padding: '8px 4px',
} as const;

export function Nav({ variant = 'default' }: { variant?: 'default' | 'compact' }) {
  const pathname = usePathname();
  const isCompact = variant === 'compact';

  return (
    <nav
      className="nav-full-bleed"
      style={{
        width: '100vw',
        position: 'relative',
        left: '50%',
        marginLeft: '-50vw',
        background: 'rgba(12, 27, 58, 0.98)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div
        className="nav-inner"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: isCompact ? 12 : 20,
          paddingBottom: isCompact ? 12 : 20,
        }}
      >
      <Link
        href="/"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          textDecoration: 'none',
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 7,
            position: 'relative',
            background: 'linear-gradient(135deg, #D4A84B, #FF9100)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 12px rgba(212,168,75,0.35)',
            transform: 'rotate(-8deg)',
          }}
        >
          {[[-5, -5], [5, 5], [5, -5], [-5, 5]].map(([x, y], i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: '#0C1B3A',
                left: `calc(50% + ${x}px - 2px)`,
                top: `calc(50% + ${y}px - 2px)`,
              }}
            />
          ))}
        </div>
        <span
          style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: isCompact ? 18 : 20,
            fontWeight: 700,
            letterSpacing: '-0.02em',
          }}
        >
          <span style={{ color: '#D4A84B' }}>Claw</span>
          <span style={{ color: '#fff' }}>Board</span>
        </span>
      </Link>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {NAV_LINKS.map(({ href, label }) => {
          const isActive = pathname === href || (href === '/' && pathname === '/');
          return (
            <Link
              key={href}
              href={href}
              style={{
                ...linkStyle,
                color: isActive ? '#D4A84B' : 'var(--text-secondary)',
                fontWeight: isActive ? 600 : 500,
              }}
              className="nav-link"
            >
              {label}
            </Link>
          );
        })}
      </div>
      </div>
    </nav>
  );
}
