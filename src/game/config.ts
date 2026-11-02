import type { Color, PType } from "./pieces";

export interface Settings {
  name: string;
  difficulty: 0 | 1 | 2;
  clock: 0 | 1 | 2;
}

export const DIFFICULTIES = [
  { id: 0, label: "Rookie", tag: "Easy-going", mult: 1, blurb: "Loose play. Great for combos." },
  { id: 1, label: "Knight", tag: "Balanced", mult: 1.5, blurb: "Solid tactics. ×1.5 score." },
  { id: 2, label: "Master", tag: "Ruthless", mult: 2, blurb: "Deep search. ×2 score." },
] as const;

export const CLOCKS = [
  { id: 0, label: "Casual", secs: 0, inc: 0, short: "∞" },
  { id: 1, label: "Blitz 3+2", secs: 180, inc: 2, short: "3+2" },
  { id: 2, label: "Rapid 10", secs: 600, inc: 0, short: "10" },
] as const;

export interface HudState {
  score: number;
  combo: number;
  mult: number;
  maxCombo: number;
  turn: Color;
  thinking: boolean;
  check: boolean;
  playerTime: number;
  aiTime: number;
  clockOn: boolean;
  history: string[];
  capturedByPlayer: PType[];
  capturedByAI: PType[];
  hints: number;
  hintBusy: boolean;
  status: string;
  ready: boolean;
  moveCount: number;
}

export interface GameResult {
  outcome: "win" | "loss" | "draw";
  reason: string;
  title: string;
  subtitle: string;
  baseScore: number;
  bonuses: { label: string; value: number }[];
  finalScore: number;
  stats: { moves: number; captures: number; lost: number; maxCombo: number; seconds: number; hints: number };
}

export const initialHud = (clockSecs: number): HudState => ({
  score: 0,
  combo: 0,
  mult: 1,
  maxCombo: 0,
  turn: "w",
  thinking: false,
  check: false,
  playerTime: clockSecs,
  aiTime: clockSecs,
  clockOn: clockSecs > 0,
  history: [],
  capturedByPlayer: [],
  capturedByAI: [],
  hints: 0,
  hintBusy: false,
  status: "Get ready…",
  ready: false,
  moveCount: 0,
});
