import type { GameResult } from "../game/config";
import type { ScoreEntry } from "../game/storage";
import PieceIcon from "./PieceIcon";
import { AnimatedNumber, Icon, ScoreTable, fmtTime } from "./ui";

const blurClick = (fn: () => void) => (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.blur();
  fn();
};

export function PromotionPicker({ onPick, onCancel }: { onPick: (p: "q" | "r" | "b" | "n") => void; onCancel: () => void }) {
  const opts: { p: "q" | "r" | "b" | "n"; n: string; k: string }[] = [
    { p: "q", n: "Queen", k: "Q" },
    { p: "r", n: "Rook", k: "R" },
    { p: "b", n: "Bishop", k: "B" },
    { p: "n", n: "Knight", k: "N" },
  ];
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[rgba(4,6,24,0.7)] backdrop-blur-[2px]" onClick={onCancel}>
      <div className="promo pop-in" onClick={(e) => e.stopPropagation()}>
        <div className="label mb-2 text-center">Promote to</div>
        <div className="grid grid-cols-4 gap-2">
          {opts.map((o) => (
            <button key={o.p} type="button" className="promo-btn" onClick={blurClick(() => onPick(o.p))} aria-label={o.n}>
              <PieceIcon type={o.p} color="w" size={52} />
              <span className="kbd hide-coarse">{o.k}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface PauseProps {
  muted: boolean;
  onResume: () => void;
  onRestart: () => void;
  onResign: () => void;
  onMenu: () => void;
  onToggleMute: () => void;
}

export function PauseMenu({ muted, onResume, onRestart, onResign, onMenu, onToggleMute }: PauseProps) {
  return (
    <div className="overlay">
      <div className="modal pop-in" style={{ maxWidth: 380 }}>
        <div className="modal-title font-display" style={{ color: "var(--cyan)" }}>
          PAUSED
        </div>
        <p className="mb-4 text-center text-sm text-[color:var(--muted)]">The clocks are frozen.</p>
        <div className="flex flex-col gap-2.5">
          <button type="button" className="btn btn-primary" onClick={blurClick(onResume)}>
            <Icon name="play" /> Resume <span className="kbd hide-coarse">Esc</span>
          </button>
          <button type="button" className="btn btn-ghost" onClick={blurClick(onRestart)}>
            <Icon name="restart" /> Restart <span className="kbd hide-coarse">R</span>
          </button>
          <button type="button" className="btn btn-ghost" onClick={blurClick(onToggleMute)}>
            <Icon name={muted ? "mute" : "sound"} /> Sound: {muted ? "Off" : "On"} <span className="kbd hide-coarse">M</span>
          </button>
          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" className="btn btn-danger" onClick={blurClick(onResign)}>
              <Icon name="flag" /> Resign
            </button>
            <button type="button" className="btn btn-ghost" onClick={blurClick(onMenu)}>
              <Icon name="menu" /> Menu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface OverProps {
  result: GameResult;
  scores: ScoreEntry[];
  rank: number;
  highlightId: string;
  onRestart: () => void;
  onMenu: () => void;
}

export function GameOver({ result, scores, rank, highlightId, onRestart, onMenu }: OverProps) {
  const color = result.outcome === "win" ? "var(--gold)" : result.outcome === "loss" ? "var(--red)" : "var(--cyan)";
  const rows = [{ label: "Play score", value: result.baseScore }, ...result.bonuses];
  return (
    <div className="overlay">
      <div className={`modal modal-over pop-in modal-${result.outcome}`}>
        <div className="modal-title font-display" style={{ color }}>
          {result.title}
        </div>
        <p className="mb-3 text-center text-sm text-[color:var(--muted)]">{result.subtitle}</p>

        <div className="final-box">
          <span className="label">Final score</span>
          <AnimatedNumber value={result.finalScore} duration={1500} className="final-score" />
          {rank >= 0 && (
            <span className="badge">{rank === 0 ? "★ NEW HIGH SCORE ★" : `#${rank + 1} ON THE BOARD`}</span>
          )}
        </div>

        <ul className="breakdown">
          {rows.map((r, i) => (
            <li key={r.label} style={{ animationDelay: `${0.25 + i * 0.12}s` }}>
              <span>{r.label}</span>
              <span className="font-num font-extrabold tabular-nums text-white">+{r.value.toLocaleString()}</span>
            </li>
          ))}
        </ul>

        <div className="stat-row">
          <Stat label="Moves" value={String(result.stats.moves)} />
          <Stat label="Captures" value={String(result.stats.captures)} />
          <Stat label="Combo" value={result.stats.maxCombo > 0 ? `×${result.stats.maxCombo}` : "–"} />
          <Stat label="Time" value={fmtTime(result.stats.seconds)} />
        </div>

        {scores.length > 0 && (
          <div className="mt-3 hidden min-[420px]:block">
            <ScoreTable scores={scores} highlight={highlightId} limit={5} compact />
          </div>
        )}

        <div className="mt-4 grid grid-cols-[1.5fr_1fr] gap-2.5">
          <button type="button" className="btn btn-primary btn-lg" onClick={blurClick(onRestart)} autoFocus={false}>
            <Icon name="restart" /> Play again <span className="kbd hide-coarse">Enter</span>
          </button>
          <button type="button" className="btn btn-ghost btn-lg" onClick={blurClick(onMenu)}>
            <Icon name="menu" /> Menu <span className="kbd hide-coarse">Esc</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="font-num text-base font-extrabold text-white">{value}</span>
      <span className="text-[10px] uppercase tracking-widest text-[color:var(--muted)]">{label}</span>
    </div>
  );
}
