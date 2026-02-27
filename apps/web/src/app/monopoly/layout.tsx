'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useNetwork } from '@/context/NetworkContext';

const SUB_LINKS = [
  { href: '/monopoly/watch', label: 'Spectate' },
  { href: '/monopoly/agents', label: 'For Agents' },
  { href: '/monopoly/history', label: 'History' },
] as const;

export default function MonopolyLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { config } = useNetwork();
  const isMonopolyRoot = pathname === '/monopoly' || pathname === '/monopoly/';
  const isUnderMonopoly = pathname?.startsWith('/monopoly');

  return (
    <>
      {isUnderMonopoly && (
        <div
          style={{
            width: '100vw',
            position: 'relative',
            left: '50%',
            marginLeft: '-50vw',
            padding: '12px 24px',
            background: 'rgba(0, 0, 0, 0.25)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            flexWrap: 'wrap',
          }}
        >
          {!isMonopolyRoot && (
            <Link
              href="/monopoly"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--accent-gold)',
                textDecoration: 'none',
                padding: '8px 14px',
                borderRadius: 8,
                background: 'var(--border)',
                border: '1px solid var(--border-bright)',
                marginRight: 8,
              }}
            >
              ← Back to Monopoly
            </Link>
          )}
          {SUB_LINKS.map(({ href, label }) => {
            const isActive = pathname === href || (pathname?.startsWith(href + '/'));
            return (
              <Link
                key={href}
                href={href}
                style={{
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? 'var(--accent-gold)' : 'var(--text-secondary)',
                  textDecoration: 'none',
                  padding: '4px 0',
                }}
              >
                {label}
              </Link>
            );
          })}
          {config.addressValue && (
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {config.addressLabel}: {config.addressValue.length > 16 ? config.addressValue.slice(0, 8) + '...' + config.addressValue.slice(-4) : config.addressValue}
            </span>
          )}
        </div>
      )}
      {children}
    </>
  );
}
