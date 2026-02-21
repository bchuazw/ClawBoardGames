"use client";
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Text, RoundedBox } from "@react-three/drei";
import { Chess } from "chess.js";
import * as THREE from "three";
import { getCapturedPieces } from "./CapturedPieces";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = [1, 2, 3, 4, 5, 6, 7, 8];

const CYAN = new THREE.Color(0x22d3ee);
const MAGENTA = new THREE.Color(0xff14a0);
const WHITE_PIECE = new THREE.Color(0x66e0ff);
const BLACK_PIECE = new THREE.Color(0xff66c4);
const SELECTED_COLOR = new THREE.Color(0xffc800);
const POSSIBLE_MOVE = new THREE.Color(0x00ffcc);
const LIGHT_SQUARE = new THREE.Color(0x1a1a4a);
const DARK_SQUARE = new THREE.Color(0x0a0a3a);
const BOARD_EDGE = new THREE.Color(0x0d0d30);

/* -------------------------------------------------- helpers */
function fenToPieces(fen) {
  const pieces = [];
  const parts = fen.split(" ");
  const rows = parts[0].split("/");
  for (let r = 0; r < 8; r++) {
    let col = 0;
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) { col += parseInt(ch, 10); continue; }
      const color = ch === ch.toUpperCase() ? "w" : "b";
      const type = ch.toLowerCase();
      const file = FILES[col];
      const rank = 8 - r;
      pieces.push({ color, type, square: `${file}${rank}`, file: col, rank: rank - 1 });
      col++;
    }
  }
  return pieces;
}

function squareToFileRank(sq) {
  const file = FILES.indexOf(sq[0]);
  const rank = parseInt(sq[1], 10) - 1;
  return { file, rank };
}

function fileRankToSquare(f, r) {
  return `${FILES[f]}${r + 1}`;
}

function boardPos(file, rank, orientation) {
  const x = orientation === "white" ? file - 3.5 : 3.5 - file;
  const z = orientation === "white" ? 3.5 - rank : rank - 3.5;
  return [x, 0, z];
}

/* -------------------------------------------------- Glow ring under pieces */
function GlowRing({ color, intensity = 0.5 }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
      <ringGeometry args={[0.28, 0.38, 32]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={intensity} transparent opacity={0.6} side={THREE.DoubleSide} />
    </mesh>
  );
}

/* -------------------------------------------------- Lathe profile helper */
function makeLatheGeo(points, segments = 32) {
  const pts = points.map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, segments);
}

/* Shared material props */
const MAT = { metalness: 0.8, roughness: 0.22 };

/* -------------------------------------------------- Staunton piece profiles (LatheGeometry) */

/* Pawn — classic stubby Staunton pawn */
const PAWN_PROFILE = [
  [0, 0], [0.20, 0], [0.20, 0.02], [0.18, 0.04],          // base plate
  [0.10, 0.06], [0.08, 0.10], [0.07, 0.16],                // stem lower
  [0.06, 0.22], [0.065, 0.26],                              // stem waist
  [0.10, 0.30], [0.12, 0.32], [0.12, 0.34], [0.10, 0.36],  // collar
  [0.08, 0.38], [0.12, 0.44], [0.13, 0.50],                // head lower
  [0.12, 0.56], [0.09, 0.60], [0.04, 0.62], [0, 0.63],     // head top
];

/* Rook — tower with crenellation lip */
const ROOK_PROFILE = [
  [0, 0], [0.22, 0], [0.22, 0.02], [0.19, 0.04],           // base plate
  [0.11, 0.06], [0.09, 0.10], [0.08, 0.18],                // stem
  [0.075, 0.24], [0.08, 0.28],                              // waist
  [0.10, 0.30], [0.12, 0.32], [0.12, 0.34], [0.10, 0.36],  // collar ring
  [0.09, 0.37], [0.09, 0.44], [0.10, 0.46],                // tower body
  [0.14, 0.48], [0.15, 0.50], [0.15, 0.58],                // parapet wall
  [0.13, 0.58], [0.13, 0.54], [0.11, 0.54], [0.11, 0.58],  // crenellation notch
  [0.08, 0.58], [0.08, 0.54], [0.05, 0.54], [0.05, 0.58],  // inner notch
  [0, 0.58],                                                // top center
];

