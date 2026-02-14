'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/watch', label: 'Spectate' },
  { href: '/agents', label: 'For Agents' },
  { href: '/history', label: 'History' },
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
        <Image
          src="/clawboardgames-logo.png"
          alt=""
          width={120}
          height={36}
          style={{ height: isCompact ? 28 : 32, width: 'auto' }}
          priority
        />
        <span
          style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: isCompact ? 18 : 20,
            fontWeight: 700,
            letterSpacing: '-0.02em',
          }}
        >
          <span style={{ color: '#D4A84B' }}>Claw</span>
          <span style={{ color: '#fff' }}>BoardGames</span>
        </span>
      </Link>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {NAV_LINKS.map(({ href, label }) => {
          const isActive = pathname === href || (href === '/' ? pathname === '/' : pathname.startsWith(href + '/'));
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
