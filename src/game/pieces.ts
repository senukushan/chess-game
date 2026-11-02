export type Color = "w" | "b";
export type PType = "p" | "n" | "b" | "r" | "q" | "k";

export interface PieceArt {
  /** silhouette (all sub-shapes in one path, non-zero fill) */
  body: string;
  /** inner detail strokes */
  detail: string[];
  /** small filled circles [cx, cy, r] */
  dots?: [number, number, number][];
}

const BASE = "M19 95 L19 89 Q19 84 25 84 L75 84 Q81 84 81 89 L81 95 Z";

const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;

export const PIECE_ART: Record<PType, PieceArt> = {
  p: {
    body: [
      circle(50, 29, 13),
      "M35 45 Q35 40 40 40 L60 40 Q65 40 65 45 Q65 50 60 50 L40 50 Q35 50 35 45 Z",
      "M41 49 L59 49 Q60 68 73 84 L27 84 Q40 68 41 49 Z",
      BASE,
    ].join(" "),
    detail: ["M36 45 L64 45", "M30 84 L70 84"],
  },
  r: {
    body: [
      "M24 13 L38 13 L38 22 L44 22 L44 13 L56 13 L56 22 L62 22 L62 13 L76 13 L76 35 L69 41 L69 68 L77 84 L23 84 L31 68 L31 41 L24 35 Z",
      BASE,
    ].join(" "),
    detail: ["M24 35 L76 35", "M31 41 L69 41", "M31 66 L69 66", "M27 84 L73 84"],
  },
  n: {
    body: [
      "M26 84 C26 66 32 56 42 47 C36 48 31 51 25 56 C21 56 17 52 17 48 C17 40 30 28 38 22 L38 11 L47 19 C49 17 52 16 55 16 L57 11 L62 20 C76 27 82 50 78 84 Z",
      BASE,
    ].join(" "),
    detail: ["M58 26 C62 40 60 54 52 66", "M50 30 C52 38 50 44 46 48", "M27 84 L73 84"],
    dots: [[45, 31, 3.2]],
  },
  b: {
    body: [
      circle(50, 12, 6),
      "M50 18 C68 29 72 47 63 56 L62 60 L38 60 L37 56 C28 47 32 29 50 18 Z",
      "M33 59 L67 59 Q69 59 69 62 L69 65 Q69 68 67 68 L33 68 Q31 68 31 65 L31 62 Q31 59 33 59 Z",
      "M41 67 L59 67 Q60 75 73 84 L27 84 Q40 75 41 67 Z",
      BASE,
    ].join(" "),
    detail: ["M56 24 L45 42", "M47 35 L55 43", "M30 84 L70 84"],
  },
  q: {
    body: [
      circle(18, 25, 5),
      circle(34, 15, 5),
      circle(50, 11, 5),
      circle(66, 15, 5),
      circle(82, 25, 5),
      "M20 28 L32 52 L36 21 L44 50 L50 16 L56 50 L64 21 L68 52 L80 28 L75 66 Q72 72 70 74 L73 84 L27 84 L30 74 Q28 72 25 66 Z",
      "M28 66 L72 66 Q75 66 75 70 Q75 74 72 74 L28 74 Q25 74 25 70 Q25 66 28 66 Z",
      BASE,
    ].join(" "),
    detail: ["M29 70 L71 70", "M31 56 L69 56", "M27 84 L73 84"],
  },
  k: {
    body: [
      "M45 3 L55 3 L55 9 L61 9 L61 18 L55 18 L55 24 L45 24 L45 18 L39 18 L39 9 L45 9 Z",
      "M27 41 Q27 27 41 26 L59 26 Q73 27 73 41 Q73 53 63 59 L65 64 L35 64 L37 59 Q27 53 27 41 Z",
      "M31 64 L69 64 Q72 64 72 67 L72 70 Q72 73 69 73 L31 73 Q28 73 28 70 L28 67 Q28 64 31 64 Z",
      "M39 72 L61 72 Q62 78 75 84 L25 84 Q38 78 39 72 Z",
      BASE,
    ].join(" "),
    detail: ["M28 46 L72 46", "M50 26 L50 46", "M29 68.5 L71 68.5", "M27 84 L73 84"],
  },
};

export const PIECE_VALUE: Record<PType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export const PIECE_NAMES: Record<PType, string> = {
  p: "Pawn",
  n: "Knight",
  b: "Bishop",
  r: "Rook",
  q: "Queen",
  k: "King",
};

export interface PieceTheme {
  top: string;
  mid: string;
  bottom: string;
  rim: string;
  glow: string;
  detail: string;
}

export const THEMES: Record<Color, PieceTheme> = {
  w: {
    top: "#ffffff",
    mid: "#c9f6ff",
    bottom: "#6cc4ee",
    rim: "#3df0ff",
    glow: "rgba(61,240,255,0.85)",
    detail: "rgba(16,48,92,0.55)",
  },
  b: {
    top: "#8a3fd1",
    mid: "#4a1783",
    bottom: "#210a45",
    rim: "#ff4fd8",
    glow: "rgba(255,79,216,0.85)",
    detail: "rgba(255,170,238,0.6)",
  },
};