/* Knight — the body is a lathe for the base; the head is built from shaped meshes */
const KNIGHT_BASE_PROFILE = [
  [0, 0], [0.21, 0], [0.21, 0.02], [0.18, 0.04],
  [0.11, 0.06], [0.09, 0.10], [0.08, 0.16],
  [0.075, 0.22], [0.08, 0.26],
  [0.10, 0.28], [0.12, 0.30], [0.12, 0.32], [0.10, 0.34],
  [0.06, 0.35], [0, 0.35],
];

/* Bishop — mitre shape with a point */
const BISHOP_PROFILE = [
  [0, 0], [0.20, 0], [0.20, 0.02], [0.17, 0.04],           // base plate
  [0.10, 0.06], [0.08, 0.10], [0.07, 0.18],                // lower stem
  [0.065, 0.24], [0.07, 0.28],                              // waist
  [0.10, 0.32], [0.12, 0.34], [0.12, 0.36], [0.10, 0.38],  // collar
  [0.08, 0.40], [0.11, 0.46], [0.12, 0.52],                // mitre body
  [0.11, 0.58], [0.09, 0.64], [0.06, 0.68],                // mitre taper
  [0.03, 0.71], [0.01, 0.73],                               // point
  [0.04, 0.74], [0.04, 0.76], [0, 0.78],                   // finial ball
];

/* Queen — body up to the shoulder, crown added as separate meshes */
const QUEEN_PROFILE = [
  [0, 0], [0.22, 0], [0.22, 0.02], [0.19, 0.04],           // base plate
  [0.11, 0.06], [0.09, 0.10], [0.08, 0.18],                // lower stem
  [0.075, 0.26], [0.08, 0.30],                              // waist
  [0.10, 0.34], [0.13, 0.36], [0.13, 0.38], [0.10, 0.40],  // collar
  [0.08, 0.42], [0.10, 0.48], [0.12, 0.54],                // body swell
  [0.13, 0.60], [0.12, 0.66], [0.10, 0.70],                // shoulder
  [0.06, 0.72], [0, 0.72],                                  // top of body (crown sits on top)
];

/* King — tallest piece with cross */
const KING_PROFILE = [
  [0, 0], [0.23, 0], [0.23, 0.02], [0.20, 0.04],           // base plate
  [0.12, 0.06], [0.10, 0.10], [0.09, 0.20],                // lower stem
  [0.085, 0.28], [0.09, 0.32],                              // waist
  [0.11, 0.36], [0.14, 0.38], [0.14, 0.40], [0.11, 0.42],  // collar
  [0.09, 0.44], [0.11, 0.50], [0.12, 0.58],                // body
  [0.13, 0.64], [0.12, 0.70], [0.10, 0.74],                // upper taper
  [0.12, 0.76], [0.13, 0.78], [0.11, 0.80],                // crown rim
  [0.07, 0.82], [0.05, 0.84], [0, 0.85],                   // dome — cross added as box meshes
];

/* Cached geometries */
const geoCache = {};
function getCachedGeo(name, profile) {
  if (!geoCache[name]) {
    geoCache[name] = makeLatheGeo(profile, 32);
    geoCache[name].computeVertexNormals();
  }
  return geoCache[name];
}

/* -------------------------------------------------- 3D piece components (Staunton style) */

function PawnShape({ color }) {
  const geo = useMemo(() => getCachedGeo("pawn", PAWN_PROFILE), []);
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} {...MAT} />
    </mesh>
  );
}

function RookShape({ color }) {
  const geo = useMemo(() => getCachedGeo("rook", ROOK_PROFILE), []);
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} {...MAT} />
    </mesh>
  );
}

