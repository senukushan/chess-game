import { Chess, type Move, type Square } from "chess.js";
import { AiClient } from "../ai/client";
import { sfx } from "./audio";
import { CLOCKS, DIFFICULTIES, type GameResult, type HudState, type Settings } from "./config";
import { FONT, Particles, clamp, easeInOutCubic, easeOutBack, easeOutBounce, easeOutCubic, linear } from "./fx";
import { PIECE_ART, PIECE_VALUE, THEMES, type Color, type PType } from "./pieces";

export interface Callbacks {
  onHud: (h: HudState) => void;
  onOver: (r: GameResult) => void;
  onPromotion: (open: boolean) => void;
  onPause: (paused: boolean) => void;
}

type Phase = "intro" | "play" | "ending" | "over";

interface Sprite {
  color: Color;
  type: PType;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  rot: number;
  alpha: number;
  moving: boolean;
  dragging: boolean;
  sel: boolean;
  trail: { x: number; y: number }[];
}

interface Tween {
  t: number;
  delay: number;
  dur: number;
  ease: (k: number) => number;
  update: (k: number, raw: number) => void;
  done?: () => void;
}

interface Banner {
  text: string;
  sub?: string;
  color: string;
  t: number;
  dur: number;
  size: number;
}

interface EndInfo {
  outcome: "win" | "loss" | "draw";
  reason: "checkmate" | "stalemate" | "repetition" | "insufficient" | "fifty" | "timeout" | "resign";
}

const FILES = "abcdefgh";
const crToSq = (c: number, r: number) => (FILES[c] + (8 - r)) as Square;
const sqToCR = (sq: string) => ({ c: sq.charCodeAt(0) - 97, r: 8 - parseInt(sq[1], 10) });
const GOLD = "#ffd23d";
const CYAN = "#3df0ff";
const PINK = "#ff4fd8";
const RED = "#ff4560";
export const AI_NAME = "NEON-BOT";

const keyOf = (fen: string) => fen.split(" ").slice(0, 3).join(" ");
const vibrate = (p: number | number[]) => {
  try {
    navigator.vibrate?.(p);
  } catch {
    /* ignore */
  }
};

export class ChessGame {
  paused = false;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cb: Callbacks;
  private ai = new AiClient();
  private chess = new Chess();
  private settings: Settings = { name: "PLAYER", difficulty: 0, clock: 0 };
  private phase: Phase = "intro";
  private runId = 0;

  // geometry
  private S = 0;
  private dpr = 1;
  private pad = 0;
  private tile = 0;
  private cacheCss = 0;
  private boardImg: HTMLCanvasElement | null = null;
  private vignetteImg: HTMLCanvasElement | null = null;
  private pieceImgs: Record<string, HTMLCanvasElement> = {};

  // scene
  private sprites = new Map<string, Sprite>();
  private dying: Sprite[] = [];
  private tweens: Tween[] = [];
  private timers: { t: number; fn: () => void }[] = [];
  private particles = new Particles();
  private banners: Banner[] = [];
  private busy = 0;

  // juice state
  private trauma = 0;
  private flashA = 0;
  private flashColor = "#ffffff";
  private hitStop = 0;
  private slowmo = 0;
  private timeScale = 1;
  private time = 0;
  private boardIn = 0;

  // interaction
  private selected: Square | null = null;
  private targets: Move[] = [];
  private hover: { c: number; r: number } | null = null;
  private cursor = { c: 4, r: 6 };
  private kbMode = false;
  private drag: { sq: Square; sprite: Sprite; sx: number; sy: number; active: boolean; wasSelected: boolean; id: number } | null = null;
  private promo: { from: Square; to: Square; dragged: boolean } | null = null;
  private lastMove: { from: { c: number; r: number }; to: { c: number; r: number } } | null = null;
  private checkSq: { c: number; r: number } | null = null;
  private checkColor: Color = "w";
  private hint: { from: Square; to: Square; t: number } | null = null;
  private hintBusy = false;
  private idleT = 0;

  // game state
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private captures = 0;
  private lost = 0;
  private hints = 0;
  private plies = 0;
  private elapsed = 0;
  private san: string[] = [];
  private keys: string[] = [];
  private capByPlayer: PType[] = [];
  private capByAI: PType[] = [];
  private clock = { player: 0, ai: 0, started: false };
  private lastEmitSec = -1;
  private thinking = false;
  private aiMove: { from: Square; to: Square; promotion?: string } | null = null;
  private aiReadyAt = 0;

