'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SUB_LINKS = [
  { href: '/monopoly/watch', label: 'Spectate' },
  { href: '/monopoly/agents', label: 'For Agents' },
  { href: '/monopoly/history', label: 'History' },
] as const;

export default function MonopolyLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
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
                color: '#D4A84B',
                textDecoration: 'none',
                padding: '8px 14px',
                borderRadius: 8,
                background: 'rgba(212,168,75,0.12)',
                border: '1px solid rgba(212,168,75,0.3)',
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
                  color: isActive ? '#D4A84B' : 'var(--text-secondary)',
                  textDecoration: 'none',
                  padding: '4px 0',
                }}
              >
                {label}
              </Link>
            );
          })}
        </div>
      )}
      {children}
    </>
  );
}
