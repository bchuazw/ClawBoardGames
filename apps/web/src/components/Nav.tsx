'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useNetwork, Network } from '@/context/NetworkContext';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/chess', label: 'Chess' },
  { href: '/avalon', label: 'Avalon' },
  { href: '/terms', label: 'Terms' },
] as const;

const NETWORK_OPTIONS: { value: Network; label: string; color: string }[] = [
  { value: 'evm', label: 'Monad', color: '#9945FF' },
  { value: 'bnb', label: 'BNB', color: '#F0B90B' },
  { value: 'solana', label: 'Solana', color: '#00D4AA' },
];

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
  const { network, setNetwork } = useNetwork();
  const isCompact = variant === 'compact';
  const currentNetworkOption = NETWORK_OPTIONS.find(o => o.value === network) || NETWORK_OPTIONS[0];

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
            <span style={{ color: 'var(--accent-gold)' }}>Claw</span>
            <span style={{ color: '#fff' }}>BoardGames</span>
          </span>
        </Link>
        <div className="nav-links" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/"
            style={{
              ...linkStyle,
              color: pathname === '/' ? 'var(--accent-gold)' : 'var(--text-secondary)',
              fontWeight: pathname === '/' ? 600 : 500,
            }}
            className="nav-link"
          >
            Home
          </Link>
          <Link
            href="/monopoly"
            style={{
              ...linkStyle,
              color: isMonopolyPath ? 'var(--accent-gold)' : 'var(--text-secondary)',
              fontWeight: isMonopolyPath ? 600 : 500,
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
                  ...linkStyle,
                  color: isActive ? 'var(--accent-gold)' : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 500,
                }}
                className="nav-link"
              >
                {label}
            </Link>
          );
        })}
          <div style={{ position: 'relative', marginLeft: 8 }}>
            <select
              value={network}
              onChange={(e) => setNetwork(e.target.value as Network)}
              style={{
                appearance: 'none',
                background: `rgba(${currentNetworkOption.color === '#9945FF' ? '153,69,255' : '240,185,11'},0.12)`,
                border: `1px solid ${currentNetworkOption.color}55`,
                color: currentNetworkOption.color,
                borderRadius: 8,
                padding: '6px 28px 6px 10px',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                outline: 'none',
                letterSpacing: '0.04em',
              }}
            >
              {NETWORK_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <span style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
              fontSize: 10,
              color: currentNetworkOption.color,
            }}>▼</span>
          </div>
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
            color: pathname === '/' ? 'var(--accent-gold)' : 'var(--text-secondary)',
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
            fontWeight: isMonopolyPath ? 600 : 500,
            color: isMonopolyPath ? 'var(--accent-gold)' : 'var(--text-secondary)',
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
                color: isActive ? 'var(--accent-gold)' : 'var(--text-secondary)',
                textDecoration: 'none',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}
              className="nav-link"
            >
              {label}
            </Link>
          );
        })}
        <div style={{ padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <select
            value={network}
            onChange={(e) => setNetwork(e.target.value as Network)}
            style={{
              appearance: 'none',
              background: `rgba(${currentNetworkOption.color === '#9945FF' ? '153,69,255' : '240,185,11'},0.12)`,
              border: `1px solid ${currentNetworkOption.color}55`,
              color: currentNetworkOption.color,
              borderRadius: 8,
              padding: '8px 28px 8px 12px',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
              outline: 'none',
              width: '100%',
            }}
          >
            {NETWORK_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>
    </nav>
  );
}
