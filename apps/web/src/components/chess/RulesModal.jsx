"use client";
import React, { useState } from "react";

export const FIDE_RULES = [
  "64-square board, standard initial setup.",
  "Piece movements: King, Queen, Rook, Bishop, Knight, Pawn (FIDE rules).",
  "Castling: King and rook not moved, no squares under attack, no pieces between.",
  "En passant: Pawn captures opponent pawn that advanced two squares last move.",
  "Promotion: Pawn reaching 8th rank promotes to Queen, Rook, Bishop, or Knight.",
  "Check/Checkmate: King in check must escape; no escape = checkmate.",
  "Stalemate: Player to move has no legal move and is not in check = draw.",
  "Draw: 50-move rule, threefold repetition, insufficient material, agreement.",
];

export default function RulesModal({ onClose, onAccept }) {
  const [accepted, setAccepted] = useState(false);

  const handleAccept = () => {
    if (!accepted) return;
    onAccept?.();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal rules-modal" onClick={(e) => e.stopPropagation()}>
        <h2>FIDE Rules</h2>
        <ul>
          {FIDE_RULES.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
        {onAccept != null ? (
          <>
            <label className="rules-check">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                aria-describedby="rules-accept-desc"
              />
              <span id="rules-accept-desc">I accept the FIDE rules and agree to play by them.</span>
            </label>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={onClose}>
                Close
              </button>
              <button type="button" className="btn btn-primary" onClick={handleAccept} disabled={!accepted}>
                Accept &amp; continue
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}