function KnightShape({ color }) {
  const baseGeo = useMemo(() => getCachedGeo("knight_base", KNIGHT_BASE_PROFILE), []);

  /* Build horse head + neck from an ExtrudeGeometry using a 2D silhouette */
  const headGeo = useMemo(() => {
    const shape = new THREE.Shape();
    // Horse head profile viewed from the side (x = forward, y = up), centered roughly at neck base
    shape.moveTo(0, 0);               // neck base (back)
    shape.bezierCurveTo(              // back of neck curving up
      -0.02, 0.12,
      -0.03, 0.22,
      -0.01, 0.30
    );
    shape.bezierCurveTo(              // top of head / forehead
      0.0, 0.34,
      0.04, 0.36,
      0.08, 0.35
    );
    shape.bezierCurveTo(              // ear bump
      0.06, 0.38,
      0.04, 0.38,
      0.05, 0.35
    );
    shape.bezierCurveTo(              // forehead down to nose bridge
      0.10, 0.33,
      0.16, 0.28,
      0.20, 0.22
    );
    shape.bezierCurveTo(              // nose / muzzle — extended forward
      0.24, 0.18,
      0.26, 0.14,
      0.25, 0.11
    );
    shape.bezierCurveTo(              // mouth / chin underside
      0.23, 0.09,
      0.18, 0.07,
      0.14, 0.09
    );
    shape.bezierCurveTo(              // jaw line back to throat
      0.10, 0.08,
      0.08, 0.05,
      0.06, 0.02
    );
    shape.lineTo(0, 0);              // close back to neck base

    const extrudeSettings = {
      depth: 0.10,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.02,
      bevelSegments: 4,
      curveSegments: 16,
    };
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.computeVertexNormals();
    // Center the extrusion
    geo.translate(-0.05, 0, -0.05);
    return geo;
  }, []);

  /* Mane — a series of small ridges along the back of the neck */
  const maneGeo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(-0.015, 0.06, -0.025, 0.14, -0.02, 0.24);
    shape.bezierCurveTo(-0.01, 0.28, 0.0, 0.30, 0.01, 0.28);
    shape.lineTo(0.01, 0.0);
    shape.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.035,
      bevelEnabled: true,
      bevelThickness: 0.01,
      bevelSize: 0.01,
      bevelSegments: 2,
      curveSegments: 12,
    });
    geo.computeVertexNormals();
    geo.translate(0.01, 0, -0.018);
    return geo;
  }, []);

  return (
    <group>
      {/* Lathe base + stem */}
      <mesh geometry={baseGeo}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} {...MAT} />
      </mesh>
      {/* Horse head — extruded silhouette, placed on top of stem, tilted slightly back */}
      <group position={[0, 0.34, 0.02]} rotation-y={0} scale={[1, 1, 1]}>
        <mesh geometry={headGeo} rotation-y={Math.PI / 2}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} {...MAT} />
        </mesh>
      </group>
      {/* Mane ridge along back of neck */}
      <group position={[0, 0.34, -0.06]} rotation-y={Math.PI / 2}>
        <mesh geometry={maneGeo}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} {...MAT} />
        </mesh>
      </group>
    </group>
  );
}

function BishopShape({ color }) {
  const geo = useMemo(() => getCachedGeo("bishop", BISHOP_PROFILE), []);
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} {...MAT} />
    </mesh>
  );
}

function QueenShape({ color }) {
  const geo = useMemo(() => getCachedGeo("queen", QUEEN_PROFILE), []);
  const CROWN_POINTS = 8;
  const crownTips = useMemo(() => {
    const tips = [];
    for (let i = 0; i < CROWN_POINTS; i++) {
      const angle = (i / CROWN_POINTS) * Math.PI * 2;
      tips.push({
        x: Math.cos(angle) * 0.11,
        z: Math.sin(angle) * 0.11,
        angle,
      });
    }
    return tips;
  }, []);
  return (
    <group>
      <mesh geometry={geo}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} {...MAT} />
      </mesh>
      {/* Crown band — a ring sitting on top of the body */}
      <mesh position={[0, 0.73, 0]}>
        <torusGeometry args={[0.10, 0.025, 12, 24]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} {...MAT} />
      </mesh>
      {/* Crown points — small upward-pointing cones around the rim */}
      {crownTips.map((t, i) => (
        <mesh key={i} position={[t.x, 0.78, t.z]}>
          <coneGeometry args={[0.02, 0.08, 6]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.45} {...MAT} />
        </mesh>
      ))}
      {/* Crown arches — two crossing bands over the top */}
      <mesh position={[0, 0.82, 0]} rotation-z={0}>
        <torusGeometry args={[0.08, 0.012, 8, 24, Math.PI]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} {...MAT} />
      </mesh>
      <mesh position={[0, 0.82, 0]} rotation-y={Math.PI / 2}>
        <torusGeometry args={[0.08, 0.012, 8, 24, Math.PI]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} {...MAT} />
      </mesh>
      {/* Orb on top of crown */}
      <mesh position={[0, 0.89, 0]}>
        <sphereGeometry args={[0.04, 12, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} {...MAT} />
      </mesh>
      {/* Small cross on top of orb */}
      <mesh position={[0, 0.95, 0]}>
        <boxGeometry args={[0.015, 0.06, 0.015]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} {...MAT} />
      </mesh>
      <mesh position={[0, 0.96, 0]}>
        <boxGeometry args={[0.05, 0.015, 0.015]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} {...MAT} />
      </mesh>
    </group>
  );
}

