import type { MomentumResult, TradierTimeSaleBar } from "@/types/scanner";

export const clip = (x: number, a: number, b: number): number =>
  Math.min(Math.max(x, a), b);

export const clip01 = (x: number): number => clip(x, 0, 1);

export const safeNumber = (x: unknown, fallback = 0): number => {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
};

export const midpoint = (bid: number, ask: number, last?: number): number => {
  if (bid > 0 && ask > 0) return (bid + ask) / 2;
  if (last && last > 0) return last;
  return 0;
};

export const spreadPct = (bid: number, ask: number, price: number): number => {
  if (price <= 0 || ask <= 0 || bid <= 0) return 1;
  return (ask - bid) / price;
};

export const spreadMax = (price: number): number =>
  0.012 + 0.018 * clip01((1.0 - price) / 0.8);

export const velocity = (
  currentPrice: number,
  pastPrice: number,
  minutes: number,
  direction: 1 | -1 = 1
): number => {
  if (currentPrice <= 0 || pastPrice <= 0 || minutes <= 0) return 0;
  return direction * 100 * (Math.log(currentPrice) - Math.log(pastPrice)) / minutes;
};

export const computeMomentum = params => {
  const { currentPrice, m1, m3, m5, spreadPctNow, direction = 1 } = params;

  const v1 = velocity(currentPrice, m1, 1, direction);
  const v3 = velocity(currentPrice, m3, 3, direction);
  const v5 = velocity(currentPrice, m5, 5, direction);

  const acceleration = v1 - v5;

  const mom =
    0.5 * v1 +
    0.3 * v3 +
    0.2 * v5 +
    0.35 * Math.max(acceleration, 0) -
    0.6 * Math.max(-acceleration, 0) -
    25 * spreadPctNow;

  return { v1, v3, v5, acceleration, mom };
};

export type MomentumInput = {
  currentPrice: number;
  m1: number;
  m3: number;
  m5: number;
  spreadPctNow: number;
  direction?: 1 | -1;
};

export const computeDailyVwap = (bars: TradierTimeSaleBar[]): number => {
  let pv = 0;
  let vol = 0;

  for (const b of bars) {
    const v = safeNumber(b.volume);
    if (v <= 0) continue;

    const px =
      safeNumber(b.vwap) ||
      safeNumber(b.close) ||
      safeNumber(b.price) ||
      (safeNumber(b.high) + safeNumber(b.low) + safeNumber(b.close)) / 3;

    pv += px * v;
    vol += v;
  }

  return vol > 0 ? pv / vol : 0;
};

export const computeOpeningRange = (
  bars: TradierTimeSaleBar[],
  minutes = 5
): { high: number; low: number } => {
  const firstBars = bars.slice(0, minutes);

  const high = Math.max(...firstBars.map((b) => safeNumber(b.high)));
  const low = Math.min(...firstBars.map((b) => safeNumber(b.low)));

  return {
    high: Number.isFinite(high) ? high : 0,
    low: Number.isFinite(low) ? low : 0
  };
};

export const getCloseNMinutesAgo = (
  bars: TradierTimeSaleBar[],
  minutesAgo: number,
  fallback: number
): number => {
  if (bars.length === 0) return fallback;

  const idx = Math.max(0, bars.length - 1 - minutesAgo);
  const bar = bars[idx];

  return safeNumber(bar?.close, fallback);
};

export const roundPrice = (price: number, tickSize = 0.0001): number => {
  if (!Number.isFinite(price)) return 0;
  return Math.round(price / tickSize) * tickSize;
};
