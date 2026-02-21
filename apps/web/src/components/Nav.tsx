'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/chess', label: 'Chess' },
  { href: '/avalon', label: 'Avalon' },
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const isCompact = variant === 'compact';

  const isMonopolyPath = pathname === '/monopoly' || pathname?.startsWith('/monopoly/');

  useEffect(() => setMobileOpen(false), [pathname]);

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
        <div className="nav-links" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Home */}
          <Link
            href="/"
            style={{
              ...linkStyle,
              color: pathname === '/' ? '#D4A84B' : 'var(--text-secondary)',
              fontWeight: pathname === '/' ? 600 : 500,
            }}
            className="nav-link"
          >
            Home
          </Link>
          {/* Monopoly — single link to /monopoly (sub-nav is in monopoly layout) */}
          <Link
            href="/monopoly"
            style={{
              ...linkStyle,
              color: isMonopolyPath ? '#D4A84B' : 'var(--text-secondary)',
              fontWeight: isMonopolyPath ? 600 : 500,
            }}
            className="nav-link"
          >
            Monopoly
          </Link>
          {/* Chess, Avalon, Terms */}
          {NAV_LINKS.filter((l) => l.href !== '/').map(({ href, label }) => {
            const isActive = pathname === href || pathname?.startsWith(href + '/');
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
        <button
          type="button"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMobileOpen((o) => !o)}
          className="nav-mobile-toggle"
          style={{
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 44,
            padding: 0,
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.06)',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 20,
          }}
        >
          {mobileOpen ? '\u2715' : '\u2630'}
        </button>
      </div>
      <div className={`nav-mobile-drawer ${mobileOpen ? 'nav-mobile-drawer-open' : ''}`}>
        <Link
          href="/"
          style={{
            display: 'block',
            padding: '14px 24px',
            fontSize: 16,
            fontWeight: pathname === '/' ? 600 : 500,
            color: pathname === '/' ? '#D4A84B' : 'var(--text-secondary)',
            textDecoration: 'none',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
          className="nav-link"
        >
          Home
        </Link>
        <Link
          href="/monopoly"
          style={{
            display: 'block',
            padding: '14px 24px',
            fontSize: 16,
            fontWeight: pathname === '/monopoly' || pathname?.startsWith('/monopoly/') ? 600 : 500,
            color: pathname === '/monopoly' || pathname?.startsWith('/monopoly/') ? '#D4A84B' : 'var(--text-secondary)',
            textDecoration: 'none',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
          className="nav-link"
        >
          Monopoly
        </Link>
        {NAV_LINKS.filter((l) => l.href !== '/').map(({ href, label }) => {
          const isActive = pathname === href || pathname?.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'block',
                padding: '14px 24px',
                fontSize: 16,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#D4A84B' : 'var(--text-secondary)',
                textDecoration: 'none',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}
              className="nav-link"
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