function KingShape({ color }) {
  const geo = useMemo(() => getCachedGeo("king", KING_PROFILE), []);
  return (
    <group>
      <mesh geometry={geo}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} {...MAT} />
      </mesh>
      {/* Cross — vertical bar */}
      <mesh position={[0, 0.97, 0]}>
        <boxGeometry args={[0.04, 0.28, 0.04]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} {...MAT} />
      </mesh>
      {/* Cross — horizontal bar */}
      <mesh position={[0, 1.03, 0]}>
        <boxGeometry args={[0.18, 0.04, 0.04]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} {...MAT} />
      </mesh>
    </group>
  );
}

const PIECE_MAP = { p: PawnShape, r: RookShape, n: KnightShape, b: BishopShape, q: QueenShape, k: KingShape };

/* -------------------------------------------------- 3D captured pieces columns (inside scene, beside board) */
const CAPTURED_SCALE = 0.5;
const CAPTURED_SPACING = 0.48;
const CAPTURED_LEFT_X = -5.2;
const CAPTURED_RIGHT_X = 5.2;

function CapturedColumn3D({ pieces, side }) {
  const x = side === "left" ? CAPTURED_LEFT_X : CAPTURED_RIGHT_X;
  const pieceColor = side === "left" ? BLACK_PIECE : WHITE_PIECE;
  const n = pieces.length;
  if (n === 0) return null;
  return (
    <group>
      {pieces.map((fenChar, i) => {
        const type = fenChar.toLowerCase();
        const ShapeComp = PIECE_MAP[type];
        if (!ShapeComp) return null;
        const z = (i - (n - 1) / 2) * CAPTURED_SPACING;
        return (
          <group key={`${side}-${i}-${fenChar}`} position={[x, 0, z]} scale={[CAPTURED_SCALE, CAPTURED_SCALE, CAPTURED_SCALE]}>
            <ShapeComp color={pieceColor} />
          </group>
        );
      })}
    </group>
  );
}

/* -------------------------------------------------- Animated piece wrapper */
function AnimatedPiece({ piece, orientation, selected, isPossibleCapture, onClick }) {
  const ref = useRef();
  const [x, , z] = boardPos(piece.file, piece.rank, orientation);
  const targetPos = useRef(new THREE.Vector3(x, 0, z));
  const currentPos = useRef(new THREE.Vector3(x, 0, z));
  const bobOffset = useRef(Math.random() * Math.PI * 2);

  useEffect(() => {
    const [nx, , nz] = boardPos(piece.file, piece.rank, orientation);
    targetPos.current.set(nx, 0, nz);
  }, [piece.file, piece.rank, orientation]);

  useFrame((_, delta) => {
    if (!ref.current) return;
    currentPos.current.lerp(targetPos.current, Math.min(1, delta * 8));
    const bob = selected ? Math.sin(Date.now() * 0.005 + bobOffset.current) * 0.06 + 0.1 : 0;
    ref.current.position.set(currentPos.current.x, bob, currentPos.current.z);
  });

  const ShapeComp = PIECE_MAP[piece.type];
  const pieceColor = piece.color === "w" ? WHITE_PIECE : BLACK_PIECE;
  const emissiveColor = piece.color === "w" ? CYAN : MAGENTA;

  return (
    <group ref={ref} position={[x, 0, z]} onClick={(e) => { e.stopPropagation(); onClick?.(piece); }}>
      {selected && <GlowRing color={SELECTED_COLOR} intensity={1.2} />}
      {isPossibleCapture && <GlowRing color={POSSIBLE_MOVE} intensity={0.8} />}
      <ShapeComp color={pieceColor} glow={emissiveColor} />
    </group>
  );
}

