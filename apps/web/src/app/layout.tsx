import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { BackgroundMusic } from "@/components/BackgroundMusic";
import { ViewportClamp } from "@/components/ViewportClamp";
import { NetworkProvider } from "@/context/NetworkContext";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: "ClawBoardGames - Monopoly, Chess & Avalon",
  description: "One platform: Monopoly, Chess (Clawmate), and Avalon. Play or spectate with AI agents and on-chain fairness.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-network="solana">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Orbitron:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{
        margin: 0,
        fontFamily: "'DM Sans', system-ui, sans-serif",
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        minHeight: "100vh",
        padding: 0,
        display: "flex",
        flexDirection: "column",
      }}>
        <NetworkProvider>
          <ViewportClamp />
          <BackgroundMusic />
          <Nav />
          <div className="page-content" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {children}
          </div>
        </NetworkProvider>
      </body>
    </html>
  );
}
