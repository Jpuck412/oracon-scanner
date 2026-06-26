/**
 * Rolling in-memory price history buffer, keyed by ticker symbol.
 * Supplies M1 / M3 / M5 (midpoints N minutes ago) to the momentum
 * formula in marketMath.ts. Each engine tick should call recordTick()
 * once per symbol, then getMidpointMinutesAgo() to pull historical values.
 *
 * NOTE: This is in-memory only. It resets on server restart/redeploy.
 * That's expected for a premarket/intraday scanner — history doesn't
 * need to persist across sessions, only within a single trading session.
 */

interface PricePoint {
  timestamp: number; // epoch ms
  midpoint: number;
}

// How long to retain history per symbol before pruning old points.
const RETENTION_MS = 6 * 60 * 1000; // 6 minutes (slightly above the 5m window we need)

// In-memory store: symbol -> chronological array of price points
const history = new Map<string, PricePoint[]>();

/**
 * Record a new midpoint price tick for a symbol.
 * Call this once per engine tick/poll cycle per symbol.
 */
export function recordTick(symbol: string, midpoint: number, timestamp: number = Date.now()): void {
  const key = symbol.toUpperCase();
  const existing = history.get(key) ?? [];

  existing.push({ timestamp, midpoint });

  // Prune anything older than RETENTION_MS to prevent unbounded memory growth
  const cutoff = timestamp - RETENTION_MS;
  const pruned = existing.filter((p) => p.timestamp >= cutoff);

  history.set(key, pruned);
}

/**
 * Get the midpoint price closest to `minutesAgo` minutes before now.
 * Returns null if there isn't enough history yet (e.g. first few minutes
 * after market open, or a symbol just added to the scanner).
 *
 * Uses closest-match rather than exact-match since tick arrival times
 * are irregular (depends on quote provider polling interval).
 */
export function getMidpointMinutesAgo(
  symbol: string,
  minutesAgo: number,
  now: number = Date.now()
): number | null {
  const key = symbol.toUpperCase();
  const points = history.get(key);

  if (!points || points.length === 0) return null;

  const targetTime = now - minutesAgo * 60 * 1000;

  // Find the point whose timestamp is closest to targetTime
  let closest: PricePoint | null = null;
  let smallestDiff = Infinity;

  for (const point of points) {
    const diff = Math.abs(point.timestamp - targetTime);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      closest = point;
    }
  }

  // Guard: if the closest point we have is more than 90 seconds off
  // from the requested time, treat it as insufficient history rather
  // than silently using a stale/wrong value.
  const MAX_ACCEPTABLE_DRIFT_MS = 90 * 1000;
  if (!closest || smallestDiff > MAX_ACCEPTABLE_DRIFT_MS) return null;

  return closest.midpoint;
}

/**
 * Convenience helper: pulls M1, M3, M5 in one call for the momentum formula.
 * Returns null if ANY of the three windows lack sufficient history —
 * callers should treat that symbol as "not yet ready" rather than
 * computing momentum off incomplete data.
 */
export function getMomentumWindow(
  symbol: string,
  now: number = Date.now()
): { m1: number; m3: number; m5: number } | null {
  const m1 = getMidpointMinutesAgo(symbol, 1, now);
  const m3 = getMidpointMinutesAgo(symbol, 3, now);
  const m5 = getMidpointMinutesAgo(symbol, 5, now);

  if (m1 === null || m3 === null || m5 === null) return null;

  return { m1, m3, m5 };
}

/**
 * Remove a symbol entirely from history (e.g. when it drops off the scanner).
 * Prevents unbounded memory growth as symbols rotate in/out of the universe.
 */
export function clearSymbol(symbol: string): void {
  history.delete(symbol.toUpperCase());
}

/** Debug/ops helper: how many symbols are currently being tracked */
export function trackedSymbolCount(): number {
  return history.size;
}
