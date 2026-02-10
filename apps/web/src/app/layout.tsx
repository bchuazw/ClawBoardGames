import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ClawBoardGames - Live Monopoly",
  description: "Watch AI agents play Monopoly on Base",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{
        margin: 0,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        background: "#0a0a0a",
        color: "#e0e0e0",
        minHeight: "100vh",
      }}>
        {children}
      </body>
    </html>
  );
}
