import type { Settings } from "./config";

const SCORES_KEY = "neon-gambit:scores:v1";
const SETTINGS_KEY = "neon-gambit:settings:v1";
const MUTE_KEY = "neon-gambit:muted:v1";

export interface ScoreEntry {
  id: string;
  name: string;
  score: number;
  outcome: "win" | "loss" | "draw";
  difficulty: number;
  moves: number;
  date: number;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable – ignore */
  }
}

export const loadScores = (): ScoreEntry[] => {
  const list = read<ScoreEntry[]>(SCORES_KEY, []);
  return Array.isArray(list) ? list.filter((e) => e && typeof e.score === "number") : [];
};

export function addScore(entry: Omit<ScoreEntry, "id" | "date">): { list: ScoreEntry[]; rank: number; id: string } {
  const full: ScoreEntry = { ...entry, id: Math.random().toString(36).slice(2), date: Date.now() };
  const list = [...loadScores(), full].sort((a, b) => b.score - a.score || a.date - b.date).slice(0, 10);
  write(SCORES_KEY, list);
  const rank = list.findIndex((e) => e.id === full.id);
  return { list, rank, id: full.id };
}

export const clearScores = () => write(SCORES_KEY, []);

export const defaultSettings: Settings = { name: "PLAYER", difficulty: 0, clock: 0 };

export const loadSettings = (): Settings => {
  const s = read<Partial<Settings>>(SETTINGS_KEY, {});
  return {
    name: typeof s.name === "string" && s.name.trim() ? s.name.slice(0, 10) : defaultSettings.name,
    difficulty: s.difficulty === 1 || s.difficulty === 2 ? s.difficulty : 0,
    clock: s.clock === 1 || s.clock === 2 ? s.clock : 0,
  };
};

export const saveSettings = (s: Settings) => write(SETTINGS_KEY, s);

export const loadMuted = (): boolean => read<boolean>(MUTE_KEY, false);
export const saveMuted = (m: boolean) => write(MUTE_KEY, m);
