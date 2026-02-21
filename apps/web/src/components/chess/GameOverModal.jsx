"use client";
import React from "react";

export default function GameOverModal({ winner, reason, spectator, onClose }) {
  const message =
    winner === "draw"
      ? "Game Over · Draw"
      : winner === "white"
        ? "Blue wins!"
        : "Pink wins!";

  let subMessage = "";
  if (reason === "timeout") {
    if (winner === "draw") subMessage = "";
    else subMessage = winner === "white" ? "Pink ran out of time." : "Blue ran out of time.";
  } else if (reason === "concede_spectator" || (spectator && reason === "concede")) {
    // Spectator-friendly: say who conceded instead of "You conceded"
    subMessage = winner === "white" ? "Pink conceded." : "Blue conceded.";
  } else if (reason === "concede") {
    subMessage = "You conceded.";
  } else if (reason === "opponent_concede") {
    subMessage = "Opponent conceded.";
  } else if (reason === "checkmate") {
    subMessage = "By checkmate.";
  } else if (reason === "agreement") {
    subMessage = "Draw by agreement.";
  } else if (reason === "stalemate") {
    subMessage = "Stalemate.";
  } else if (reason === "50-move") {
    subMessage = "Draw by 50-move rule.";
  } else if (reason === "threefold") {
    subMessage = "Draw by threefold repetition.";
  } else if (reason === "insufficient") {
    subMessage = "Draw by insufficient material.";
  } else if (reason === "draw") {
    subMessage = "Draw by agreement or rule.";
  }

  return (
    <div className="modal-overlay game-over-overlay" onClick={onClose}>
      <div className="modal game-over-modal neon-cyan" onClick={(e) => e.stopPropagation()}>
        <h2>{message}</h2>
        {subMessage && <p className="game-over-reason">{subMessage}</p>}
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
