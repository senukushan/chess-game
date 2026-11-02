import { useEffect, useRef, useState } from "react";
import { DIFFICULTIES } from "../game/config";
import type { ScoreEntry } from "../game/storage";

export const fmtTime = (s: number) => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

/** counts smoothly toward `value` */
export function AnimatedNumber({ value, duration = 500, className }: { value: number; duration?: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const cur = useRef(value);
  useEffect(() => {
    from.current = cur.current;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      cur.current = from.current + (value - from.current) * e;
      setShown(Math.round(cur.current));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span className={className}>{shown.toLocaleString()}</span>;
}

type IconName = "hint" | "restart" | "pause" | "play" | "sound" | "mute" | "menu" | "flag" | "crown";

const PATHS: Record<IconName, string> = {
  hint: "M9 21h6M10 17h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z",
  restart: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5",
  pause: "M8 5v14M16 5v14",
  play: "M7 4.5v15l12-7.5z",
  sound: "M4 9v6h4l5 4V5L8 9H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12",
  mute: "M4 9v6h4l5 4V5L8 9H4zM17 9l5 6M22 9l-5 6",
  menu: "M4 6h16M4 12h16M4 18h16",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  crown: "M3 18l2-10 5 5 2-8 2 8 5-5 2 10z",
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

const OUTCOME = { win: "W", loss: "L", draw: "D" } as const;

export function ScoreTable({ scores, highlight, limit = 10, compact = false }: { scores: ScoreEntry[]; highlight?: string; limit?: number; compact?: boolean }) {
  const rows = scores.slice(0, limit);
  if (!rows.length)
    return (
      <div className="py-6 text-center text-sm text-[color:var(--muted)]">
        No scores yet.
        <br />
        Capture something to get on the board!
      </div>
    );
  return (
    <ol className="flex flex-col gap-1">
      {rows.map((e, i) => (
        <li key={e.id} className={`score-row ${e.id === highlight ? "score-row-hl" : ""} ${compact ? "score-row-compact" : ""}`}>
          <span className={`w-6 text-center font-num text-xs font-extrabold ${i === 0 ? "text-[color:var(--gold)]" : i < 3 ? "text-[color:var(--cyan)]" : "text-[color:var(--muted)]"}`}>{i + 1}</span>
          <span className="min-w-0 flex-1 truncate font-semibold">{e.name}</span>
          <span className={`outcome outcome-${e.outcome}`} title={e.outcome}>
            {OUTCOME[e.outcome]}
          </span>
          {!compact && <span className="hidden w-14 text-right text-[11px] uppercase tracking-wider text-[color:var(--muted)] sm:inline">{DIFFICULTIES[e.difficulty]?.label ?? ""}</span>}
          <span className="w-20 text-right font-num text-sm font-extrabold tabular-nums text-white">{e.score.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  );
}
