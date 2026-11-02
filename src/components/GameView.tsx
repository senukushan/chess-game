import { useCallback, useEffect, useRef, useState } from "react";
import { AI_NAME, ChessGame } from "../game/ChessGame";
import { CLOCKS, DIFFICULTIES, initialHud, type GameResult, type HudState, type Settings } from "../game/config";
import { sfx } from "../game/audio";
import { PIECE_VALUE, type Color, type PType } from "../game/pieces";
import { addScore, loadScores, type ScoreEntry } from "../game/storage";
import PieceIcon from "./PieceIcon";
import { GameOver, PauseMenu, PromotionPicker } from "./Overlays";
import { AnimatedNumber, Icon, fmtTime } from "./ui";

interface Props {
  settings: Settings;
  onQuit: () => void;
}

function Captured({ pieces, color }: { pieces: PType[]; color: Color }) {
  const sorted = [...pieces].sort((a, b) => PIECE_VALUE[b] - PIECE_VALUE[a]);
  return (
    <div className="captured">
      {sorted.map((p, i) => (
        <PieceIcon key={i} type={p} color={color} size={20} glow={false} className="cap-icon" />
      ))}
    </div>
  );
}

interface StripProps {
  name: string;
  sub: string;
  color: Color;
  active: boolean;
  captured: PType[];
  capColor: Color;
  adv: number;
  time: number;
  clockOn: boolean;
  thinking?: boolean;
  danger?: boolean;
}

