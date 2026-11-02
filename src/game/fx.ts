export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const rand = (a: number, b: number) => a + Math.random() * (b - a);

export const easeOutCubic = (k: number) => 1 - Math.pow(1 - k, 3);
export const easeInOutCubic = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
export const easeOutBack = (k: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
};
export const easeOutBounce = (k: number) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (k < 1 / d1) return n1 * k * k;
  if (k < 2 / d1) return n1 * (k -= 1.5 / d1) * k + 0.75;
  if (k < 2.5 / d1) return n1 * (k -= 2.25 / d1) * k + 0.9375;
  return n1 * (k -= 2.625 / d1) * k + 0.984375;
};
export const linear = (k: number) => k;

const enum Kind {
  Shard,
  Spark,
  Ring,
  Dust,
  Text,
  Confetti,
}

export interface Particle {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  drag: number;
  life: number;
  max: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
  text?: string;
  phase: number;
}

const FONT = '"Orbitron", "Trebuchet MS", system-ui, sans-serif';
const NUM_FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

export class Particles {
  list: Particle[] = [];
  /** global quantity multiplier (adaptive quality) */
  scale = 1;
  private cap = 900;

  clear() {
    this.list.length = 0;
  }

  private push(p: Particle) {
    if (this.list.length < this.cap) this.list.push(p);
  }

  private make(kind: Kind, x: number, y: number, life: number, color: string, size: number): Particle {
    return { kind, x, y, vx: 0, vy: 0, g: 0, drag: 0, life, max: life, size, rot: 0, vr: 0, color, phase: Math.random() * 6.28 };
  }

  shards(x: number, y: number, count: number, colors: string[], tile: number, power = 1) {
    const n = Math.round(count * this.scale);
    for (let i = 0; i < n; i++) {
      const p = this.make(Kind.Shard, x + rand(-tile * 0.2, tile * 0.2), y + rand(-tile * 0.2, tile * 0.2), rand(0.55, 1.1), colors[i % colors.length], tile * rand(0.05, 0.15));
      const a = rand(0, Math.PI * 2);
      const sp = tile * rand(1.5, 6) * power;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp - tile * 2.5 * power;
      p.g = tile * 16;
      p.drag = 0.9;
      p.rot = rand(0, 6.28);
      p.vr = rand(-14, 14);
      this.push(p);
    }
  }

  sparks(x: number, y: number, count: number, colors: string[], tile: number, power = 1) {
    const n = Math.round(count * this.scale);
    for (let i = 0; i < n; i++) {
      const p = this.make(Kind.Spark, x, y, rand(0.25, 0.6), colors[i % colors.length], rand(1.5, 3.4));
      const a = rand(0, Math.PI * 2);
      const sp = tile * rand(3, 10) * power;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.drag = 3.2;
      this.push(p);
    }
  }

  ring(x: number, y: number, radius: number, color: string, life = 0.45) {
    this.push(this.make(Kind.Ring, x, y, life, color, radius));
  }

  dust(x: number, y: number, count: number, tile: number, color = "#9fb4ff") {
    const n = Math.max(1, Math.round(count * this.scale));
    for (let i = 0; i < n; i++) {
      const p = this.make(Kind.Dust, x + rand(-tile * 0.25, tile * 0.25), y + rand(-tile * 0.04, tile * 0.04), rand(0.35, 0.7), color, tile * rand(0.06, 0.13));
      p.vx = rand(-tile * 0.8, tile * 0.8);
      p.vy = rand(-tile * 0.5, -tile * 0.05);
      p.drag = 2.2;
      this.push(p);
    }
  }

  text(x: number, y: number, str: string, color: string, size: number, life = 1.1) {
    const p = this.make(Kind.Text, x, y, life, color, size);
    p.text = str;
    p.vy = -size * 1.7;
    p.drag = 1.6;
    this.push(p);
  }

  confetti(x: number, y: number, count: number, w: number, colors: string[], tile: number, fromTop = false) {
    const n = Math.round(count * this.scale);
    for (let i = 0; i < n; i++) {
      const p = this.make(Kind.Confetti, x + rand(-w / 2, w / 2), y, rand(1.4, 2.6), colors[i % colors.length], tile * rand(0.07, 0.14));
      if (fromTop) {
        p.vx = rand(-tile * 0.6, tile * 0.6);
        p.vy = rand(tile * 0.5, tile * 2.5);
        p.g = tile * 2.5;
      } else {
        p.vx = rand(-tile * 5, tile * 5);
        p.vy = rand(-tile * 11, -tile * 3);
        p.g = tile * 11;
      }
      p.drag = 0.8;
      p.vr = rand(-10, 10);
      this.push(p);
    }
  }

  update(dt: number) {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.life -= dt;
      if (p.life <= 0) {
        l[i] = l[l.length - 1];
        l.pop();
        continue;
      }
      if (p.drag) {
        const d = Math.exp(-p.drag * dt);
        p.vx *= d;
        if (p.kind !== Kind.Confetti && p.kind !== Kind.Shard) p.vy *= d;
        else p.vy *= Math.exp(-p.drag * 0.3 * dt);
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const l = this.list;
    // pass 1: normal blend
    for (let i = 0; i < l.length; i++) {
      const p = l[i];
      const f = p.life / p.max;
      switch (p.kind) {
        case Kind.Shard: {
          ctx.globalAlpha = Math.min(1, f * 2.2);
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          ctx.moveTo(-p.size * 0.6, -p.size * 0.4);
          ctx.lineTo(p.size * 0.7, -p.size * 0.1);
          ctx.lineTo(-p.size * 0.1, p.size * 0.6);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        }
        case Kind.Dust: {
          ctx.globalAlpha = f * 0.32;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1 + (1 - f) * 1.8), 0, 6.283);
          ctx.fill();
          break;
        }
        case Kind.Confetti: {
          ctx.globalAlpha = Math.min(1, f * 2);
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x + Math.sin(p.phase + p.life * 5) * 8, p.y);
          ctx.rotate(p.rot);
          ctx.scale(1, Math.cos(p.phase + p.life * 9));
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
          break;
        }
        case Kind.Text: {
          const age = 1 - f;
          const pop = age < 0.15 ? easeOutBack(age / 0.15) : 1;
          ctx.globalAlpha = f < 0.3 ? f / 0.3 : 1;
          ctx.font = `900 ${Math.round(p.size * pop)}px ${NUM_FONT}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.lineJoin = "round";
          ctx.lineWidth = Math.max(3, p.size * 0.18);
          ctx.strokeStyle = "rgba(6,8,30,0.95)";
          ctx.strokeText(p.text!, p.x, p.y);
          ctx.fillStyle = p.color;
          ctx.fillText(p.text!, p.x, p.y);
          break;
        }
        default:
          break;
      }
    }
    // pass 2: additive glow
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < l.length; i++) {
      const p = l[i];
      const f = p.life / p.max;
      if (p.kind === Kind.Spark) {
        ctx.globalAlpha = Math.min(1, f * 1.6);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * (0.4 + f);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045);
        ctx.stroke();
      } else if (p.kind === Kind.Ring) {
        const k = easeOutCubic(1 - f);
        ctx.globalAlpha = f;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1 + 6 * f;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, p.size * k), 0, 6.283);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }
}

export { FONT };
