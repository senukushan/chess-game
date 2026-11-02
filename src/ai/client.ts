import AiWorker from "./ai.worker?worker&inline";
import { findBestMove, type SearchRequest, type SearchResult } from "./search";

/** Runs searches off the main thread (inline worker) with a main-thread fallback. */
export class AiClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, (r: SearchResult | null) => void>();
  private broken = false;

  constructor() {
    this.spawn();
  }

  private spawn() {
    if (this.broken) return;
    try {
      const w: Worker = new AiWorker();
      w.onmessage = (e: MessageEvent<{ id: number; result: SearchResult | null }>) => {
        const cb = this.pending.get(e.data.id);
        if (cb) {
          this.pending.delete(e.data.id);
          cb(e.data.result);
        }
      };
      w.onerror = () => {
        this.broken = true;
        this.worker?.terminate();
        this.worker = null;
        // resolve outstanding requests by recomputing on the main thread
        const entries = [...this.pending.entries()];
        this.pending.clear();
        for (const [, cb] of entries) cb(null);
      };
      this.worker = w;
    } catch {
      this.broken = true;
      this.worker = null;
    }
  }

  search(req: SearchRequest): Promise<SearchResult | null> {
    return new Promise((resolve) => {
      if (!this.worker) {
        setTimeout(() => {
          try {
            resolve(findBestMove(req));
          } catch {
            resolve(null);
          }
        }, 20);
        return;
      }
      const id = this.nextId++;
      this.pending.set(id, resolve);
      this.worker.postMessage({ id, ...req });
    });
  }

  /** Drop all in-flight work (instant restart) */
  cancel() {
    this.pending.clear();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.spawn();
    }
  }

  destroy() {
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }
}