/* -------------------------------------------------- Board squares */
function BoardSquare({ file, rank, orientation, isSelected, isPossible, onClick }) {
  const ref = useRef();
  const [hovered, setHovered] = useState(false);
  const [x, , z] = boardPos(file, rank, orientation);
  const isDark = (file + rank) % 2 === 0;
  const baseColor = isDark ? DARK_SQUARE : LIGHT_SQUARE;

  useFrame(() => {
    if (!ref.current) return;
    const mat = ref.current.material;
    if (isSelected) {
      mat.color.lerp(SELECTED_COLOR, 0.15);
      mat.emissive.lerp(SELECTED_COLOR, 0.1);
      mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, 0.6, 0.1);
    } else if (isPossible) {
      mat.color.lerp(POSSIBLE_MOVE, 0.15);
      mat.emissive.lerp(POSSIBLE_MOVE, 0.1);
      mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, 0.5, 0.1);
    } else if (hovered) {
      mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, 0.2, 0.1);
    } else {
      mat.color.lerp(baseColor, 0.08);
      mat.emissive.lerp(isDark ? MAGENTA : CYAN, 0.05);
      mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, 0.05, 0.08);
    }
  });

  return (
    <mesh
      ref={ref}
      position={[x, -0.06, z]}
      rotation-x={-Math.PI / 2}
      onClick={(e) => { e.stopPropagation(); onClick?.(file, rank); }}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <planeGeometry args={[0.98, 0.98]} />
      <meshStandardMaterial color={baseColor} emissive={isDark ? MAGENTA : CYAN} emissiveIntensity={0.05} metalness={0.4} roughness={0.6} />
    </mesh>
  );
}

/* -------------------------------------------------- Board edge + grid lines */
function BoardFrame() {
  return (
    <group>
      {/* Base platform */}
      <mesh position={[0, -0.12, 0]}>
        <boxGeometry args={[8.4, 0.1, 8.4]} />
        <meshStandardMaterial color={BOARD_EDGE} metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Edge glow */}
      <mesh position={[0, -0.07, 0]}>
        <boxGeometry args={[8.5, 0.01, 8.5]} />
        <meshStandardMaterial color={CYAN} emissive={CYAN} emissiveIntensity={0.3} transparent opacity={0.3} />
      </mesh>
      {/* Grid lines */}
      {[...Array(9)].map((_, i) => (
        <group key={`grid-${i}`}>
          <mesh position={[i - 4, -0.055, 0]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[0.015, 8]} />
            <meshStandardMaterial color={CYAN} emissive={CYAN} emissiveIntensity={0.4} transparent opacity={0.25} />
          </mesh>
          <mesh position={[0, -0.055, i - 4]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[8, 0.015]} />
            <meshStandardMaterial color={CYAN} emissive={CYAN} emissiveIntensity={0.4} transparent opacity={0.25} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* -------------------------------------------------- File/rank labels */
function BoardLabels({ orientation }) {
  const labels = [];
  for (let i = 0; i < 8; i++) {
    const file = orientation === "white" ? i : 7 - i;
    const rank = orientation === "white" ? i : 7 - i;
    labels.push(
      <Text key={`file-${i}`} position={[i - 3.5, -0.06, 4.5]} rotation-x={-Math.PI / 2} fontSize={0.22} color="#88aacc" anchorX="center" anchorY="middle">
        {FILES[file]}
      </Text>,
      <Text key={`rank-${i}`} position={[-4.5, -0.06, 3.5 - i]} rotation-x={-Math.PI / 2} fontSize={0.22} color="#88aacc" anchorX="center" anchorY="middle">
        {rank + 1}
      </Text>
    );
  }
  return <>{labels}</>;
}

/* -------------------------------------------------- Floating particles */
function Particles() {
  const count = 60;
  const ref = useRef();
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i += 3) {
      arr[i] = (Math.random() - 0.5) * 14;
      arr[i + 1] = Math.random() * 6 - 1;
      arr[i + 2] = (Math.random() - 0.5) * 14;
    }
    return arr;
  }, []);

  useFrame(() => {
    if (!ref.current) return;
    const arr = ref.current.geometry.attributes.position.array;
    for (let i = 1; i < arr.length; i += 3) {
      arr[i] += 0.003;
      if (arr[i] > 5) arr[i] = -1;
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.04} color={CYAN} emissive={CYAN} transparent opacity={0.5} sizeAttenuation />
    </points>
  );
}

/* -------------------------------------------------- Slow auto-rotate camera */
function CameraRig({ disabled }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 7, 7);
    camera.lookAt(0, 0, 0);
  }, [camera]);
  return null;
}

