/* Compact 0x88 chess engine: pseudo-legal movegen, alpha-beta, quiescence, PSTs.
   Rules authority in the UI is chess.js – every move produced here is re-validated there. */

export interface SearchRequest {
  fen: string;
  /** 0 = Rookie, 1 = Knight, 2 = Master, 3 = hint */
  level: number;
  /** position keys (board side castling) previously seen, for repetition avoidance */
  history?: string[];
}

export interface SearchResult {
  from: string;
  to: string;
  promotion?: string;
  score: number;
  depth: number;
  nodes: number;
}

const P = 1,
  N = 2,
  B = 3,
  R = 4,
  Q = 5,
  K = 6;
const VAL = [0, 100, 320, 330, 500, 900, 0];
const MATE = 30000;
const INF = 1e9;

const KN = [-33, -31, -18, -14, 14, 18, 31, 33];
const KG = [-17, -16, -15, -1, 1, 15, 16, 17];
const BD = [-17, -15, 15, 17];
const RD = [-16, -1, 1, 16];

// piece-square tables (rank 8 first, white's perspective)
const PST: number[][] = [
  [],
  [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
  [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
  [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
  [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
  [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
  [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
];
const KING_END = [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50];

// move encoding: from | to<<8 | promo<<16 | flag<<20  (flags: 1 ep, 2 castle, 4 double push)
const b = new Int8Array(128);
let side = 1;
let castle = 0; // 1 WK, 2 WQ, 4 BK, 8 BQ
let ep = -1;
const ksq = [0, 0, 0]; // index by (side===1?1:2)... we use kIdx()
const kIdx = (s: number) => (s === 1 ? 0 : 1);

const castleMask = new Int8Array(128).fill(15);
castleMask[116] = 15 & ~3;
castleMask[119] = 15 & ~1;
castleMask[112] = 15 & ~2;
castleMask[4] = 15 & ~12;
castleMask[7] = 15 & ~4;
castleMask[0] = 15 & ~8;

// undo stack
const uMove: number[] = [];
const uCap: number[] = [];
const uCastle: number[] = [];
const uEp: number[] = [];

function loadFen(fen: string) {
  b.fill(0);
  const [board, stm, cs, eps] = fen.split(" ");
  const rows = board.split("/");
  const map: Record<string, number> = { p: P, n: N, b: B, r: R, q: Q, k: K };
  for (let r = 0; r < 8; r++) {
    let c = 0;
    for (const ch of rows[r]) {
      if (ch >= "1" && ch <= "8") c += +ch;
      else {
        const lower = ch.toLowerCase();
        const sq = r * 16 + c;
        const v = map[lower];
        b[sq] = ch === lower ? -v : v;
        if (v === K) ksq[ch === lower ? 1 : 0] = sq;
        c++;
      }
    }
  }
  side = stm === "w" ? 1 : -1;
  castle = 0;
  if (cs.includes("K")) castle |= 1;
  if (cs.includes("Q")) castle |= 2;
  if (cs.includes("k")) castle |= 4;
  if (cs.includes("q")) castle |= 8;
  ep = eps && eps !== "-" ? (8 - +eps[1]) * 16 + (eps.charCodeAt(0) - 97) : -1;
  uMove.length = 0;
  uCap.length = 0;
  uCastle.length = 0;
  uEp.length = 0;
}

function boardKey(): string {
  const L = " PNBRQK";
  let s = "";
  for (let r = 0; r < 8; r++) {
    let e = 0;
    for (let c = 0; c < 8; c++) {
      const v = b[r * 16 + c];
      if (!v) e++;
      else {
        if (e) {
          s += e;
          e = 0;
        }
        const ch = L[Math.abs(v)];
        s += v > 0 ? ch : ch.toLowerCase();
      }
    }
    if (e) s += e;
    if (r < 7) s += "/";
  }
  let cs = "";
  if (castle & 1) cs += "K";
  if (castle & 2) cs += "Q";
  if (castle & 4) cs += "k";
  if (castle & 8) cs += "q";
  return `${s} ${side === 1 ? "w" : "b"} ${cs || "-"}`;
}

function attacked(sq: number, by: number): boolean {
  let s: number;
  if (by === 1) {
    s = sq + 15;
    if (!(s & 0x88) && b[s] === P) return true;
    s = sq + 17;
    if (!(s & 0x88) && b[s] === P) return true;
  } else {
    s = sq - 15;
    if (!(s & 0x88) && b[s] === -P) return true;
    s = sq - 17;
    if (!(s & 0x88) && b[s] === -P) return true;
  }
  const n = N * by;
  for (let i = 0; i < 8; i++) {
    s = sq + KN[i];
    if (!(s & 0x88) && b[s] === n) return true;
  }
  const k = K * by;
  for (let i = 0; i < 8; i++) {
    s = sq + KG[i];
    if (!(s & 0x88) && b[s] === k) return true;
  }
  const bi = B * by,
    qu = Q * by,
    ro = R * by;
  for (let i = 0; i < 4; i++) {
    const d = BD[i];
    s = sq + d;
    while (!(s & 0x88)) {
      const v = b[s];
      if (v) {
        if (v === bi || v === qu) return true;
        break;
      }
      s += d;
    }
  }
  for (let i = 0; i < 4; i++) {
    const d = RD[i];
    s = sq + d;
    while (!(s & 0x88)) {
      const v = b[s];
      if (v) {
        if (v === ro || v === qu) return true;
        break;
      }
      s += d;
    }
  }
  return false;
}

const inCheck = (s: number) => attacked(ksq[kIdx(s)], -s);

function gen(s: number, caps: boolean, out: number[]) {
  const dir = s === 1 ? -16 : 16;
  const startRow = s === 1 ? 6 : 1;
  const promoRow = s === 1 ? 0 : 7;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) {
      sq += 7;
      continue;
    }
    const p = b[sq];
    if (p * s <= 0) continue;
    const t = p * s;
    if (t === P) {
      let to = sq + dir;
      if (!(to & 0x88) && b[to] === 0) {
        if (to >> 4 === promoRow) {
          out.push(sq | (to << 8) | (Q << 16));
          if (!caps) {
            out.push(sq | (to << 8) | (N << 16));
            out.push(sq | (to << 8) | (R << 16));
            out.push(sq | (to << 8) | (B << 16));
          }
        } else if (!caps) {
          out.push(sq | (to << 8));
          if (sq >> 4 === startRow && b[to + dir] === 0) out.push(sq | ((to + dir) << 8) | (4 << 20));
        }
      }
      for (let k = -1; k <= 1; k += 2) {
        to = sq + dir + k;
        if (to & 0x88) continue;
        if (b[to] * s < 0) {
          if (to >> 4 === promoRow) {
            out.push(sq | (to << 8) | (Q << 16));
            if (!caps) {
              out.push(sq | (to << 8) | (N << 16));
              out.push(sq | (to << 8) | (R << 16));
              out.push(sq | (to << 8) | (B << 16));
            }
          } else out.push(sq | (to << 8));
        } else if (to === ep && b[to] === 0) {
          out.push(sq | (to << 8) | (1 << 20));
        }
      }
    } else if (t === N || t === K) {
      const offs = t === N ? KN : KG;
      for (let i = 0; i < 8; i++) {
        const to = sq + offs[i];
        if (to & 0x88) continue;
        const v = b[to];
        if (v * s > 0) continue;
        if (caps && v === 0) continue;
        out.push(sq | (to << 8));
      }
    } else {
      const start = t === R ? 4 : 0;
      const end = t === B ? 4 : 8;
      for (let i = start; i < end; i++) {
        const d = i < 4 ? BD[i] : RD[i - 4];
        let to = sq + d;
        while (!(to & 0x88)) {
          const v = b[to];
          if (v === 0) {
            if (!caps) out.push(sq | (to << 8));
          } else {
            if (v * s < 0) out.push(sq | (to << 8));
            break;
          }
          to += d;
        }
      }
    }
  }
  if (caps) return;
  // castling
  if (s === 1) {
    if (castle & 1 && b[116] === K && b[119] === R && !b[117] && !b[118] && !attacked(116, -1) && !attacked(117, -1) && !attacked(118, -1))
      out.push(116 | (118 << 8) | (2 << 20));
    if (castle & 2 && b[116] === K && b[112] === R && !b[115] && !b[114] && !b[113] && !attacked(116, -1) && !attacked(115, -1) && !attacked(114, -1))
      out.push(116 | (114 << 8) | (2 << 20));
  } else {
    if (castle & 4 && b[4] === -K && b[7] === -R && !b[5] && !b[6] && !attacked(4, 1) && !attacked(5, 1) && !attacked(6, 1))
      out.push(4 | (6 << 8) | (2 << 20));
    if (castle & 8 && b[4] === -K && b[0] === -R && !b[3] && !b[2] && !b[1] && !attacked(4, 1) && !attacked(3, 1) && !attacked(2, 1))
      out.push(4 | (2 << 8) | (2 << 20));
  }
}

function make(m: number): boolean {
  const from = m & 0xff;
  const to = (m >> 8) & 0xff;
  const promo = (m >> 16) & 15;
  const flag = m >> 20;
  const s = side;
  const p = b[from];
  let cap = b[to];
  uMove.push(m);
  uCastle.push(castle);
  uEp.push(ep);
  b[to] = promo ? promo * s : p;
  b[from] = 0;
  if (flag & 1) {
    const cs = to - (s === 1 ? -16 : 16);
    cap = b[cs];
    b[cs] = 0;
  } else if (flag & 2) {
    if (to > from) {
      b[to - 1] = b[to + 1];
      b[to + 1] = 0;
    } else {
      b[to + 1] = b[to - 2];
      b[to - 2] = 0;
    }
  }
  uCap.push(cap);
  ep = flag & 4 ? (from + to) >> 1 : -1;
  castle &= castleMask[from] & castleMask[to];
  if (Math.abs(p) === K) ksq[kIdx(s)] = to;
  side = -s;
  if (inCheck(s)) {
    unmake();
    return false;
  }
  return true;
}

function unmake() {
  const m = uMove.pop()!;
  const cap = uCap.pop()!;
  castle = uCastle.pop()!;
  ep = uEp.pop()!;
  side = -side;
  const s = side;
  const from = m & 0xff;
  const to = (m >> 8) & 0xff;
  const promo = (m >> 16) & 15;
  const flag = m >> 20;
  const moved = promo ? P * s : b[to];
  b[from] = moved;
  if (flag & 1) {
    b[to] = 0;
    b[to - (s === 1 ? -16 : 16)] = cap;
  } else {
    b[to] = cap;
    if (flag & 2) {
      if (to > from) {
        b[to + 1] = b[to - 1];
        b[to - 1] = 0;
      } else {
        b[to - 2] = b[to + 1];
        b[to + 1] = 0;
      }
    }
  }
  if (Math.abs(moved) === K) ksq[kIdx(s)] = from;
}

function evaluate(): number {
  let score = 0;
  let nonPawn = 0;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) {
      sq += 7;
      continue;
    }
    const v = b[sq];
    if (!v) continue;
    const t = Math.abs(v);
    if (t !== P && t !== K) nonPawn += VAL[t];
  }
  const endgame = nonPawn < 1400;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) {
      sq += 7;
      continue;
    }
    const v = b[sq];
    if (!v) continue;
    const t = Math.abs(v);
    const row = sq >> 4;
    const col = sq & 7;
    const idx = v > 0 ? row * 8 + col : (7 - row) * 8 + col;
    const table = t === K && endgame ? KING_END : PST[t];
    const val = VAL[t] + table[idx];
    score += v > 0 ? val : -val;
  }
  return side === 1 ? score : -score;
}

