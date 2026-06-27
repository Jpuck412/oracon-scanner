import {
  computeDailyVwap,
  computeOpeningRange,
  getCloseNMinutesAgo,
  midpoint,
  safeNumber
} from "@/lib/marketMath";
import { getTradierTimesales } from "@/lib/tradierClient";
import type {
  IntradayContext,
  TradierQuote,
  TradierTimeSaleBar
} from "@/types/scanner";

const easternParts = (d = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(d);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "00";

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute")
  };
};

export const todayEasternYmd = (): string => {
  const p = easternParts();
  return `${p.year}-${p.month}-${p.day}`;
};

export const nowEasternHm = (): string => {
  const p = easternParts();
  return `${p.hour}:${p.minute}`;
};

export const todaySessionRange = () => {
  const ymd = todayEasternYmd();

  return {
    start: `${ymd} 09:30`,
    end: `${ymd} ${nowEasternHm()}`
  };
};

const elapsedRegularMinutes = (): number => {
  const p = easternParts();
  const h = Number(p.hour);
  const m = Number(p.minute);

  const now = h * 60 + m;
  const open = 9 * 60 + 30;

  return Math.min(390, Math.max(1, now - open));
};

export const getIntradayBars = async (
  symbol: string
): Promise<TradierTimeSaleBar[]> => {
  const { start, end } = todaySessionRange();

  const bars = await getTradierTimesales(symbol, start, end, "1min", "open");

  return bars
    .filter((b) => safeNumber(b.close) > 0 && safeNumber(b.volume) >= 0)
    .sort((a, b) => String(a.time).localeCompare(String(b.time)));
};

export const buildIntradayContext = (
  quote: TradierQuote,
  bars: TradierTimeSaleBar[]
): IntradayContext => {
  const bid = safeNumber(quote.bid);
  const ask = safeNumber(quote.ask);
  const last = safeNumber(quote.last);

  const current = midpoint(bid, ask, last);

  const cleanBars =
    bars.length > 0
      ? bars
      : [
          {
            time: new Date().toISOString(),
            open: safeNumber(quote.open, current),
            high: safeNumber(quote.high, current),
            low: safeNumber(quote.low, current),
            close: current,
            volume: safeNumber(quote.volume)
          }
        ];

  const vwap = computeDailyVwap(cleanBars) || current;
  const openingRange = computeOpeningRange(cleanBars, 5);

  const cumulativeVolume = cleanBars.reduce(
    (sum, b) => sum + safeNumber(b.volume),
    0
  );

  const oneMinuteVolume = safeNumber(cleanBars.at(-1)?.volume);

  const avgVol = safeNumber(quote.average_volume, safeNumber(quote.volume, 1));
  const elapsed = elapsedRegularMinutes();

  const expectedCumVol = Math.max(1, avgVol * (elapsed / 390));
  const expectedOneMinVol = Math.max(1, avgVol / 390);

  return {
    vwap,
    openingRangeHigh: openingRange.high || safeNumber(quote.high, current),
    openingRangeLow: openingRange.low || safeNumber(quote.low, current),
    rvolCumulative: cumulativeVolume / expectedCumVol,
    rvolOneMinute: oneMinuteVolume / expectedOneMinVol,
    cumulativeVolume,
    oneMinuteVolume,
    m1: getCloseNMinutesAgo(cleanBars, 1, current),
    m3: getCloseNMinutesAgo(cleanBars, 3, current),
    m5: getCloseNMinutesAgo(cleanBars, 5, current)
  };
};