/* -------------------------------------------------- Promotion helpers */
/** Check if a move from `from` to `to` is a pawn promotion. */
function isPromotionMove(fen, from, to) {
  try {
    const chess = new Chess(fen);
    const moves = chess.moves({ square: from, verbose: true });
    return moves.some((m) => m.to === to && m.promotion);
  } catch { return false; }
}

/* -------------------------------------------------- Main scene */
function ChessScene({ fen, orientation, onMove, disabled, isTestGame, onPromotionPending }) {
  const safeFen = typeof fen === "string" && fen.length > 0 && fen !== "start" ? fen : START_FEN;
  const pieces = useMemo(() => fenToPieces(safeFen), [safeFen]);
  const captured = useMemo(() => getCapturedPieces(safeFen), [safeFen]);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [possibleMoves, setPossibleMoves] = useState([]);
  const canMove = isTestGame || !disabled;

  useEffect(() => {
    setSelectedSquare(null);
    setPossibleMoves([]);
  }, [safeFen]);

  /** Attempt to play a move; if promotion, defer to the overlay. */
  const tryMove = useCallback((from, to) => {
    if (isPromotionMove(safeFen, from, to)) {
      // Show promotion picker — the parent will call onMove with the chosen piece
      onPromotionPending?.({ from, to });
      setSelectedSquare(null);
      setPossibleMoves([]);
      return;
    }
    onMove(from, to, "q");
    setSelectedSquare(null);
    setPossibleMoves([]);
  }, [safeFen, onMove, onPromotionPending]);

  const handlePieceClick = useCallback((piece) => {
    if (!canMove) return;
    const chess = new Chess(safeFen);
    const turn = chess.turn();
    // If a piece is selected and we click on an enemy piece in possible moves (capture)
    if (selectedSquare && possibleMoves.includes(piece.square)) {
      tryMove(selectedSquare, piece.square);
      return;
    }
    // Select own piece
    if (piece.color !== turn && !isTestGame) return;
    const moves = chess.moves({ square: piece.square, verbose: true });
    setSelectedSquare(piece.square);
    setPossibleMoves(moves.map((m) => m.to));
  }, [canMove, safeFen, selectedSquare, possibleMoves, tryMove, isTestGame]);

  const handleSquareClick = useCallback((file, rank) => {
    const sq = fileRankToSquare(file, rank);
    if (!canMove) return;
    if (selectedSquare && possibleMoves.includes(sq)) {
      tryMove(selectedSquare, sq);
      return;
    }
    setSelectedSquare(null);
    setPossibleMoves([]);
  }, [canMove, selectedSquare, possibleMoves, tryMove]);

  const possibleSet = useMemo(() => new Set(possibleMoves), [possibleMoves]);
  const selectedFR = selectedSquare ? squareToFileRank(selectedSquare) : null;

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} color="#e8f0ff" />
      <directionalLight position={[-5, 8, -5]} intensity={0.3} color="#ff88ff" />
      <pointLight position={[0, 4, 0]} intensity={0.6} color={CYAN} distance={12} />
      <pointLight position={[3, 3, 3]} intensity={0.3} color={MAGENTA} distance={10} />

      {/* Board */}
      <BoardFrame />
      <BoardLabels orientation={orientation} />
      {FILES.map((_, fi) =>
        RANKS.map((_, ri) => (
          <BoardSquare
            key={`sq-${fi}-${ri}`}
            file={fi}
            rank={ri}
            orientation={orientation}
            isSelected={selectedFR && selectedFR.file === fi && selectedFR.rank === ri}
            isPossible={possibleSet.has(fileRankToSquare(fi, ri))}
            onClick={handleSquareClick}
          />
        ))
      )}

      {/* Pieces */}
      {pieces.map((p) => (
        <AnimatedPiece
          key={`${p.color}${p.type}${p.square}`}
          piece={p}
          orientation={orientation}
          selected={selectedSquare === p.square}
          isPossibleCapture={possibleSet.has(p.square)}
          onClick={handlePieceClick}
        />
      ))}

      {/* 3D captured pieces: left = magenta (Blue's captures), right = cyan (Pink's captures) */}
      <CapturedColumn3D pieces={captured.capturedByBlue} side="left" />
      <CapturedColumn3D pieces={captured.capturedByPink} side="right" />

      {/* Effects */}
      <Particles />
      <fog attach="fog" args={["#060618", 10, 22]} />
    </>
  );
}