// ---------- search state ----------
let nodes = 0;
let deadline = 0;
let stopped = false;
const killers: number[][] = Array.from({ length: 64 }, () => [0, 0]);
const hist = new Int32Array(128 * 128);

function scoreMove(m: number, ply: number): number {
  const from = m & 0xff;
  const to = (m >> 8) & 0xff;
  const promo = (m >> 16) & 15;
  const flag = m >> 20;
  let s = 0;
  const victim = flag & 1 ? P : Math.abs(b[to]);
  if (victim) s = 10000 + VAL[victim] * 10 - VAL[Math.abs(b[from])] / 10;
  else if (m === killers[ply][0]) s = 9000;
  else if (m === killers[ply][1]) s = 8000;
  else s = hist[from * 128 + to];
  if (promo) s += 9500 + VAL[promo];
  return s;
}

function orderMoves(moves: number[], ply: number, first = 0) {
  const scores = moves.map((m) => (m === first ? 1e7 : scoreMove(m, ply)));
  const idx = moves.map((_, i) => i).sort((x, y) => scores[y] - scores[x]);
  const sorted = idx.map((i) => moves[i]);
  for (let i = 0; i < moves.length; i++) moves[i] = sorted[i];
}

function qsearch(alpha: number, beta: number, ply: number): number {
  nodes++;
  if ((nodes & 2047) === 0 && Date.now() > deadline) stopped = true;
  if (stopped) return 0;
  const stand = evaluate();
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  if (ply > 30) return stand;
  const moves: number[] = [];
  gen(side, true, moves);
  orderMoves(moves, ply);
  for (let i = 0; i < moves.length; i++) {
    if (!make(moves[i])) continue;
    const sc = -qsearch(-beta, -alpha, ply + 1);
    unmake();
    if (stopped) return 0;
    if (sc >= beta) return sc;
    if (sc > alpha) alpha = sc;
  }
  return alpha;
}