  // loop
  private raf = 0;
  private last = 0;
  private avgDt = 1 / 60;
  private slowFrames = 0;
  private ro: ResizeObserver;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement, cb: Callbacks) {
    this.canvas = canvas;
    this.cb = cb;
    this.ctx = canvas.getContext("2d")!;
    const coarse = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
    this.particles.scale = coarse ? 0.7 : 1;

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("blur", this.onBlur);

    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(canvas);
    this.layout();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("blur", this.onBlur);
    this.ai.destroy();
  }

  // ───────────────────────── lifecycle ─────────────────────────

  start(settings: Settings) {
    this.settings = settings;
    this.runId++;
    this.ai.cancel();
    this.chess = new Chess();
    this.sprites.clear();
    this.dying = [];
    this.tweens = [];
    this.timers = [];
    this.particles.clear();
    this.banners = [];
    this.busy = 0;
    this.trauma = 0;
    this.flashA = 0;
    this.hitStop = 0;
    this.slowmo = 0;
    this.timeScale = 1;
    this.selected = null;
    this.targets = [];
    this.drag = null;
    this.promo = null;
    this.hint = null;
    this.hintBusy = false;
    this.lastMove = null;
    this.checkSq = null;
    this.thinking = false;
    this.aiMove = null;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.captures = 0;
    this.lost = 0;
    this.hints = 0;
    this.plies = 0;
    this.elapsed = 0;
    this.san = [];
    this.keys = [keyOf(this.chess.fen())];
    this.capByPlayer = [];
    this.capByAI = [];
    const secs = CLOCKS[settings.clock].secs;
    this.clock = { player: secs, ai: secs, started: false };
    this.lastEmitSec = -1;
    this.cursor = { c: 4, r: 6 };
    this.kbMode = false;
    this.idleT = 0;
    this.boardIn = 0;
    this.phase = "intro";
    if (this.paused) {
      this.paused = false;
      this.cb.onPause(false);
    }
    this.cb.onPromotion(false);
    void document.fonts?.load?.('900 24px "Orbitron"');
    this.buildIntro();
    sfx.start();
    this.emit();
  }

  private buildIntro() {
    const board = this.chess.board();
    const dropDur = 0.5;
    board.forEach((row, r) =>
      row.forEach((cell, c) => {
        if (!cell) return;
        const y0 = r - 8 - Math.random() * 2;
        const rot0 = (Math.random() - 0.5) * 0.7;
        const s = this.makeSprite(cell.color, cell.type, c, y0);
        s.alpha = 0;
        s.rot = rot0;
        this.sprites.set(cell.square, s);
        const delay = r * 0.045 + c * 0.012;
        this.tween(
          dropDur,
          (k, raw) => {
            s.y = y0 + (r - y0) * k;
            s.alpha = Math.min(1, raw * 5);
            s.rot = rot0 * (1 - k);
          },
          {
            delay,
            ease: easeOutBounce,
            done: () => {
              s.y = r;
              s.alpha = 1;
              s.rot = 0;
              this.squash(s, 0.12);
              const p = this.center(c, r);
              this.particles.dust(p.x, p.y + this.tile * 0.36, 2, this.tile);
              if (c === 7) {
                this.shake(0.09);
                if (r === 1 || r === 6) sfx.thump();
              }
            },
          },
        );
      }),
    );
    this.tween(0.8, () => undefined, {
      ease: linear,
      done: () => {
        if (this.phase === "intro") {
          this.phase = "play";
          this.idleT = 0;
          this.emit();
        }
      },
    });
  }

  private makeSprite(color: Color, type: PType, c: number, r: number): Sprite {
    return { color, type, x: c, y: r, z: 0, sx: 1, sy: 1, rot: 0, alpha: 1, moving: false, dragging: false, sel: false, trail: [] };
  }

  setPaused(p: boolean) {
    if (p === this.paused) return;
    if (p && this.phase !== "play" && this.phase !== "intro") return;
    this.paused = p;
    if (p) {
      this.cancelDrag();
      sfx.click();
    }
    this.cb.onPause(p);
    this.last = performance.now();
  }

  resign() {
    if (this.phase !== "play") return;
    this.hint = null;
    this.aiMove = null;
    this.beginEnd({ outcome: "loss", reason: "resign" });
  }

  private onVisibility = () => {
    if (document.hidden && (this.phase === "play" || this.phase === "intro")) this.setPaused(true);
  };
  private onBlur = () => {
    if (this.phase === "play") this.setPaused(true);
  };

  // ───────────────────────── layout & caches ─────────────────────────

  private layout() {
    const rect = this.canvas.getBoundingClientRect();
    const size = Math.floor(rect.width);
    if (size < 40) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.S = size;
    this.canvas.width = Math.round(size * this.dpr);
    this.canvas.height = Math.round(size * this.dpr);
    this.pad = size * 0.022;
    this.tile = (size - this.pad * 2) / 8;
    this.buildBoard();
    this.buildPieces();
    this.buildVignette();
  }

  private offscreen(w: number, h: number) {
    const c = document.createElement("canvas");
    c.width = Math.ceil(w);
    c.height = Math.ceil(h);
    return c;
  }

  private buildBoard() {
    const { S, dpr, pad, tile } = this;
    const c = this.offscreen(S * dpr, S * dpr);
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    const rr = S * 0.03;
    const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    };
    const bg = g.createLinearGradient(0, 0, S, S);
    bg.addColorStop(0, "#0a0d2c");
    bg.addColorStop(1, "#1b0e3f");
    roundRect(1, 1, S - 2, S - 2, rr);
    g.fillStyle = bg;
    g.fill();
    for (let r = 0; r < 8; r++) {
      for (let col = 0; col < 8; col++) {
        const light = (r + col) % 2 === 0;
        const x = pad + col * tile;
        const y = pad + r * tile;
        const tg = g.createLinearGradient(x, y, x + tile, y + tile);
        if (light) {
          tg.addColorStop(0, "#2b3c86");
          tg.addColorStop(1, "#223174");
        } else {
          tg.addColorStop(0, "#151d4b");
          tg.addColorStop(1, "#10173d");
        }
        g.fillStyle = tg;
        g.fillRect(x, y, tile + 0.5, tile + 0.5);
      }
    }
    // sheen
    const sheen = g.createRadialGradient(S / 2, S * 0.4, S * 0.05, S / 2, S / 2, S * 0.7);
    sheen.addColorStop(0, "rgba(140,170,255,0.12)");
    sheen.addColorStop(1, "rgba(140,170,255,0)");
    g.fillStyle = sheen;
    g.fillRect(pad, pad, tile * 8, tile * 8);
    // grid
    g.strokeStyle = "rgba(120,160,255,0.09)";
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i <= 8; i++) {
      g.moveTo(pad + i * tile, pad);
      g.lineTo(pad + i * tile, pad + 8 * tile);
      g.moveTo(pad, pad + i * tile);
      g.lineTo(pad + 8 * tile, pad + i * tile);
    }
    g.stroke();
    // labels
    g.font = `700 ${Math.max(8, tile * 0.16)}px system-ui, sans-serif`;
    for (let i = 0; i < 8; i++) {
      const lightBottom = (7 + i) % 2 === 0;
      g.fillStyle = lightBottom ? "rgba(170,195,255,0.6)" : "rgba(120,150,235,0.6)";
      g.textAlign = "right";
      g.textBaseline = "alphabetic";
      g.fillText(FILES[i], pad + (i + 1) * tile - tile * 0.07, pad + 8 * tile - tile * 0.07);
      const lightLeft = (i + 0) % 2 === 0;
      g.fillStyle = lightLeft ? "rgba(170,195,255,0.6)" : "rgba(120,150,235,0.6)";
      g.textAlign = "left";
      g.textBaseline = "top";
      g.fillText(String(8 - i), pad + tile * 0.07, pad + i * tile + tile * 0.06);
    }
    // neon frame
    const ng = g.createLinearGradient(0, 0, S, S);
    ng.addColorStop(0, CYAN);
    ng.addColorStop(0.5, "#8a6bff");
    ng.addColorStop(1, PINK);
    g.save();
    g.shadowColor = "rgba(120,140,255,0.9)";
    g.shadowBlur = 10 * dpr;
    g.strokeStyle = ng;
    g.lineWidth = 2;
    roundRect(1.5, 1.5, S - 3, S - 3, rr);
    g.stroke();
    g.restore();
    g.strokeStyle = "rgba(255,255,255,0.12)";
    g.lineWidth = 1;
    g.strokeRect(pad, pad, tile * 8, tile * 8);
    this.boardImg = c;
  }

  private buildPieces() {
    const { tile, dpr } = this;
    const cssSize = tile * 1.5;
    const px = Math.ceil(cssSize * dpr);
    this.cacheCss = px / dpr;
    const box = tile * 0.84 * dpr;
    const k = box / 100;
    (["w", "b"] as Color[]).forEach((color) => {
      (["p", "n", "b", "r", "q", "k"] as PType[]).forEach((type) => {
        const c = this.offscreen(px, px);
        const g = c.getContext("2d")!;
        const th = THEMES[color];
        const art = PIECE_ART[type];
        const path = new Path2D(art.body);
        g.translate((px - box) / 2, (px - box) / 2);
        g.scale(k, k);
        g.lineJoin = "round";
        g.lineCap = "round";
        // glow
        g.save();
        g.shadowColor = th.glow;
        g.shadowBlur = tile * 0.16 * dpr;
        g.strokeStyle = th.rim;
        g.lineWidth = 3;
        g.stroke(path);
        g.restore();
        const grad = g.createLinearGradient(0, 0, 0, 100);
        grad.addColorStop(0, th.top);
        grad.addColorStop(0.5, th.mid);
        grad.addColorStop(1, th.bottom);
        g.fillStyle = grad;
        g.fill(path);
        g.save();
        g.clip(path);
        const sh = g.createLinearGradient(14, 0, 86, 0);
        sh.addColorStop(0, "rgba(255,255,255,0.38)");
        sh.addColorStop(0.45, "rgba(255,255,255,0)");
        sh.addColorStop(1, "rgba(0,0,0,0.3)");
        g.fillStyle = sh;
        g.fillRect(0, 0, 100, 100);
        g.restore();
        g.strokeStyle = th.rim;
        g.lineWidth = 2.2;
        g.stroke(path);
        g.strokeStyle = th.detail;
        g.lineWidth = 2;
        for (const d of art.detail) g.stroke(new Path2D(d));
        g.fillStyle = th.detail;
        for (const [cx, cy, r] of art.dots ?? []) {
          g.beginPath();
          g.arc(cx, cy, r, 0, 6.283);
          g.fill();
        }
        this.pieceImgs[color + type] = c;
      });
    });
  }

  private buildVignette() {
    const { S, dpr } = this;
    const c = this.offscreen(S * dpr, S * dpr);
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(c.width / 2, c.height / 2, c.width * 0.28, c.width / 2, c.height / 2, c.width * 0.72);
    grad.addColorStop(0, "rgba(255,40,70,0)");
    grad.addColorStop(1, "rgba(255,40,70,0.75)");
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    this.vignetteImg = c;
  }

  // ───────────────────────── helpers ─────────────────────────

  private center(c: number, r: number) {
    return { x: this.pad + (c + 0.5) * this.tile, y: this.pad + (r + 0.5) * this.tile };
  }

  private tween(dur: number, update: (k: number, raw: number) => void, o: { delay?: number; ease?: (k: number) => number; done?: () => void } = {}) {
    this.tweens.push({ t: 0, delay: o.delay ?? 0, dur, ease: o.ease ?? easeOutCubic, update, done: o.done });
  }

  private later(sec: number, fn: () => void) {
    this.timers.push({ t: sec, fn });
  }

  private shake(a: number) {
    this.trauma = Math.min(1, this.trauma + a);
  }

  private flash(a: number, color = "#ffffff") {
    this.flashA = Math.max(this.flashA, a);
    this.flashColor = color;
  }

  private banner(text: string, color: string, size = 0.095, sub?: string, dur = 1.1) {
    if (this.banners.length >= 2) this.banners.shift();
    this.banners.push({ text, sub, color, t: 0, dur, size });
  }

  private squash(s: Sprite, amt = 0.2) {
    this.tween(
      0.38,
      (_k, raw) => {
        const e = Math.exp(-7 * raw) * Math.cos(raw * 22);
        s.sx = 1 + amt * e;
        s.sy = 1 - amt * e;
      },
      {
        ease: linear,
        done: () => {
          s.sx = 1;
          s.sy = 1;
        },
      },
    );
  }

  private wiggle(s: Sprite) {
    this.tween(
      0.3,
      (_k, raw) => {
        s.rot = 0.22 * Math.sin(raw * 28) * (1 - raw);
      },
      {
        ease: linear,
        done: () => {
          s.rot = 0;
        },
      },
    );
  }

  private multiplier() {
    return Math.min(5, 1 + 0.5 * this.combo);
  }

  private canAct() {
    return this.phase === "play" && !this.paused && this.chess.turn() === "w" && this.busy === 0 && !this.promo;
  }

  private statusText() {
    if (this.phase === "intro") return "Get ready…";
    if (this.phase === "ending") return "…";
    if (this.phase === "over") return "Game over";
    if (this.promo) return "Choose a promotion";
    if (this.chess.turn() === "b") return `${AI_NAME} is thinking…`;
    if (this.plies === 0) {
      const coarse = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
      return coarse ? "Tap a piece, then a glowing square" : "Click or drag a piece · or use arrows + Enter";
    }
    return this.checkSq && this.checkColor === "w" ? "You are in CHECK!" : "Your move";
  }

  private emit() {
    const secs = CLOCKS[this.settings.clock].secs;
    this.cb.onHud({
      score: this.score,
      combo: this.combo,
      mult: this.multiplier(),
      maxCombo: this.maxCombo,
      turn: this.chess.turn(),
      thinking: this.thinking,
      check: !!this.checkSq && this.checkColor === "w",
      playerTime: Math.max(0, this.clock.player),
      aiTime: Math.max(0, this.clock.ai),
      clockOn: secs > 0,
      history: this.san.slice(),
      capturedByPlayer: this.capByPlayer.slice(),
      capturedByAI: this.capByAI.slice(),
      hints: this.hints,
      hintBusy: this.hintBusy,
      status: this.statusText(),
      ready: this.phase === "play",
      moveCount: this.plies,
    });
  }

  // ───────────────────────── input: pointer ─────────────────────────

  private eventPos(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * this.S, y: ((e.clientY - rect.top) / rect.height) * this.S };
  }

  private posToCR(x: number, y: number) {
    const c = Math.floor((x - this.pad) / this.tile);
    const r = Math.floor((y - this.pad) / this.tile);
    if (c < 0 || c > 7 || r < 0 || r > 7) return null;
    return { c, r };
  }

  private onPointerDown = (e: PointerEvent) => {
    sfx.unlock();
    this.kbMode = false;
    this.idleT = 0;
    if (e.button !== undefined && e.button > 0) return;
    const p = this.eventPos(e);
    const cr = this.posToCR(p.x, p.y);
    if (!cr || !this.canAct()) return;
    const sq = crToSq(cr.c, cr.r);
    if (e.pointerType === "mouse") this.hover = cr;
    if (this.selected && this.targets.some((m) => m.to === sq)) {
      this.tryMove(sq, false);
      return;
    }
    const piece = this.chess.get(sq);
    if (piece && piece.color === "w") {
      const was = this.selected === sq;
      if (!was && !this.select(sq)) return;
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      this.drag = { sq, sprite: this.sprites.get(sq)!, sx: e.clientX, sy: e.clientY, active: false, wasSelected: was, id: e.pointerId };
    } else if (this.selected) {
      this.select(null);
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    const p = this.eventPos(e);
    const cr = this.posToCR(p.x, p.y);
    if (e.pointerType === "mouse") this.hover = cr;
    const d = this.drag;
    if (d && e.pointerId === d.id) {
      if (!d.active && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 7) {
        d.active = true;
        d.sprite.dragging = true;
        d.sprite.z = 0.8;
        d.sprite.sx = d.sprite.sy = 1.12;
        sfx.select();
      }
      if (d.active) {
        const nx = (p.x - this.pad) / this.tile - 0.5;
        const ny = (p.y - this.pad) / this.tile - 0.5;
        const vx = nx - d.sprite.x;
        d.sprite.x = nx;
        d.sprite.y = ny - 0.18;
        d.sprite.rot = clamp(vx * 0.9, -0.3, 0.3);
      }
    }
    if (e.pointerType === "mouse") {
      let cur = "default";
      if (cr && this.canAct()) {
        const sq = crToSq(cr.c, cr.r);
        const piece = this.chess.get(sq);
        if ((piece && piece.color === "w") || (this.selected && this.targets.some((m) => m.to === sq))) cur = "pointer";
      }
      this.canvas.style.cursor = d?.active ? "grabbing" : cur;
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") this.hover = null;
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const s = d.sprite;
    if (d.active) {
      s.dragging = false;
      const p = this.eventPos(e);
      const cr = this.posToCR(p.x, p.y);
      const sq = cr ? crToSq(cr.c, cr.r) : null;
      if (sq && this.targets.some((m) => m.to === sq)) {
        this.tryMove(sq, true);
      } else {
        this.snapBack(s, d.sq);
        if (sq && sq !== d.sq) sfx.error();
      }
    } else if (d.wasSelected && e.type === "pointerup") {
      this.select(null);
    }
  };

  private onPointerLeave = () => {
    if (!this.drag) this.hover = null;
  };

  private cancelDrag() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    d.sprite.dragging = false;
    this.snapBack(d.sprite, d.sq);
  }

  private snapBack(s: Sprite, sq: string) {
    const home = sqToCR(sq);
    const x0 = s.x;
    const y0 = s.y;
    const z0 = s.z;
    this.tween(
      0.16,
      (k) => {
        s.x = x0 + (home.c - x0) * k;
        s.y = y0 + (home.r - y0) * k;
        s.z = z0 * (1 - k);
        s.sx = s.sy = 1 + 0.12 * (1 - k);
        s.rot *= 1 - k;
      },
      {
        done: () => {
          s.x = home.c;
          s.y = home.r;
          s.z = 0;
          s.sx = s.sy = 1;
          s.rot = 0;
        },
      },
    );
  }

  // ───────────────────────── input: keyboard ─────────────────────────

  /** returns true when the key was consumed */
  handleKey(e: KeyboardEvent): boolean {
    sfx.unlock();
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (e.ctrlKey || e.metaKey || e.altKey) return false;

    if (this.promo) {
      const map: Record<string, "q" | "r" | "b" | "n"> = { q: "q", r: "r", b: "b", n: "n", "1": "q", "2": "r", "3": "b", "4": "n", Enter: "q", " ": "q" };
      if (map[k]) {
        this.choosePromotion(map[k]);
        return true;
      }
      if (k === "Escape") {
        this.cancelPromotion();
        return true;
      }
      return true;
    }
    if (this.phase !== "play" || this.paused) return false;

    this.idleT = 0;
    switch (k) {
      case "ArrowUp":
      case "w":
        return this.moveCursor(0, -1);
      case "ArrowDown":
      case "s":
        return this.moveCursor(0, 1);
      case "ArrowLeft":
      case "a":
        return this.moveCursor(-1, 0);
      case "ArrowRight":
      case "d":
        return this.moveCursor(1, 0);
      case "Enter":
      case " ":
        this.kbMode = true;
        this.activateCursor();
        return true;
      case "Escape":
        if (this.selected) {
          this.select(null);
          return true;
        }
        return false;
      case "Tab":
        this.cycle(e.shiftKey ? -1 : 1);
        return true;
      case "h":
        this.requestHint();
        return true;
      default:
        return false;
    }
  }

  private moveCursor(dc: number, dr: number) {
    this.kbMode = true;
    this.cursor.c = clamp(this.cursor.c + dc, 0, 7);
    this.cursor.r = clamp(this.cursor.r + dr, 0, 7);
    sfx.tick();
    return true;
  }

  private activateCursor() {
    if (!this.canAct()) return;
    const sq = crToSq(this.cursor.c, this.cursor.r);
    if (this.selected && this.targets.some((m) => m.to === sq)) {
      this.tryMove(sq, false);
      return;
    }
    const piece = this.chess.get(sq);
    if (piece && piece.color === "w") {
      if (this.selected === sq) this.select(null);
      else this.select(sq);
    } else if (this.selected) {
      this.select(null);
    } else {
      sfx.error();
    }
  }

  private cycle(dir: number) {
    if (!this.canAct()) return;
    this.kbMode = true;
    sfx.tick();
    if (this.selected) {
      const tos = [...new Set(this.targets.map((m) => m.to))];
      const cur = crToSq(this.cursor.c, this.cursor.r);
      let idx = tos.indexOf(cur);
      if (idx < 0) idx = dir > 0 ? -1 : 0;
      const next = tos[(idx + dir + tos.length) % tos.length];
      const cr = sqToCR(next);
      this.cursor = { c: cr.c, r: cr.r };
    } else {
      const own: Square[] = [];
      for (const row of this.chess.board())
        for (const cell of row) if (cell && cell.color === "w" && this.chess.moves({ square: cell.square }).length) own.push(cell.square);
      if (!own.length) return;
      own.sort((a, b) => sqToCR(a).c - sqToCR(b).c || sqToCR(b).r - sqToCR(a).r);
      const cur = crToSq(this.cursor.c, this.cursor.r);
      let idx = own.indexOf(cur);
      if (idx < 0) idx = dir > 0 ? -1 : 0;
      const next = own[(idx + dir + own.length) % own.length];
      const cr = sqToCR(next);
      this.cursor = { c: cr.c, r: cr.r };
    }
  }

  // ───────────────────────── selection & moves ─────────────────────────

  private select(sq: Square | null): boolean {
    const prev = this.selected;
    if (prev) {
      const ps = this.sprites.get(prev);
      if (ps) ps.sel = false;
    }
    if (!sq) {
      this.selected = null;
      this.targets = [];
      if (prev) sfx.deselect();
      return true;
    }
    const moves = this.chess.moves({ square: sq, verbose: true });
    const sp = this.sprites.get(sq);
    if (!moves.length) {
      this.selected = null;
      this.targets = [];
      if (sp) this.wiggle(sp);
      sfx.error();
      return false;
    }
    this.selected = sq;
    this.targets = moves;
    if (sp) {
      sp.sel = true;
      this.tween(0.22, (_k, raw) => {
        const s = 1 + 0.2 * Math.sin(raw * Math.PI);
        if (!sp.moving && !sp.dragging) {
          sp.sx = s;
          sp.sy = s;
        }
      }, {
        ease: linear,
        done: () => {
          if (!sp.dragging) {
            sp.sx = 1;
            sp.sy = 1;
          }
        },
      });
      const c = this.center(sqToCR(sq).c, sqToCR(sq).r);
      this.particles.ring(c.x, c.y, this.tile * 0.55, CYAN, 0.35);
    }
    sfx.select();
    const cr = sqToCR(sq);
    this.cursor = { c: cr.c, r: cr.r };
    return true;
  }

  private tryMove(to: Square, dragged: boolean): boolean {
    const from = this.selected;
    if (!from) return false;
    const cands = this.targets.filter((m) => m.to === to);
    if (!cands.length) return false;
    this.hint = null;
    if (cands[0].promotion) {
      this.promo = { from, to, dragged };
      if (dragged) {
        const s = this.sprites.get(from)!;
        const t = sqToCR(to);
        const x0 = s.x;
        const y0 = s.y;
        this.tween(0.1, (k) => {
          s.x = x0 + (t.c - x0) * k;
          s.y = y0 + (t.r - y0) * k;
        });
      }
      this.cb.onPromotion(true);
      this.emit();
      return true;
    }
    this.clearSelectionQuiet();
    this.applyMove({ from, to }, "player", dragged);
    return true;
  }

  private clearSelectionQuiet() {
    if (this.selected) {
      const s = this.sprites.get(this.selected);
      if (s) s.sel = false;
    }
    this.selected = null;
    this.targets = [];
  }

  choosePromotion(p: "q" | "r" | "b" | "n") {
    const pr = this.promo;
    if (!pr) return;
    this.promo = null;
    this.cb.onPromotion(false);
    this.clearSelectionQuiet();
    this.applyMove({ from: pr.from, to: pr.to, promotion: p }, "player", pr.dragged);
  }

  cancelPromotion() {
    const pr = this.promo;
    if (!pr) return;
    this.promo = null;
    this.cb.onPromotion(false);
    const s = this.sprites.get(pr.from);
    if (s) this.snapBack(s, pr.from);
    sfx.deselect();
    this.emit();
  }

  private applyMove(input: { from: Square; to: Square; promotion?: string }, by: "player" | "ai", dragged = false): boolean {
    let mv: Move;
    try {
      mv = this.chess.move(input);
    } catch {
      return false;
    }
    this.plies++;
    this.san.push(mv.san);
    this.keys.push(keyOf(this.chess.fen()));
    this.hint = null;
    this.idleT = 0;

    const secs = CLOCKS[this.settings.clock];
    if (by === "player") this.clock.started = true;
    if (secs.secs && this.clock.started) {
      if (by === "player") this.clock.player += secs.inc;
      else this.clock.ai += secs.inc;
    }

    const isEp = mv.flags.includes("e");
    const isCastle = mv.flags.includes("k") || mv.flags.includes("q");
    const isPromo = !!mv.promotion;
    const check = this.chess.inCheck();
    const mate = this.chess.isCheckmate();

    // game end detection (visual sequence plays after landing)
    let end: EndInfo | null = null;
    if (mate) end = { outcome: mv.color === "w" ? "win" : "loss", reason: "checkmate" };
    else if (this.chess.isStalemate()) end = { outcome: "draw", reason: "stalemate" };
    else if (this.chess.isInsufficientMaterial()) end = { outcome: "draw", reason: "insufficient" };
    else if (this.chess.isThreefoldRepetition()) end = { outcome: "draw", reason: "repetition" };
    else if (this.chess.isDraw()) end = { outcome: "draw", reason: "fifty" };

    // scoring
    let gain = 0;
    let comboUp = false;
    let comboLost = false;
    let lossPts = 0;
    const dm = DIFFICULTIES[this.settings.difficulty].mult;
    if (by === "player") {
      let base = mv.captured ? PIECE_VALUE[mv.captured as PType] * 100 : 10;
      if (isCastle) base += 150;
      if (isPromo) base += 500;
      if (check) base += 100;
      const aggressive = !!mv.captured || check;
      gain = Math.round(base * (aggressive ? this.multiplier() : 1) * dm);
      if (mv.captured) {
        this.captures++;
        this.capByPlayer.push(mv.captured as PType);
      }
      if (aggressive) {
        this.combo++;
        comboUp = this.combo >= 2;
        this.maxCombo = Math.max(this.maxCombo, this.combo);
      }
      this.score += gain;
    } else if (mv.captured) {
      lossPts = Math.round(PIECE_VALUE[mv.captured as PType] * 30);
      this.score = Math.max(0, this.score - lossPts);
      this.lost++;
      this.capByAI.push(mv.captured as PType);
      if (this.combo >= 2) comboLost = true;
      this.combo = 0;
    }

    // sprites
    const mover = this.sprites.get(mv.from);
    if (!mover) {
      this.rebuildSprites();
      this.postMoveFlow(by, end);
      return true;
    }
    const capSq = (isEp ? mv.to[0] + mv.from[1] : mv.to) as Square;
    const capSprite = mv.captured ? this.sprites.get(capSq) : undefined;
    this.sprites.delete(mv.from);
    if (capSprite) {
      this.sprites.delete(capSq);
      this.dying.push(capSprite);
    }
    this.sprites.set(mv.to, mover);

    const target = sqToCR(mv.to);
    const dist = Math.hypot(target.c - mover.x, target.r - mover.y);
    const knight = mv.piece === "n";
    const dur = dragged ? 0.11 : knight ? 0.42 : clamp(0.17 + 0.05 * dist, 0.22, 0.52);
    const hop = dragged ? 0.15 : knight ? 1 : 0.34;

    // castling rook
    if (isCastle) {
      const rank = mv.from[1];
      const king = mv.flags.includes("k");
      const rookFrom = (king ? "h" : "a") + rank;
      const rookTo = (king ? "f" : "d") + rank;
      const rs = this.sprites.get(rookFrom as Square);
      if (rs) {
        this.sprites.delete(rookFrom as Square);
        this.sprites.set(rookTo as Square, rs);
        const rt = sqToCR(rookTo);
        this.busy++;
        this.glide(rs, rt.c, rt.r, dur, 0.4, () => {
          this.squash(rs, 0.16);
          const p = this.center(rt.c, rt.r);
          this.particles.dust(p.x, p.y + this.tile * 0.36, 4, this.tile);
          this.endBusy();
        });
      }
    }

    this.busy++;
    this.thinkingStart(by, end);
    this.glide(mover, target.c, target.r, dur, hop, () => {
      const p = this.center(target.c, target.r);
      const base = p.y + this.tile * 0.36;
      this.squash(mover, capSprite ? 0.26 : 0.2);
      this.lastMove = { from: sqToCR(mv.from), to: target };
      this.checkSq = null;

      if (capSprite) {
        this.dying = this.dying.filter((d) => d !== capSprite);
        const cp = this.center(sqToCR(capSq).c, sqToCR(capSq).r);
        this.captureFx(cp.x, cp.y, capSprite, PIECE_VALUE[mv.captured as PType], by === "player");
      } else if (isCastle) {
        sfx.castle();
        this.particles.dust(p.x, base, 5, this.tile);
        this.shake(0.12);
      } else {
        sfx.move(1);
        this.particles.dust(p.x, base, 5, this.tile);
        this.shake(0.07);
      }

      if (isPromo) {
        mover.type = mv.promotion as PType;
        this.particles.ring(p.x, p.y, this.tile * 1.4, GOLD, 0.6);
        this.particles.sparks(p.x, p.y, 26, [GOLD, "#fff", CYAN], this.tile, 1.1);
        this.banner("PROMOTION!", GOLD, 0.085);
        sfx.promote();
        this.shake(0.2);
      }
      if (by === "player") {
        this.floatScore(p.x, p.y - this.tile * 0.35, gain);
        if (isCastle) this.banner("CASTLED", CYAN, 0.06);
        if (comboUp) {
          this.banner(`COMBO ×${this.combo}`, GOLD, 0.075, `next ×${this.multiplier().toFixed(1)} score`);
          sfx.combo(this.combo);
        }
      } else if (lossPts) {
        const cp = this.center(sqToCR(capSq).c, sqToCR(capSq).r);
        this.particles.text(cp.x, cp.y - this.tile * 0.2, `−${lossPts}`, RED, this.tile * 0.34);
        if (comboLost) this.banner("COMBO LOST", RED, 0.06);
      }

      if (check && !mate) {
        const kc = this.findKing(mv.color === "w" ? "b" : "w");
        if (kc) {
          this.checkSq = kc;
          this.checkColor = mv.color === "w" ? "b" : "w";
          const kp = this.center(kc.c, kc.r);
          this.particles.ring(kp.x, kp.y, this.tile * 1.3, RED, 0.55);
          this.particles.ring(kp.x, kp.y, this.tile * 0.8, "#fff", 0.35);
        }
        this.banner("CHECK!", RED, 0.1);
        this.shake(0.3);
        this.flash(0.16, RED);
        sfx.check();
        vibrate([40, 40, 40]);
      }
      this.endBusy();
      this.emit();
      if (end) this.beginEnd(end);
    });
    this.emit();
    return true;
  }

  private thinkingStart(by: "player" | "ai", end: EndInfo | null) {
    if (end) {
      this.thinking = false;
      return;
    }
    if (by === "player" && this.chess.turn() === "b") this.requestAi();
  }

  private postMoveFlow(by: "player" | "ai", end: EndInfo | null) {
    this.thinkingStart(by, end);
    this.emit();
    if (end) this.beginEnd(end);
  }

  private endBusy() {
    this.busy = Math.max(0, this.busy - 1);
    if (this.busy === 0) this.verifySprites();
  }

  private glide(s: Sprite, tc: number, tr: number, dur: number, hop: number, done: () => void) {
    const x0 = s.x;
    const y0 = s.y;
    const z0 = s.z;
    s.moving = true;
    s.sel = false;
    s.trail.length = 0;
    this.tween(
      dur,
      (k, raw) => {
        s.x = x0 + (tc - x0) * k;
        s.y = y0 + (tr - y0) * k;
        s.z = z0 * (1 - raw) + Math.sin(Math.PI * raw) * hop;
        s.rot *= 0.8;
        s.sx += (1 - s.sx) * 0.3;
        s.sy += (1 - s.sy) * 0.3;
      },
      {
        ease: easeInOutCubic,
        done: () => {
          s.x = tc;
          s.y = tr;
          s.z = 0;
          s.rot = 0;
          s.moving = false;
          s.trail.length = 0;
          done();
        },
      },
    );
  }

  private findKing(color: Color) {
    for (const [sq, s] of this.sprites) if (s.type === "k" && s.color === color) return sqToCR(sq);
    return null;
  }

  private verifySprites() {
    const board = this.chess.board();
    let ok = true;
    let count = 0;
    for (let r = 0; r < 8 && ok; r++)
      for (let c = 0; c < 8; c++) {
        const cell = board[r][c];
        if (!cell) continue;
        count++;
        const s = this.sprites.get(cell.square);
        if (!s || s.type !== cell.type || s.color !== cell.color) {
          ok = false;
          break;
        }
      }
    if (!ok || count !== this.sprites.size) this.rebuildSprites();
  }

  private rebuildSprites() {
    this.sprites.clear();
    this.chess.board().forEach((row, r) =>
      row.forEach((cell, c) => {
        if (cell) this.sprites.set(cell.square, this.makeSprite(cell.color, cell.type, c, r));
      }),
    );
  }

  // ───────────────────────── effects ─────────────────────────

  private floatScore(px: number, py: number, gain: number) {
    const x = clamp(px, this.tile * 1.0, this.S - this.tile * 1.0);
    const y = clamp(py, this.tile * 0.7, this.S - this.tile * 0.7);
    if (gain >= 100) {
      this.particles.text(x, y, `+${gain.toLocaleString()}`, GOLD, this.tile * (gain >= 500 ? 0.44 : 0.36));
    } else {
      this.particles.text(x, y, `+${gain}`, "#bfe9ff", this.tile * 0.24, 0.8);
    }
  }

  private captureFx(x: number, y: number, victim: Sprite, value: number, byPlayer: boolean) {
    const th = THEMES[victim.color];
    const T = this.tile;
    const v = Math.max(1, value);
    this.particles.shards(x, y, 12 + v * 3.2, [th.rim, th.mid, th.top, th.bottom], T, 1 + v * 0.04);
    this.particles.sparks(x, y, 10 + v * 2, [th.rim, "#ffffff", GOLD], T, 1 + v * 0.03);
    this.particles.ring(x, y, T * (0.9 + v * 0.07), th.rim, 0.5);
    this.particles.ring(x, y, T * 0.55, "#ffffff", 0.3);
    this.particles.dust(x, y + T * 0.34, 4, T);
    this.shake(0.22 + v * 0.05);
    this.hitStop = Math.max(this.hitStop, 0.045 + v * 0.007);
    this.flash(0.1 + v * 0.018, byPlayer ? "#ffffff" : RED);
    sfx.capture(v);
    vibrate(v >= 5 ? [30, 20, 45] : 25);
  }

  // ───────────────────────── AI ─────────────────────────

  private requestAi() {
    this.thinking = true;
    this.aiMove = null;
    const run = this.runId;
    const level = this.settings.difficulty;
    this.aiReadyAt = this.time + (level === 0 ? 0.55 : 0.7);
    void this.ai.search({ fen: this.chess.fen(), level, history: this.keys }).then((res) => {
      if (run !== this.runId || this.destroyed) return;
      const legal = this.chess.moves({ verbose: true });
      let pick: { from: Square; to: Square; promotion?: string } | null = null;
      if (res) {
        const ok = legal.find((m) => m.from === res.from && m.to === res.to && (!m.promotion || m.promotion === (res.promotion ?? "q")));
        if (ok) pick = { from: ok.from, to: ok.to, promotion: ok.promotion };
      }
      if (!pick && legal.length) {
        const m = legal[Math.floor(Math.random() * legal.length)];
        pick = { from: m.from, to: m.to, promotion: m.promotion };
      }
      this.aiMove = pick;
    });
  }

  requestHint() {
    if (!this.canAct() || this.hintBusy || this.hint) return;
    this.hintBusy = true;
    this.hints++;
    this.score = Math.max(0, this.score - 150);
    const c = this.center(4, 7);
    this.particles.text(c.x, c.y - this.tile, "−150 hint", RED, this.tile * 0.26, 1.0);
    sfx.hint();
    this.emit();
    const run = this.runId;
    const at = this.plies;
    void this.ai.search({ fen: this.chess.fen(), level: 3, history: [] }).then((res) => {
      if (run !== this.runId || this.destroyed) return;
      this.hintBusy = false;
      if (res && at === this.plies && this.chess.turn() === "w") {
        this.hint = { from: res.from as Square, to: res.to as Square, t: 0 };
        const sp = this.sprites.get(res.from as Square);
        if (sp) this.wiggle(sp);
      }
      this.emit();
    });
  }

  // ───────────────────────── game end ─────────────────────────

  private beginEnd(info: EndInfo) {
    if (this.phase === "ending" || this.phase === "over") return;
    this.phase = "ending";
    this.thinking = false;
    this.aiMove = null;
    this.runId++;
    this.ai.cancel();
    this.cancelDrag();
    this.clearSelectionQuiet();
    this.promo = null;
    this.cb.onPromotion(false);
    this.hint = null;
    const T = this.tile;
    const C = this.S / 2;
    let wait = 1.0;

    const shatterKing = (color: Color) => {
      for (const [sq, s] of this.sprites) {
        if (s.type === "k" && s.color === color) {
          const cr = sqToCR(sq);
          const p = this.center(cr.c, cr.r);
          const th = THEMES[color];
          this.particles.shards(p.x, p.y, 70, [th.rim, th.mid, th.top, "#ffffff"], T, 1.6);
          this.particles.sparks(p.x, p.y, 50, [th.rim, "#fff", GOLD], T, 1.5);
          this.particles.ring(p.x, p.y, T * 3.4, th.rim, 0.9);
          this.particles.ring(p.x, p.y, T * 2.0, "#fff", 0.6);
          this.particles.ring(p.x, p.y, T * 5, GOLD, 1.2);
          this.sprites.delete(sq);
          return p;
        }
      }
      return null;
    };

    if (info.reason === "checkmate") {
      this.checkSq = null;
      this.hitStop = 0.24;
      this.slowmo = 1.1;
      this.shake(1);
      this.flash(0.85, "#ffffff");
      this.banner("CHECKMATE", GOLD, 0.115, undefined, 2.4);
      sfx.mate();
      vibrate([60, 40, 120]);
      shatterKing(info.outcome === "win" ? "b" : "w");
      if (info.outcome === "win") this.particles.confetti(C, -T, 130, this.S, [GOLD, CYAN, PINK, "#fff"], T, true);
      wait = 1.9;
    } else if (info.reason === "timeout") {
      this.shake(0.5);
      this.flash(0.4, RED);
      this.banner("TIME!", RED, 0.13, undefined, 1.6);
      sfx.mate();
      wait = 1.3;
    } else if (info.reason === "resign") {
      this.shake(0.5);
      shatterKing("w");
      this.banner("RESIGNED", RED, 0.095, undefined, 1.2);
      wait = 0.9;
    } else {
      this.banner(info.reason === "stalemate" ? "STALEMATE" : "DRAW", CYAN, 0.1, undefined, 1.6);
      this.shake(0.2);
      this.particles.ring(C, C, this.S * 0.5, CYAN, 0.9);
      wait = 1.2;
    }
    this.emit();
    this.later(wait, () => this.finish(info));
  }

  private finish(info: EndInfo) {
    if (this.phase === "over") return;
    this.phase = "over";
    const dm = DIFFICULTIES[this.settings.difficulty].mult;
    const bonuses: { label: string; value: number }[] = [];
    const fullMoves = Math.ceil(this.plies / 2);
    if (info.outcome === "win") {
      bonuses.push({ label: info.reason === "timeout" ? "Flagged the bot" : "Checkmate", value: Math.round((info.reason === "timeout" ? 3000 : 5000) * dm) });
      const speed = Math.max(0, 60 - fullMoves) * 50;
      if (speed > 0) bonuses.push({ label: `Speed · ${fullMoves} ${fullMoves === 1 ? "move" : "moves"}`, value: Math.round(speed * dm) });
      if (this.settings.clock && this.clock.player > 0) bonuses.push({ label: "Time left", value: Math.round(Math.floor(this.clock.player) * 10 * dm) });
      if (this.hints === 0) bonuses.push({ label: "No hints", value: Math.round(500 * dm) });
    } else if (info.outcome === "draw") {
      bonuses.push({ label: "Draw", value: Math.round(1000 * dm) });
    }
    const finalScore = this.score + bonuses.reduce((a, b) => a + b.value, 0);

    const names: Record<EndInfo["reason"], string> = {
      checkmate: "Checkmate",
      stalemate: "Stalemate",
      repetition: "Threefold repetition",
      insufficient: "Insufficient material",
      fifty: "Fifty-move rule",
      timeout: "Time",
      resign: "Resignation",
    };
    let title = "DRAW";
    let subtitle = names[info.reason];
    if (info.outcome === "win") {
      title = "VICTORY";
      subtitle = info.reason === "timeout" ? `${AI_NAME} ran out of time` : `Checkmate — ${AI_NAME} falls`;
    } else if (info.outcome === "loss") {
      title = info.reason === "timeout" ? "TIME'S UP" : info.reason === "resign" ? "RESIGNED" : "DEFEATED";
      subtitle = info.reason === "timeout" ? "Your clock hit zero" : info.reason === "resign" ? "You laid down your king" : `Checkmated by ${AI_NAME}`;
    }
    if (info.outcome === "win") sfx.win();
    else if (info.outcome === "loss") sfx.lose();
    else sfx.draw();

    this.score = finalScore;
    this.cb.onOver({
      outcome: info.outcome,
      reason: info.reason,
      title,
      subtitle,
      baseScore: finalScore - bonuses.reduce((a, b) => a + b.value, 0),
      bonuses,
      finalScore,
      stats: { moves: fullMoves, captures: this.captures, lost: this.lost, maxCombo: this.maxCombo, seconds: Math.round(this.elapsed), hints: this.hints },
    });
    this.emit();
  }

  // ───────────────────────── frame loop ─────────────────────────

  private frame = (now: number) => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.frame);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt <= 0) return;
    dt = Math.min(dt, 1 / 20);

    // adaptive quality
    this.avgDt = this.avgDt * 0.94 + dt * 0.06;
    if (this.avgDt > 1 / 38 && this.particles.scale > 0.35) {
      if (++this.slowFrames > 90) {
        this.particles.scale = Math.max(0.35, this.particles.scale * 0.65);
        this.slowFrames = 0;
      }
    } else this.slowFrames = 0;

    if (this.S > 0) {
      this.update(dt);
      this.render();
    }
  };

  private update(dt: number) {
    if (this.paused) return;
    this.time += dt;
    this.boardIn = Math.min(1, this.boardIn + dt / 0.45);

    // slow-mo / hit-stop
    let ts = 1;
    if (this.slowmo > 0) {
      this.slowmo -= dt;
      ts = 0.32;
    }
    this.timeScale += (ts - this.timeScale) * Math.min(1, dt * 9);
    const gdt = dt * this.timeScale;
    let tdt = gdt;
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      tdt = 0;
    }

    // real-time timers
    if (this.timers.length) {
      const due: (() => void)[] = [];
      this.timers = this.timers.filter((t) => {
        t.t -= dt;
        if (t.t <= 0) {
          due.push(t.fn);
          return false;
        }
        return true;
      });
      due.forEach((f) => f());
    }

    // tweens
    if (tdt > 0) this.updateTweens(tdt);
    this.particles.update(gdt);
    for (const b of this.banners) b.t += gdt;
    if (this.banners.length) this.banners = this.banners.filter((b) => b.t < b.dur);
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    this.flashA = Math.max(0, this.flashA - dt * 2.6);
    if (this.hint) {
      this.hint.t += dt;
      if (this.hint.t > 6) this.hint = null;
    }

    // moving sprites: trail + dust
    for (const s of this.sprites.values()) {
      if (s.moving) {
        s.trail.push({ x: s.x, y: s.y - s.z * 0.34 });
        if (s.trail.length > 6) s.trail.shift();
        if (!s.dragging && Math.random() < 0.55 * this.particles.scale && tdt > 0) {
          const p = this.center(s.x, s.y);
          this.particles.dust(p.x, p.y + this.tile * 0.36, 1, this.tile * 0.7);
        }
      }
    }

    // clocks
    if (this.phase === "play") {
      if (this.clock.started) this.elapsed += dt;
      if (CLOCKS[this.settings.clock].secs && this.clock.started && !this.promo) {
        const turn = this.chess.turn();
        if (turn === "w") this.clock.player -= dt;
        else this.clock.ai -= dt;
        const cur = turn === "w" ? this.clock.player : this.clock.ai;
        const sec = Math.ceil(cur);
        if (sec !== this.lastEmitSec) {
          this.lastEmitSec = sec;
          if (turn === "w" && sec <= 10 && sec > 0) sfx.tick();
          this.emit();
        }
        if (this.clock.player <= 0) {
          this.clock.player = 0;
          this.beginEnd({ outcome: "loss", reason: "timeout" });
        } else if (this.clock.ai <= 0) {
          this.clock.ai = 0;
          this.beginEnd({ outcome: "win", reason: "timeout" });
        }
      }

      // AI move delivery
      if (this.aiMove && this.busy === 0 && this.time >= this.aiReadyAt && this.chess.turn() === "b") {
        const m = this.aiMove;
        this.aiMove = null;
        this.thinking = false;
        this.applyMove(m, "ai");
      }

      // idle nudge
      if (this.canAct() && !this.selected && !this.drag && !this.hint) {
        this.idleT += dt;
        if (this.idleT > (this.plies === 0 ? 3.2 : 7)) {
          this.idleT = 0;
          this.nudge();
        }
      } else this.idleT = 0;
    }
  }

  private nudge() {
    const moves = this.chess.moves({ verbose: true });
    if (!moves.length) return;
    const m = this.plies === 0 ? moves.find((x) => x.from === "e2") ?? moves[0] : moves[Math.floor(Math.random() * moves.length)];
    const s = this.sprites.get(m.from);
    if (!s || s.moving || s.dragging) return;
    const c = this.center(sqToCR(m.from).c, sqToCR(m.from).r);
    this.particles.ring(c.x, c.y, this.tile * 0.7, CYAN, 0.5);
    this.tween(
      0.5,
      (_k, raw) => {
        s.z = Math.sin(raw * Math.PI) * 0.55;
      },
      {
        ease: linear,
        done: () => {
          if (!s.moving && !s.dragging) s.z = 0;
          this.squash(s, 0.14);
        },
      },
    );
    sfx.tick();
  }

  private updateTweens(dt: number) {
    const list = this.tweens;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const tw = list[i];
      if (tw.delay > 0) {
        tw.delay -= dt;
        if (tw.delay > 0) {
          list[w++] = tw;
          continue;
        }
        tw.t += -tw.delay;
        tw.delay = 0;
      } else tw.t += dt;
      const raw = clamp(tw.t / tw.dur, 0, 1);
      tw.update(tw.ease(raw), raw);
      if (raw >= 1) tw.done?.();
      else list[w++] = tw;
    }
    list.length = w;
  }

  // ───────────────────────── rendering ─────────────────────────

  private render() {
    const ctx = this.ctx;
    const { S, dpr, tile, pad } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, S, S);
    ctx.save();

    const tr = this.trauma * this.trauma;
    let dx = 0;
    let dy = 0;
    let rot = 0;
    if (tr > 0.0004) {
      dx = (Math.random() * 2 - 1) * tr * S * 0.04;
      dy = (Math.random() * 2 - 1) * tr * S * 0.04;
      rot = (Math.random() * 2 - 1) * tr * 0.035;
    }
    const zi = 0.93 + 0.07 * easeOutCubic(this.boardIn);
    ctx.translate(S / 2 + dx, S / 2 + dy);
    ctx.rotate(rot);
    ctx.scale(zi, zi);
    ctx.translate(-S / 2, -S / 2);
    ctx.globalAlpha = easeOutCubic(this.boardIn);

    if (this.boardImg) ctx.drawImage(this.boardImg, 0, 0, S, S);

    const t = this.time;

    // last move
    if (this.lastMove) {
      ctx.fillStyle = "rgba(255,210,61,0.15)";
      for (const q of [this.lastMove.from, this.lastMove.to]) ctx.fillRect(pad + q.c * tile, pad + q.r * tile, tile, tile);
    }
    // check glow
    if (this.checkSq) {
      const a = 0.3 + 0.2 * Math.sin(t * 9);
      ctx.fillStyle = `rgba(255,69,96,${a})`;
      ctx.fillRect(pad + this.checkSq.c * tile, pad + this.checkSq.r * tile, tile, tile);
    }
    // hover
    if (this.hover && !this.kbMode && this.phase === "play" && !this.drag?.active) {
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(pad + this.hover.c * tile, pad + this.hover.r * tile, tile, tile);
    }
    // selected + targets
    if (this.selected) {
      const q = sqToCR(this.selected);
      ctx.fillStyle = "rgba(61,240,255,0.22)";
      ctx.fillRect(pad + q.c * tile, pad + q.r * tile, tile, tile);
      ctx.strokeStyle = "rgba(61,240,255,0.9)";
      ctx.lineWidth = 2;
      ctx.strokeRect(pad + q.c * tile + 1, pad + q.r * tile + 1, tile - 2, tile - 2);
      const pulse = 0.5 + 0.5 * Math.sin(t * 6);
      const seen = new Set<string>();
      for (const m of this.targets) {
        if (seen.has(m.to)) continue;
        seen.add(m.to);
        const c = sqToCR(m.to);
        const cx = pad + (c.c + 0.5) * tile;
        const cy = pad + (c.r + 0.5) * tile;
        const hov = this.hover && this.hover.c === c.c && this.hover.r === c.r;
        if (m.captured) {
          ctx.fillStyle = `rgba(255,79,216,${0.14 + 0.1 * pulse})`;
          ctx.fillRect(pad + c.c * tile, pad + c.r * tile, tile, tile);
          ctx.strokeStyle = `rgba(255,79,216,${0.7 + 0.3 * pulse})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy, tile * (0.43 + 0.015 * pulse), 0, 6.283);
          ctx.stroke();
        } else {
          ctx.fillStyle = `rgba(61,240,255,${0.5 + 0.3 * pulse})`;
          ctx.beginPath();
          ctx.arc(cx, cy, tile * (hov ? 0.2 : 0.13 + 0.015 * pulse), 0, 6.283);
          ctx.fill();
        }
        if (hov) {
          ctx.fillStyle = "rgba(61,240,255,0.18)";
          ctx.fillRect(pad + c.c * tile, pad + c.r * tile, tile, tile);
        }
      }
    }
    // hint arrow
    if (this.hint) this.drawHint(ctx);
    // keyboard cursor
    if (this.kbMode && this.phase === "play") {
      const x = pad + this.cursor.c * tile;
      const y = pad + this.cursor.r * tile;
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 3;
      ctx.setLineDash([tile * 0.16, tile * 0.1]);
      ctx.lineDashOffset = -t * 20;
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 8);
      ctx.strokeRect(x + 3, y + 3, tile - 6, tile - 6);
      ctx.setLineDash([]);
      ctx.globalAlpha = easeOutCubic(this.boardIn);
    }

    this.drawPieces(ctx);
    this.particles.draw(ctx);
    this.drawBanners(ctx);
    ctx.restore();

    // screen flash + check vignette
    if (this.flashA > 0.003) {
      ctx.globalAlpha = Math.min(0.9, this.flashA);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, S, S);
      ctx.globalAlpha = 1;
    }
    if (this.checkSq && this.vignetteImg && this.phase === "play") {
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 7);
      ctx.drawImage(this.vignetteImg, 0, 0, S, S);
      ctx.globalAlpha = 1;
    }
  }

  private drawHint(ctx: CanvasRenderingContext2D) {
    const h = this.hint!;
    const a = sqToCR(h.from);
    const b = sqToCR(h.to);
    const p1 = this.center(a.c, a.r);
    const p2 = this.center(b.c, b.r);
    const pulse = 0.65 + 0.35 * Math.sin(this.time * 7);
    const fade = h.t > 5 ? 1 - (h.t - 5) : 1;
    ctx.globalAlpha = pulse * fade;
    ctx.fillStyle = "rgba(255,210,61,0.25)";
    ctx.fillRect(this.pad + a.c * this.tile, this.pad + a.r * this.tile, this.tile, this.tile);
    ctx.fillRect(this.pad + b.c * this.tile, this.pad + b.r * this.tile, this.tile, this.tile);
    const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const head = this.tile * 0.34;
    const sx = p1.x + Math.cos(ang) * this.tile * 0.25;
    const sy = p1.y + Math.sin(ang) * this.tile * 0.25;
    const ex = p2.x - Math.cos(ang) * head * 0.6;
    const ey = p2.y - Math.sin(ang) * head * 0.6;
    ctx.strokeStyle = GOLD;
    ctx.fillStyle = GOLD;
    ctx.lineWidth = this.tile * 0.1;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(p2.x - Math.cos(ang - 0.5) * head, p2.y - Math.sin(ang - 0.5) * head);
    ctx.lineTo(p2.x - Math.cos(ang + 0.5) * head, p2.y - Math.sin(ang + 0.5) * head);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = easeOutCubic(this.boardIn);
  }

  private drawPieces(ctx: CanvasRenderingContext2D) {
    const { tile, pad, cacheCss } = this;
    const base = tile * 0.378;
    const t = this.time;
    const baseAlpha = easeOutCubic(this.boardIn);

    const visualZ = (s: Sprite) => (s.sel && !s.moving && !s.dragging ? Math.max(s.z, 0.16 + 0.05 * Math.sin(t * 6)) : s.z);

    // shadows
    ctx.fillStyle = "#000";
    const shadow = (s: Sprite) => {
      if (s.y < -0.3) return;
      const z = visualZ(s);
      const cx = pad + (s.x + 0.5) * tile;
      const cy = pad + (s.y + z * 0.34 + 0.5) * tile;
      ctx.globalAlpha = 0.38 * (1 - Math.min(0.6, z * 0.5)) * s.alpha * baseAlpha;
      ctx.beginPath();
      ctx.ellipse(cx + z * tile * 0.06, cy + base - tile * 0.015, tile * 0.3 * (1 - z * 0.15), tile * 0.085, 0, 0, 6.283);
      ctx.fill();
    };
    for (const s of this.sprites.values()) shadow(s);
    for (const s of this.dying) shadow(s);

    const drawSprite = (s: Sprite) => {
      const img = this.pieceImgs[s.color + s.type];
      if (!img) return;
      const z = visualZ(s);
      const cx = pad + (s.x + 0.5) * tile;
      const cy = pad + (s.y + 0.5) * tile;
      // afterimage trail
      if (s.moving && s.trail.length > 1) {
        for (let i = 0; i < s.trail.length - 1; i++) {
          const q = s.trail[i];
          ctx.globalAlpha = ((i + 1) / s.trail.length) * 0.22 * baseAlpha;
          ctx.drawImage(img, pad + (q.x + 0.5) * tile - cacheCss / 2, pad + (q.y + 0.5) * tile - cacheCss / 2, cacheCss, cacheCss);
        }
      }
      if (s.sel && !s.moving) {
        ctx.globalAlpha = 0.35 * baseAlpha;
        ctx.fillStyle = CYAN;
        ctx.beginPath();
        ctx.ellipse(cx, cy + base, tile * 0.38, tile * 0.12, 0, 0, 6.283);
        ctx.fill();
      }
      const sc = 1 + z * 0.16;
      ctx.save();
      ctx.globalAlpha = s.alpha * baseAlpha;
      ctx.translate(cx, cy + base - z * tile * 0.34);
      ctx.rotate(s.rot);
      ctx.scale(s.sx * sc, s.sy * sc);
      ctx.drawImage(img, -cacheCss / 2, -cacheCss / 2 - base, cacheCss, cacheCss);
      ctx.restore();
    };

    for (const s of this.dying) drawSprite(s);
    for (const s of this.sprites.values()) if (!s.moving && !s.dragging && s.z < 0.01) drawSprite(s);
    for (const s of this.sprites.values()) if (s.moving || s.dragging || s.z >= 0.01) drawSprite(s);
    ctx.globalAlpha = 1;
  }

  private drawBanners(ctx: CanvasRenderingContext2D) {
    const n = this.banners.length;
    for (let i = 0; i < n; i++) {
      const b = this.banners[i];
      const age = b.t / b.dur;
      const pop = age < 0.14 ? easeOutBack(age / 0.14) : 1;
      const a = age > 0.72 ? Math.max(0, (1 - age) / 0.28) : 1;
      const size = Math.max(1, b.size * this.S * pop);
      const y = this.S * 0.42 - (n - 1 - i) * this.S * 0.1 + (1 - a) * -10;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      // neon halo behind the lettering
      ctx.font = `900 ${Math.round(size * 1.1)}px ${FONT}`;
      ctx.lineWidth = size * 0.3;
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = a * 0.22;
      ctx.strokeText(b.text, this.S / 2, y);
      // dark outline + fill
      ctx.globalAlpha = a;
      ctx.font = `900 ${Math.round(size)}px ${FONT}`;
      ctx.lineWidth = size * 0.2;
      ctx.strokeStyle = "rgba(6,8,30,0.92)";
      ctx.strokeText(b.text, this.S / 2, y);
      ctx.fillStyle = b.color;
      ctx.fillText(b.text, this.S / 2, y);
      if (b.sub) {
        ctx.font = `700 ${Math.round(size * 0.36)}px ${FONT}`;
        ctx.lineWidth = size * 0.1;
        ctx.strokeText(b.sub, this.S / 2, y + size * 0.78);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(b.sub, this.S / 2, y + size * 0.78);
      }
      ctx.restore();
    }
  }
}
