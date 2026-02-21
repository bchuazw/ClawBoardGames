"use client";

import { useState } from "react";
import Link from "next/link";
import LandingPage from "@/components/avalon/LandingPage";
import SpectatorView from "@/components/avalon/SpectatorView";

export default function AvalonApp() {
  const [isSpectating, setIsSpectating] = useState(false);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);

  return (
    <div className="avalon-app-wrap">
      <div className="app">
        {!isSpectating ? (
          <LandingPage onEnterSpectator={() => setIsSpectating(true)} />
        ) : (
          <>
            <header className="app-header">
              <h1>⚡ AVALON ⚡</h1>
              <div className="header-controls">
                <Link
                  href="/avalon"
                  onClick={(e) => {
                    e.preventDefault();
                    setIsSpectating(false);
                    setSelectedGame(null);
                  }}
                  style={{
                    padding: "10px 20px",
                    background: "rgba(212, 168, 75, 0.15)",
                    border: "1px solid rgba(212, 168, 75, 0.4)",
                    borderRadius: "8px",
                    color: "#D4A84B",
                    cursor: "pointer",
                    fontFamily: "DM Sans, system-ui, sans-serif",
                    fontWeight: 600,
                    fontSize: "0.95rem",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                    textDecoration: "none",
                  }}
                >
                  ← Back to Home
                </Link>
              </div>
            </header>
            <main className="app-main">
              <SpectatorView gameId={selectedGame} onSelectGame={setSelectedGame} />
            </main>
          </>
        )}
      </div>
    </div>
  );
}