function negamax(depth: number, alpha: number, beta: number, ply: number): number {
  nodes++;
  if ((nodes & 2047) === 0 && Date.now() > deadline) stopped = true;
  if (stopped) return 0;
  const chk = inCheck(side);
  if (chk && ply < 40) depth++;
  if (depth <= 0) return qsearch(alpha, beta, ply);
  const moves: number[] = [];
  gen(side, false, moves);
  orderMoves(moves, ply);
  let legal = 0;
  let best = -INF;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const isQuiet = !(m >> 20 & 1) && b[(m >> 8) & 0xff] === 0;
    if (!make(m)) continue;
    legal++;
    const sc = -negamax(depth - 1, -beta, -alpha, ply + 1);
    unmake();
    if (stopped) return 0;
    if (sc > best) best = sc;
    if (sc > alpha) alpha = sc;
    if (alpha >= beta) {
      if (isQuiet) {
        if (killers[ply][0] !== m) {
          killers[ply][1] = killers[ply][0];
          killers[ply][0] = m;
        }
        hist[(m & 0xff) * 128 + ((m >> 8) & 0xff)] += depth * depth;
      }
      break;
    }
  }
  if (legal === 0) return chk ? -MATE + ply : 0;
  return best;
}

const LEVELS = [
  { maxDepth: 2, ms: 250, noise: 140, full: true },
  { maxDepth: 4, ms: 700, noise: 25, full: true },
  { maxDepth: 9, ms: 1600, noise: 0, full: false },
  { maxDepth: 9, ms: 900, noise: 0, full: false },
];

