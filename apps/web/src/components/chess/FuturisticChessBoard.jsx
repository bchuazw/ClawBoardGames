"use client";
import React, { useState, useMemo, useEffect } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const lightSquare = "#1a1a4a";
const darkSquare = "#0a0a3a";
const boardWrap = {
  background: "linear-gradient(to bottom, #0a0a2a, #1a1a4a)",
  padding: 16,
  paddingBottom: 24,
  borderRadius: 15,
  boxShadow: "0 0 25px rgba(0, 255, 255, 0.4), inset 0 0 20px rgba(0, 255, 255, 0.05)",
  width: "100%",
  height: "100%",
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  overflow: "visible",
};

const possibleMoveStyle = {
  backgroundColor: "rgba(0, 255, 255, 0.35)",
  boxShadow: "inset 0 0 12px rgba(0, 255, 255, 0.6)",
};
const selectedStyle = {
  backgroundColor: "rgba(255, 200, 0, 0.5)",
  boxShadow: "inset 0 0 12px rgba(255, 200, 0, 0.8)",
};

export default function FuturisticChessBoard({ gameId, fen, onMove, orientation = "white", disabled, isTestGame }) {
  const canMove = isTestGame || !disabled;
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [possibleMoves, setPossibleMoves] = useState([]);

  const safeFen = typeof fen === "string" && fen.length > 0 && fen !== "start" ? fen : START_FEN;

  useEffect(() => {
    setSelectedSquare(null);
    setPossibleMoves([]);
  }, [safeFen]);

  const squareStyles = useMemo(() => {
    const styles = {};
    if (selectedSquare) {
      styles[selectedSquare] = selectedStyle;
      possibleMoves.forEach((sq) => {
        styles[sq] = possibleMoveStyle;
      });
    }
    return styles;
  }, [selectedSquare, possibleMoves]);

  const handleSquareClick = ({ square, piece }) => {
    if (!canMove) return;
    const chess = new Chess(safeFen);
    const turn = chess.turn(); // "w" or "b"

    if (selectedSquare && possibleMoves.includes(square)) {
      onMove(selectedSquare, square, "q");
      setSelectedSquare(null);
      setPossibleMoves([]);
      return;
    }

    const pieceType = typeof piece === "string" ? piece : piece?.pieceType;
    if (pieceType) {
      const pieceColor = pieceType.startsWith("w") ? "w" : "b";
      if (pieceColor !== turn) return;
      const moves = chess.moves({ square, verbose: true });
      const targets = moves.map((m) => m.to);
      setSelectedSquare(square);
      setPossibleMoves(targets);
      return;
    }

    setSelectedSquare(null);
    setPossibleMoves([]);
  };

  const boardId = gameId ? `board-${String(gameId).replace(/[^a-zA-Z0-9]/g, "-")}` : "clawmate-board";
  const options = {
    id: boardId,
    position: safeFen,
    boardOrientation: orientation,
    onSquareClick: handleSquareClick,
    onPieceClick: ({ square, piece }) => handleSquareClick({ square, piece: piece?.pieceType ?? piece }),
    allowDragging: false,
    animationDurationInMs: 300,
    showAnimations: true,
    showNotation: true,
    squareStyles,
    boardStyle: {
      borderRadius: 10,
      boxShadow: "0 0 15px #00ffff, inset 0 0 8px rgba(0, 255, 255, 0.15)",
      overflow: "visible",
    },
    lightSquareStyle: {
      backgroundColor: lightSquare,
      boxShadow: "inset 0 0 6px rgba(0, 255, 255, 0.25)",
      overflow: "visible",
    },
    darkSquareStyle: {
      backgroundColor: darkSquare,
      boxShadow: "inset 0 0 6px rgba(255, 0, 255, 0.2)",
      overflow: "visible",
    },
    squareStyle: {
      overflow: "visible",
    },
  };

  return (
    <div style={boardWrap} className="futuristic-board neon-cyan">
      <div
        className="board-container"
        style={{
          width: "min(68vmin, calc((100vh - 200px) * 0.8))",
          height: "min(68vmin, calc((100vh - 200px) * 0.8))",
          maxWidth: "100%",
          maxHeight: "100%",
          aspectRatio: "1",
          paddingBottom: 20,
          paddingLeft: 4,
          paddingRight: 4,
          paddingTop: 4,
          overflow: "visible",
        }}
      >
        <Chessboard options={options} />
      </div>
      <div style={{ color: "#e0e0ff", marginTop: 8, fontSize: 12, flexShrink: 0 }}>
        FIDE Standard · {canMove ? "Click a piece, then a highlighted square to move" : "Waiting for turn"}
      </div>
    </div>
  );
}
