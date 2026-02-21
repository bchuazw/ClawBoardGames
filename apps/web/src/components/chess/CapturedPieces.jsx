"use client";
import React, { useMemo } from "react";

const PIECE_UNICODE = {
  P: "\u2659", N: "\u2658", B: "\u2657", R: "\u2656", Q: "\u2655", K: "\u2654",
  p: "\u265F", n: "\u265E", b: "\u265D", r: "\u265C", q: "\u265B", k: "\u265A",
};

function countPiecesInFenBoard(fenBoard) {
  const counts = { P: 0, N: 0, B: 0, R: 0, Q: 0, K: 0, p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
  for (const ch of fenBoard) {
    if (counts[ch] !== undefined) counts[ch]++;
  }
  return counts;
}

const INITIAL_WHITE = { P: 8, N: 2, B: 2, R: 2, Q: 1, K: 1 };
const INITIAL_BLACK = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };

/** Returns { capturedByBlue: string[], capturedByPink: string[] } (FEN piece chars). */
export function getCapturedPieces(fen) {
  if (!fen || typeof fen !== "string") return { capturedByBlue: [], capturedByPink: [] };
  const board = fen.trim().split(/\s+/)[0] || "";
  if (!board) return { capturedByBlue: [], capturedByPink: [] };
  const current = countPiecesInFenBoard(board);
  const capturedByBlue = [];
  const capturedByPink = [];
  for (const key of Object.keys(INITIAL_BLACK)) {
    const n = Math.max(0, INITIAL_BLACK[key] - (current[key] ?? 0));
    for (let i = 0; i < n; i++) capturedByBlue.push(key);
  }
  for (const key of Object.keys(INITIAL_WHITE)) {
    const n = Math.max(0, INITIAL_WHITE[key] - (current[key] ?? 0));
    for (let i = 0; i < n; i++) capturedByPink.push(key);
  }
  return { capturedByBlue, capturedByPink };
}

export default function CapturedPieces({ side, fen }) {
  const pieces = useMemo(() => {
    const { capturedByBlue, capturedByPink } = getCapturedPieces(fen);
    return side === "blue" ? capturedByBlue : capturedByPink;
  }, [side, fen]);

  if (pieces.length === 0) {
    return (
      <div className={`captured-pieces captured-${side}`} aria-label={`Captured by ${side}`}>
        <div className="captured-pieces-inner" />
      </div>
    );
  }

  return (
    <div className={`captured-pieces captured-${side}`} aria-label={`Captured by ${side}`}>
      <div className="captured-pieces-inner">
        {pieces.map((p, i) => (
          <span key={`${p}-${i}`} className="captured-piece" title={p}>
            {PIECE_UNICODE[p] ?? p}
          </span>
        ))}
      </div>
    </div>
  );
}