const sqName = (sq: number) => "abcdefgh"[sq & 7] + (8 - (sq >> 4));

export function findBestMove(req: SearchRequest): SearchResult | null {
  loadFen(req.fen);
  const cfg = LEVELS[Math.min(req.level, LEVELS.length - 1)];
  const seen = new Map<string, number>();
  for (const k of req.history ?? []) seen.set(k, (seen.get(k) ?? 0) + 1);

  nodes = 0;
  stopped = false;
  deadline = Date.now() + cfg.ms;
  for (const k of killers) {
    k[0] = 0;
    k[1] = 0;
  }
  hist.fill(0);

  let rootMoves: number[] = [];
  const pseudo: number[] = [];
  gen(side, false, pseudo);
  for (const m of pseudo) {
    if (make(m)) {
      rootMoves.push(m);
      unmake();
    }
  }
  if (!rootMoves.length) return null;

  let bestMove = rootMoves[0];
  let bestScore = -INF;
  let doneDepth = 0;
  let prevBest = 0;

  for (let depth = 1; depth <= cfg.maxDepth; depth++) {
    orderMoves(rootMoves, 0, prevBest);
    const scored: { m: number; s: number }[] = [];
    let alpha = -INF;
    const beta = INF;
    let iterBest = -INF;
    let iterMove = rootMoves[0];
    for (let i = 0; i < rootMoves.length; i++) {
      const m = rootMoves[i];
      make(m);
      let sc: number;
      const rep = seen.get(boardKey()) ?? 0;
      if (rep >= 2) sc = 0;
      else {
        sc = -negamax(depth - 1, -beta, cfg.full ? INF : -alpha, 1);
        if (rep === 1) sc -= 30;
      }
      unmake();
      if (stopped) break;
      scored.push({ m, s: sc });
      if (sc > iterBest) {
        iterBest = sc;
        iterMove = m;
      }
      if (!cfg.full && sc > alpha) alpha = sc;
    }
    if (stopped) {
      // an unfinished iteration is only trusted if the previous best was re-searched first and still leads
      break;
    }
    doneDepth = depth;
    prevBest = iterMove;
    bestMove = iterMove;
    bestScore = iterBest;
    if (cfg.noise > 0) {
      let top = -INF;
      let pick = iterMove;
      for (const e of scored) {
        const v = e.s + (Math.random() * 2 - 1) * cfg.noise;
        if (v > top) {
          top = v;
          pick = e.m;
        }
      }
      bestMove = pick;
    }
    if (Math.abs(iterBest) > MATE - 100) break; // forced mate found
    if (Date.now() > deadline) break;
  }

  const from = bestMove & 0xff;
  const to = (bestMove >> 8) & 0xff;
  const promo = (bestMove >> 16) & 15;
  return {
    from: sqName(from),
    to: sqName(to),
    promotion: promo ? " pnbrqk"[promo] : undefined,
    score: bestScore,
    depth: doneDepth,
    nodes,
  };
}

/** Debug helper: counts legal move-tree leaves (used for validating movegen). */
export function perft(fen: string, depth: number): number {
  loadFen(fen);
  const go = (d: number): number => {
    if (d === 0) return 1;
    const mv: number[] = [];
    gen(side, false, mv);
    let n = 0;
    for (const m of mv) {
      if (!make(m)) continue;
      n += go(d - 1);
      unmake();
    }
    return n;
  };
  return go(depth);
}