function Strip({ name, sub, color, active, captured, capColor, adv, time, clockOn, thinking, danger }: StripProps) {
  const low = clockOn && time <= 10;
  return (
    <div className={`strip ${active ? "strip-active" : ""} ${danger ? "strip-danger" : ""}`}>
      <div className={`avatar avatar-${color}`}>
        <PieceIcon type="k" color={color} size={26} glow={false} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-display text-[13px] font-bold tracking-wide">{name}</span>
          {thinking && (
            <span className="thinking" aria-label="thinking">
              <i />
              <i />
              <i />
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[11px] text-[color:var(--muted)]">{sub}</span>
          <Captured pieces={captured} color={capColor} />
          {adv > 0 && <span className="text-[11px] font-bold text-[color:var(--cyan)]">+{adv}</span>}
        </div>
      </div>
      {clockOn && <div className={`clock ${active ? "clock-active" : ""} ${low ? "clock-low" : ""}`}>{fmtTime(time)}</div>}
    </div>
  );
}

export default function GameView({ settings, onQuit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctlRef = useRef<ChessGame | null>(null);
  const histRef = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState<HudState>(() => initialHud(CLOCKS[settings.clock].secs));
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState<GameResult | null>(null);
  const [promo, setPromo] = useState(false);
  const [muted, setMuted] = useState(sfx.muted);
  const [board, setBoard] = useState<{ scores: ScoreEntry[]; rank: number; id: string }>({ scores: loadScores(), rank: -1, id: "" });
  const [bump, setBump] = useState(false);
  const lastScore = useRef(0);

  useEffect(() => {
    const ctl = new ChessGame(canvasRef.current!, {
      onHud: setHud,
      onPause: setPaused,
      onPromotion: setPromo,
      onOver: (r) => {
        if (r.finalScore > 0) {
          const res = addScore({ name: settings.name || "PLAYER", score: r.finalScore, outcome: r.outcome, difficulty: settings.difficulty, moves: r.stats.moves });
          setBoard({ scores: res.list, rank: res.rank, id: res.id });
        } else {
          setBoard({ scores: loadScores(), rank: -1, id: "" });
        }
        setResult(r);
      },
    });
    ctlRef.current = ctl;
    ctl.start(settings);
    return () => {
      ctl.destroy();
      ctlRef.current = null;
    };
    // settings are fixed for the lifetime of a GameView
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // score bump animation
  useEffect(() => {
    if (hud.score > lastScore.current) {
      setBump(true);
      const t = setTimeout(() => setBump(false), 260);
      lastScore.current = hud.score;
      return () => clearTimeout(t);
    }
    lastScore.current = hud.score;
  }, [hud.score]);

  // keep move list scrolled
  useEffect(() => {
    const el = histRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [hud.history.length]);

  const restart = useCallback(() => {
    setResult(null);
    setPaused(false);
    setPromo(false);
    sfx.unlock();
    ctlRef.current?.start(settings);
  }, [settings]);

  const toggleMute = useCallback(() => {
    sfx.unlock();
    sfx.setMuted(!sfx.muted);
    setMuted(sfx.muted);
  }, []);

  const pause = useCallback((p: boolean) => ctlRef.current?.setPaused(p), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const ctl = ctlRef.current;
      if (!ctl) return;

      if (result) {
        if (k === "Enter" || k === "r" || k === " ") {
          e.preventDefault();
          if (!e.repeat) restart();
        } else if (k === "Escape" || k === "m") {
          e.preventDefault();
          if (k === "m") toggleMute();
          else onQuit();
        }
        return;
      }
      if (paused) {
        if (k === "Escape" || k === "p" || k === "Enter" || k === " ") {
          e.preventDefault();
          if (!e.repeat) pause(false);
        } else if (k === "r") {
          e.preventDefault();
          if (!e.repeat) restart();
        } else if (k === "m") toggleMute();
        else if (k === "q") onQuit();
        return;
      }
      if (ctl.handleKey(e)) {
        e.preventDefault();
        return;
      }
      if (e.repeat) return;
      if (k === "p" || k === "Escape") {
        e.preventDefault();
        pause(true);
      } else if (k === "r") {
        e.preventDefault();
        restart();
      } else if (k === "m") toggleMute();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [result, paused, restart, toggleMute, pause, onQuit]);

  const diff = DIFFICULTIES[settings.difficulty];
  const pv = hud.capturedByPlayer.reduce((a, p) => a + PIECE_VALUE[p], 0);
  const av = hud.capturedByAI.reduce((a, p) => a + PIECE_VALUE[p], 0);
  const comboPct = Math.min(1, hud.combo / 8) * 100;
  const playerTurn = hud.turn === "w" && hud.ready;
  const botTurn = hud.turn === "b" && hud.ready;

  // move list rows
  const rows: { n: number; w: string; b?: string }[] = [];
  for (let i = 0; i < hud.history.length; i += 2) rows.push({ n: i / 2 + 1, w: hud.history[i], b: hud.history[i + 1] });

  return (
    <div className="game-root">
      <div className="game-grid">
        <section className="area-score">
          <div className={`score-card ${bump ? "bump" : ""}`}>
            <span className="label">Score</span>
            <AnimatedNumber value={hud.score} duration={450} className="score-num" />
          </div>
          <div className={`combo-card ${hud.combo >= 2 ? "combo-hot" : ""}`}>
            <div className="flex items-baseline justify-between">
              <span className="label">Streak</span>
              <span className="font-num text-sm font-extrabold text-[color:var(--gold)]">×{hud.mult.toFixed(1)}</span>
            </div>
            <div className="combo-bar">
              <div style={{ width: `${comboPct}%` }} />
            </div>
            <span className="text-[10px] uppercase tracking-widest text-[color:var(--muted)]">
              {hud.combo > 0 ? `${hud.combo} in a row` : "capture or check"}
            </span>
          </div>
        </section>

        <div className="area-opp">
          <Strip
            name={AI_NAME}
            sub={`${diff.label} · ×${diff.mult}`}
            color="b"
            active={botTurn}
            thinking={botTurn && hud.thinking}
            captured={hud.capturedByAI}
            capColor="w"
            adv={Math.max(0, av - pv)}
            time={hud.aiTime}
            clockOn={hud.clockOn}
          />
        </div>

        <div className="area-board board-wrap">
          <canvas ref={canvasRef} className="board-canvas" aria-label="Chess board" />
          {promo && <PromotionPicker onPick={(p) => ctlRef.current?.choosePromotion(p)} onCancel={() => ctlRef.current?.cancelPromotion()} />}
        </div>

        <div className="area-me">
          <Strip
            name={settings.name || "PLAYER"}
            sub={hud.status}
            color="w"
            active={playerTurn}
            captured={hud.capturedByPlayer}
            capColor="b"
            adv={Math.max(0, pv - av)}
            time={hud.playerTime}
            clockOn={hud.clockOn}
            danger={hud.check && playerTurn}
          />
        </div>

        <div className="area-history panel">
          <div className="label px-3 pt-2.5">Moves</div>
          <div ref={histRef} className="history">
            {rows.length === 0 && <div className="px-1 py-2 text-xs text-[color:var(--muted)]">Your move list appears here.</div>}
            {rows.map((r) => (
              <div key={r.n} className="hrow">
                <span className="text-[color:var(--muted)]">{r.n}.</span>
                <span className="font-semibold text-[color:var(--cyan)]">{r.w}</span>
                <span className="font-semibold text-[color:var(--pink)]">{r.b ?? ""}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="area-actions">
          <button type="button" className="act" disabled={!playerTurn || hud.hintBusy} onClick={(e) => { e.currentTarget.blur(); ctlRef.current?.requestHint(); }}>
            <Icon name="hint" />
            <span>{hud.hintBusy ? "…" : "Hint"}</span>
            <small className="hide-coarse">H</small>
          </button>
          <button type="button" className="act" onClick={(e) => { e.currentTarget.blur(); restart(); }}>
            <Icon name="restart" />
            <span>Restart</span>
            <small className="hide-coarse">R</small>
          </button>
          <button type="button" className="act" onClick={(e) => { e.currentTarget.blur(); pause(true); }}>
            <Icon name="pause" />
            <span>Pause</span>
            <small className="hide-coarse">P</small>
          </button>
          <button type="button" className="act" onClick={(e) => { e.currentTarget.blur(); toggleMute(); }} aria-label="Toggle sound">
            <Icon name={muted ? "mute" : "sound"} />
            <span>{muted ? "Muted" : "Sound"}</span>
            <small className="hide-coarse">M</small>
          </button>
        </div>
      </div>

      {paused && !result && (
        <PauseMenu
          muted={muted}
          onResume={() => pause(false)}
          onRestart={restart}
          onToggleMute={toggleMute}
          onMenu={onQuit}
          onResign={() => {
            pause(false);
            ctlRef.current?.resign();
          }}
        />
      )}
      {result && <GameOver result={result} scores={board.scores} rank={board.rank} highlightId={board.id} onRestart={restart} onMenu={onQuit} />}
    </div>
  );
}
