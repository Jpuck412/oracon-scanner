import { fetchQuotes, fetchTimeSales, type TradierQuoteRaw } from "./tradierClient";
import type { Quote } from "@/types/scanner";

// Converts raw Tradier quote + timesales data into the Quote shape
// Oracle and Rubicon engines consume. Session window: 4:00 AM - 8:00 PM ET,
// matching the actual trading session. Opening range anchors to 4:00 AM.

const DEFAULT_TICK_SIZE = 0.0001; // sub-$1 tick convention; adjust if needed per-symbol

interface OpeningRangeCache {
  orh: number;
  orl: number;
  date: string; // YYYY-MM-DD, so cache invalidates each new trading day
}

// In-memory cache: symbol -> today's opening range (first 5-min candle)
// Computed once per symbol per day, since the opening range doesn't change
// after the first 5 minutes of the session.
const orCache = new Map<string, OpeningRangeCache>();

function todayKey(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Compute (and cache) the 5-minute opening range high/low for a symbol.
 * Uses 1-min timesales bars from market open, aggregating the first 5.
 *
 * NOTE: "Market open" here assumes regular session 9:30 AM ET. If you're
 * trading premarket moves relative to the *premarket* range instead of
 * the regular session open, this needs a different start-time anchor —
 * flagging this as a decision point once we're testing with real data.
 */
async function getOpeningRange(symbol: string): Promise<{ orh: number; orl: number }> {
  const today = todayKey();
  const cached = orCache.get(symbol);

  if (cached && cached.date === today) {
    return { orh: cached.orh, orl: cached.orl };
  }

  const data = await fetchTimeSales(symbol, "1min");
  const series = data?.series?.data;

  if (!series || !Array.isArray(series) || series.length < 5) {
    throw new Error(`Insufficient timesales data to compute opening range for ${symbol}`);
  }

  // First 5 one-minute bars = the opening range
  const firstFive = series.slice(0, 5);
  const highs = firstFive.map((bar: any) => bar.high);
  const lows = firstFive.map((bar: any) => bar.low);

  const orh = Math.max(...highs);
  const orl = Math.min(...lows);

  orCache.set(symbol, { orh, orl, date: today });

  return { orh, orl };
}

/**
 * Compute RVOL (current volume vs. average volume for this time of day).
 * Tradier's quote endpoint gives raw volume + average_volume (full-day avg),
 * so we approximate time-of-day RVOL by scaling against elapsed session time.
 *
 * This is an approximation, not a true time-of-day historical average —
 * flagging as a known simplification to revisit once we have enough
 * historical bars cached to build real time-of-day baselines.
 */
function estimateRVOL(currentVolume: number, averageVolume: number): { rvolCum: number; rvol1m: number } {
  const now = new Date();
  const marketOpenMinutes = 9 * 60 + 30; // 9:30 AM ET in minutes
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes(); // NOTE: assumes server runs in ET-aligned context; revisit if deploying across timezones
  const minutesSinceOpen = Math.max(1, nowMinutes - marketOpenMinutes);
  const sessionMinutes = 390; // 6.5hr regular session

  const expectedVolumeByNow = averageVolume * (minutesSinceOpen / sessionMinutes);
  const rvolCum = expectedVolumeByNow > 0 ? currentVolume / expectedVolumeByNow : 0;

  // 1-min RVOL approximated as cumulative RVOL for now since we don't yet
  // have a rolling 1-min volume delta — refine once tick-level volume
  // deltas are being tracked in priceHistory.ts
  const rvol1m = rvolCum;

  return { rvolCum, rvol1m };
}

/**
 * Main adapter: fetch live quote + opening range for a symbol and
 * return it in the Quote shape the engines expect.
 */
export async function getQuoteForSymbol(symbol: string): Promise<Quote | null> {
  const [quotes, openingRange] = await Promise.all([
    fetchQuotes([symbol]),
    getOpeningRange(symbol).catch(() => null), // don't fail the whole quote if OR calc fails
  ]);

  const raw: TradierQuoteRaw | undefined = quotes[0];
  if (!raw) return null;

  if (!openingRange) {
    // Can't compute Oracle/Rubicon without an opening range — caller should
    // treat this symbol as "not ready yet" rather than crash.
    return null;
  }

  const { rvolCum, rvol1m } = estimateRVOL(raw.volume, raw.average_volume);

  return {
    symbol: raw.symbol,
    bid: raw.bid,
    ask: raw.ask,
    vwap: raw.vwap ?? (raw.bid + raw.ask) / 2, // fallback if Tradier omits vwap
    orh: openingRange.orh,
    orl: openingRange.orl,
    tick: DEFAULT_TICK_SIZE,
    rvolCum,
    rvol1m,
    float: 0, // Tradier doesn't provide float directly — needs a fundamentals source, flagged below
    timestamp: Date.now(),
  };
}

/**
 * B
