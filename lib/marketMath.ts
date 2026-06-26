/**
 * Shared market math primitives used by both Oracle and Rubicon engines.
 * All clamp/momentum/spread calculations live here so both engines
 * consume identical, single-source-of-truth math.
 */

const EPSILON = 1e-8;

/** Clamp x to [0, 1] */
export function clip01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/** Clamp x to [lo, hi] */
export function clip(x: number, lo: number, hi: number): number {
  if (Number.isNaN(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

/** Safe division guard — prevents NaN/Infinity propagating into UI */
export function safeDiv(numerator: number, denominator: number, fallback = 0): number {
  if (Math.abs(denominator) < EPSILON) return fallback;
  return numerator / denominator;
}

export interface QuoteInput {
  bid: number;
  ask: number;
}

/** Midpoint price M = (Bid + Ask) / 2 */
export function midpoint({ bid, ask }: QuoteInput): number {
  return (bid + ask) / 2;
}

/** Spread as % of midpoint: (Ask - Bid) / M */
export function spreadPct({ bid, ask }: QuoteInput): number {
  const m = midpoint({ bid, ask });
  return safeDiv(ask - bid, m, 0);
}

/**
 * Price-scaled max spread allowance.
 * Lower-priced stocks naturally have wider relative spreads,
 * so the cap loosens as price falls below $1.00.
 */
export function spreadMax(midpointPrice: number): number {
  const factor = clip01((1.0 - midpointPrice) / 0.8);
  return 0.012 + 0.018 * factor;
}

export interface OpeningRange {
  orh: number; // 5-min opening range high
  orl: number; // 5-min opening range low
}

export interface OpeningRangeStats {
  width: number;   // ORW
  mid: number;      // ORM
  pct: number;      // ORPct
}

/** Opening range width, midpoint, and width as % of its own midpoint */
export function openingRangeStats({ orh, orl }: OpeningRange): OpeningRangeStats {
  const width = orh - orl;
  const mid = (orh + orl) / 2;
  const pct = safeDiv(width, mid, 0);
  return { width, mid, pct };
}

/** Blended RVOL: 60% cumulative, 40% 1-minute */
export function blendedRVOL(rvolCum: number, rvol1m: number): number {
  return 0.6 * rvolCum + 0.4 * rvol1m;
}

export interface MomentumInputs {
  m: number;  // current midpoint
  m1: number; // midpoint 1 minute ago
  m3: number; // midpoint 3 minutes ago
  m5: number; // midpoint 5 minutes ago
  spreadPctValue: number;
}

export interface MomentumResult {
  v1: number;
  v3: number;
  v5: number;
  acceleration: number; // A = v1 - v5
  mom: number;          // final blended momentum score
}

/**
 * Log-return momentum across 1/3/5-minute windows, blended with
 * acceleration bias and a spread penalty.
 */
export function momentum({ m, m1, m3, m5, spreadPctValue }: MomentumInputs): MomentumResult {
  const v1 = 100 * Math.log(safeDiv(m, m1, 1));
  const v3 = (100 * Math.log(safeDiv(m, m3, 1))) / 3;
  const v5 = (100 * Math.log(safeDiv(m, m5, 1))) / 5;

  const acceleration = v1 - v5;

  const mom =
    0.5 * v1 +
    0.3 * v3 +
    0.2 * v5 +
    0.35 * Math.max(acceleration, 0) -
    0.6 * Math.max(-acceleration, 0) -
    25 * spreadPctValue;

  return { v1, v3, v5, acceleration, mom };
}