/* -------------------------------------------------- Promotion picker overlay */
const PROMO_PIECES = [
  { key: "q", label: "Queen", symbol: "♛" },
  { key: "r", label: "Rook", symbol: "♜" },
  { key: "b", label: "Bishop", symbol: "♝" },
  { key: "n", label: "Knight", symbol: "♞" },
];

function PromotionPicker({ onSelect, onCancel, color }) {
  return (
    <div className="promotion-overlay" onClick={onCancel}>
      <div className="promotion-picker" onClick={(e) => e.stopPropagation()}>
        <p className="promotion-title">Promote to:</p>
        <div className="promotion-options">
          {PROMO_PIECES.map(({ key, label, symbol }) => (
            <button
              key={key}
              type="button"
              className={`promotion-btn ${color === "w" ? "promo-white" : "promo-black"}`}
              onClick={() => onSelect(key)}
              title={label}
            >
              <span className="promo-symbol">{symbol}</span>
              <span className="promo-label">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------- Exported component */
export default function ThreeChessBoard({ gameId, fen, onMove, orientation = "white", disabled, isTestGame }) {
  const [pendingPromotion, setPendingPromotion] = useState(null);

  const handlePromotionPending = useCallback((move) => {
    setPendingPromotion(move);
  }, []);

  const handlePromotionSelect = useCallback((piece) => {
    if (pendingPromotion) {
      onMove(pendingPromotion.from, pendingPromotion.to, piece);
      setPendingPromotion(null);
    }
  }, [pendingPromotion, onMove]);

  const handlePromotionCancel = useCallback(() => {
    setPendingPromotion(null);
  }, []);

  // Determine turn color for styling the promotion picker
  const turnColor = typeof fen === "string" ? (fen.split(" ")[1] || "w") : "w";

  return (
    <div className="three-chess-container">
      <Canvas
        camera={{ position: [0, 7, 7], fov: 45, near: 0.1, far: 50 }}
        gl={{ antialias: true, alpha: true }}
        style={{ width: "100%", height: "100%", background: "transparent" }}
        onCreated={({ gl }) => gl.setClearColor("#060618", 1)}
      >
        <CameraRig disabled={disabled} />
        <OrbitControls
          enablePan={false}
          enableZoom={true}
          minDistance={5}
          maxDistance={16}
          minPolarAngle={0.3}
          maxPolarAngle={Math.PI / 2.2}
          autoRotate={false}
          target={[0, 0, 0]}
        />
        <ChessScene
          fen={fen}
          orientation={orientation}
          onMove={onMove}
          disabled={disabled}
          isTestGame={isTestGame}
          onPromotionPending={handlePromotionPending}
        />
      </Canvas>

      {pendingPromotion && (
        <PromotionPicker
          onSelect={handlePromotionSelect}
          onCancel={handlePromotionCancel}
          color={turnColor}
        />
      )}

      <div className="three-chess-hint">
        {disabled ? "Spectating" : "Click piece, then target · Drag to rotate view"}
      </div>
    </div>
  );
}
