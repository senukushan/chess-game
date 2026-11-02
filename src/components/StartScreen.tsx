import { useEffect, useState } from "react";
import { CLOCKS, DIFFICULTIES, type Settings } from "../game/config";
import { clearScores, loadScores, type ScoreEntry } from "../game/storage";
import type { PType } from "../game/pieces";
import PieceIcon from "./PieceIcon";
import { Icon, ScoreTable } from "./ui";

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  onPlay: () => void;
}

const FLOATERS: { t: PType; c: "w" | "b"; x: string; y: string; s: number; d: number; delay: number }[] = [
  { t: "k", c: "w", x: "4%", y: "10%", s: 120, d: 9, delay: 0 },
  { t: "q", c: "b", x: "84%", y: "8%", s: 140, d: 11, delay: -3 },
  { t: "n", c: "w", x: "88%", y: "56%", s: 110, d: 8, delay: -5 },
  { t: "r", c: "b", x: "2%", y: "62%", s: 100, d: 10, delay: -2 },
  { t: "b", c: "w", x: "46%", y: "88%", s: 90, d: 12, delay: -7 },
  { t: "p", c: "b", x: "70%", y: "82%", s: 80, d: 9, delay: -4 },
];

export default function StartScreen({ settings, onChange, onPlay }: Props) {
  const [scores, setScores] = useState<ScoreEntry[]>(() => loadScores());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === "INPUT";
      if (e.key === "Enter") {
        e.preventDefault();
        onPlay();
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "1" || e.key === "2" || e.key === "3") onChange({ ...settings, difficulty: (Number(e.key) - 1) as 0 | 1 | 2 });
      else if (e.key.toLowerCase() === "t") onChange({ ...settings, clock: ((settings.clock + 1) % 3) as 0 | 1 | 2 });
      else if (e.key === " ") {
        e.preventDefault();
        onPlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settings, onChange, onPlay]);

  return (
    <div className="screen">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {FLOATERS.map((f, i) => (
          <div key={i} className="floater" style={{ left: f.x, top: f.y, animationDuration: `${f.d}s`, animationDelay: `${f.delay}s` }}>
            <PieceIcon type={f.t} color={f.c} size={f.s} />
          </div>
        ))}
      </div>

      <main className="relative z-10 mx-auto grid w-full max-w-5xl gap-5 px-4 py-6 md:grid-cols-[minmax(0,1fr)_340px] md:py-10">
        <section className="flex flex-col gap-5">
          <header className="text-center md:text-left">
            <div className="mb-2 flex items-center justify-center gap-2 md:justify-start">
              <PieceIcon type="n" color="w" size={44} />
              <PieceIcon type="q" color="b" size={44} />
            </div>
            <h1 className="title font-display">
              NEON <span>GAMBIT</span>
            </h1>
            <p className="mt-2 text-sm font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Capture · Combo · Checkmate</p>
          </header>

          <div className="panel flex flex-col gap-5 p-4 sm:p-5">
            <label className="flex flex-col gap-1.5">
              <span className="label">Callsign</span>
              <input
                className="field"
                value={settings.name}
                maxLength={10}
                spellCheck={false}
                autoComplete="off"
                onChange={(e) => onChange({ ...settings, name: e.target.value.toUpperCase().replace(/[^A-Z0-9 _-]/g, "") })}
                onBlur={() => !settings.name.trim() && onChange({ ...settings, name: "PLAYER" })}
                placeholder="PLAYER"
              />
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="label">
                Opponent <span className="kbd-inline hide-coarse">1 2 3</span>
              </span>
              <div className="grid grid-cols-3 gap-2">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className={`choice ${settings.difficulty === d.id ? "choice-on" : ""}`}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onChange({ ...settings, difficulty: d.id });
                    }}
                  >
                    <span className="font-display text-[13px] font-bold tracking-wide">{d.label}</span>
                    <span className="text-[10px] uppercase tracking-widest opacity-70">{d.tag}</span>
                    <span className="mt-1 hidden text-[11px] leading-tight opacity-70 sm:block">{d.blurb}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="label">
                Clock <span className="kbd-inline hide-coarse">T</span>
              </span>
              <div className="grid grid-cols-3 gap-2">
                {CLOCKS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`choice choice-sm ${settings.clock === c.id ? "choice-on" : ""}`}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onChange({ ...settings, clock: c.id });
                    }}
                  >
                    <span className="font-display text-[13px] font-bold tracking-wide">{c.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <button type="button" className="btn btn-primary btn-xl play-pulse" onClick={onPlay}>
              <Icon name="play" size={22} />
              <span>PLAY</span>
              <span className="kbd hide-coarse">Enter</span>
            </button>
          </div>

          <div className="panel grid gap-3 p-4 text-[13px] sm:grid-cols-2">
            <div>
              <h3 className="label mb-1.5">Mouse &amp; touch</h3>
              <ul className="space-y-1 text-[color:var(--ink)]/85">
                <li>Tap a piece, then a glowing square</li>
                <li>…or drag &amp; drop it straight there</li>
                <li>Captures &amp; checks build your combo</li>
              </ul>
            </div>
            <div className="hide-coarse">
              <h3 className="label mb-1.5">Keyboard</h3>
              <ul className="space-y-1 text-[color:var(--ink)]/85">
                <li>
                  <span className="kbd">←↑↓→</span> / <span className="kbd">WASD</span> move cursor
                </li>
                <li>
                  <span className="kbd">Enter</span> select / move · <span className="kbd">Tab</span> cycle
                </li>
                <li>
                  <span className="kbd">H</span> hint · <span className="kbd">P</span> pause · <span className="kbd">R</span> restart
                </li>
              </ul>
            </div>
          </div>
        </section>

        <aside className="panel flex h-fit flex-col gap-3 p-4 sm:p-5 md:mt-[88px]">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold tracking-widest text-[color:var(--gold)]">
              <Icon name="crown" size={18} /> HIGH SCORES
            </h2>
            {scores.length > 0 && (
              <button
                type="button"
                className="text-[11px] uppercase tracking-wider text-[color:var(--muted)] underline-offset-2 hover:text-white hover:underline"
                onClick={(e) => {
                  e.currentTarget.blur();
                  if (window.confirm("Clear all saved scores?")) {
                    clearScores();
                    setScores([]);
                  }
                }}
              >
                Clear
              </button>
            )}
          </div>
          <ScoreTable scores={scores} />
          <p className="border-t border-[color:var(--line)] pt-3 text-[11px] leading-relaxed text-[color:var(--muted)]">
            Score: captures ×100 per pawn-value · checks +100 · castle +150 · promotion +500 · streak multiplier up to ×5 · checkmate +5000. Higher difficulty multiplies everything.
          </p>
        </aside>
      </main>
    </div>
  );
}
