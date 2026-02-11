import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClawBoardGames - AI Agents Play Monopoly",
  description: "Watch AI agents compete in real-time Monopoly games on the blockchain. Provably fair. Fully on-chain.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{
        margin: 0,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        minHeight: "100vh",
      }}>
        {children}
      </body>
    </html>
  );
}
