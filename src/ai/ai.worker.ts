import { findBestMove, type SearchRequest } from "./search";

interface Msg extends SearchRequest {
  id: number;
}

self.onmessage = (e: MessageEvent<Msg>) => {
  const { id, ...req } = e.data;
  let result = null;
  try {
    result = findBestMove(req);
  } catch (err) {
    result = null;
  }
  (self as unknown as Worker).postMessage({ id, result });
};
