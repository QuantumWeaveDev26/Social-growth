/** In-memory sliding-window limiter (single web process). */
const hits = new Map<string, number[]>();

export function limited(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  hits.set(key, list);
  return list.length >= max;
}
export function hit(key: string) {
  hits.set(key, [...(hits.get(key) || []), Date.now()]);
}
export function clear(key: string) {
  hits.delete(key);
}
