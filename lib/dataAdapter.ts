import { scoreCatalystFromNews } from "@/lib/catalyst";
import {
  computeMomentum,
  midpoint,
  safeNumber,
  spreadPct
} from "@/lib/marketMath";
import { computeOracle } from "@/lib/oracleEngine";
import { buildIntradayContext, getIntradayBars } from "@/lib/priceHistory";
import { computeRubicon } from "@/lib/rubiconEngine";
import { getTradierQuotes } from "@/lib/tradierClient";
import type {
  FmpFloatResponse,
  FmpGainer,
  FmpNewsItem,
  ScannerRow,
  TradierQuote
} from "@/types/scanner";

class FmpApiError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`FMP API error ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
}

const FMP_BASE_URL =
  process.env.FMP_BASE_URL || "https://financialmodelingprep.com/stable";

const getFmpKey = (): string => {
  const key = process.env.FMPKEY?.trim();

  if (!key) {
    throw new Error("Missing FMPKEY environment variable.");
  }

  return key;
};

const fmpFetch = async <T>(
  path: string,
  params: Record<string, string | number | undefined> = {}
): Promise<T> => {
  const url = new URL(`${FMP_BASE_URL}${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  url.searchParams.set("apikey", getFmpKey());

  const res = await fetch(url.toString(), {
    cache: "no-store"
  });

  if (!res.ok) {
    const body = await res.text();
    throw new FmpApiError(res.status, body);
  }

  return res.json() as Promise<T>;
};

const normalizeSymbol = (s: string): string =>
  s.trim().toUpperCase();

const envSymbols = (): string[] => {
  const raw = process.env.SCANNER_SYMBOLS ?? "";

  return raw
    .split(",")
    .map(normalizeSymbol)
    .filter(Boolean);
};

export const getFmpGainersSafe = async (): Promise<FmpGainer[]> => {
  try {
    const data = await fmpFetch<FmpGainer[]>("/biggest-gainers");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

export const getUniverseSymbols = async (
  limit: number
): Promise<string[]> => {
  const manualSymbols = envSymbols();

  const fmpGainers = await getFmpGainersSafe();

  const fmpSymbols = fmpGainers
    .map((g) => normalizeSymbol(g.symbol))
    .filter(Boolean);

  const combined = [...fmpSymbols, ...manualSymbols];

  const unique = Array.from(new Set(combined));

  if (unique.length === 0) {
    throw new Error(
      [
        "No scanner symbols available.",
        "FMP /biggest-gainers is blocked by your subscription or returned empty.",
        "Set SCANNER_SYMBOLS in your environment, for example:",
        "SCANNER_SYMBOLS=HOLO,PEGY,SOUN,BBAI,MLGO"
      ].join(" ")
    );
  }

  return unique.slice(0, limit * 2);
};

export const getFmpFloatSafe = async (
  symbol: string
): Promise<FmpFloatResponse | null> => {
  try {
    const data = await fmpFetch<FmpFloatResponse[] | FmpFloatResponse>(
      "/shares-float",
      { symbol }
    );

    if (Array.isArray(data)) return data[0] ?? null;

    return data ?? null;
  } catch {
    return null;
  }
};

export const getFmpNewsSafe = async (
  symbols: string[]
): Promise<FmpNewsItem[]> => {
  try {
    const cleanSymbols = symbols
      .map(normalizeSymbol)
      .filter(Boolean)
      .slice(0, 100);

    if (cleanSymbols.length === 0) return [];

    const data = await fmpFetch<FmpNewsItem[]>("/news/stock", {
      symbols: cleanSymbols.join(","),
      limit: 500
    });

    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

const mapQuotes = (quotes: TradierQuote[]) => {
  const map = new Map<string, TradierQuote>();

  for (const quote of quotes) {
    if (quote.symbol) {
      map.set(normalizeSymbol(quote.symbol), quote);
    }
  }

  return map;
};

const groupNewsBySymbol = (
  symbols: string[],
  news: FmpNewsItem[]
): Map<string, FmpNewsItem[]> => {
  const set = new Set(symbols.map(normalizeSymbol));
  const map = new Map<string, FmpNewsItem[]>();

  for (const symbol of set) {
    map.set(symbol, []);
  }

  for (const item of news) {
    if (!item.symbol) continue;

    const parts = item.symbol.split(",").map(normalizeSymbol);

    for (const part of parts) {
      if (set.has(part)) {
        map.get(part)?.push(item);
      }
    }
  }

  return map;
};

const fallbackFloatShares = (): number | null => {
  const n = Number(process.env.UNKNOWN_FLOAT_SHARES ?? 0);

  if (Number.isFinite(n) && n >= 500_000 && n <= 50_000_000) {
    return n;
  }

  return null;
};

export const buildScannerRows = async (
  limit = 40
): Promise<ScannerRow[]> => {
  const symbols = await getUniverseSymbols(limit);

  const [quotes, latestNews] = await Promise.all([
    getTradierQuotes(symbols),
    getFmpNewsSafe(symbols)
  ]);

  const quoteMap = mapQuotes(quotes);
  const newsMap = groupNewsBySymbol(symbols, latestNews);

  const rows = await Promise.all(
    symbols.map(async (symbol): Promise<ScannerRow | null> => {
      const quote = quoteMap.get(symbol);

      if (!quote) return null;

      const bid = safeNumber(quote.bid);
      const ask = safeNumber(quote.ask);
      const last = safeNumber(quote.last);

      const price = midpoint(bid, ask, last);

      if (price < 0.2 || price > 10) return null;

      const [floatData, bars] = await Promise.all([
        getFmpFloatSafe(symbol),
        getIntradayBars(symbol).catch(() => [])
      ]);

      const reportedFloat =
        safeNumber(floatData?.floatShares) ||
        safeNumber(floatData?.freeFloat) ||
        0;

      const floatShares =
        reportedFloat > 0
          ? reportedFloat
          : fallbackFloatShares();

      const ctx = buildIntradayContext(quote, bars);

      const spr = spreadPct(bid, ask, price);

      const momentum = computeMomentum({
        currentPrice: price,
        m1: ctx.m1,
        m3: ctx.m3,
        m5: ctx.m5,
        spreadPctNow: spr,
        direction: 1
      });

      const catalyst = scoreCatalystFromNews(
        symbol,
        newsMap.get(symbol) ?? []
      );

      const oracle = computeOracle({
        bid,
        ask,
        last,
        vwap: ctx.vwap,
        openingRangeHigh: ctx.openingRangeHigh,
        openingRangeLow: ctx.openingRangeLow,
        tickSize: price < 1 ? 0.0001 : 0.01,
        rvolCumulative: ctx.rvolCumulative,
        rvolOneMinute: ctx.rvolOneMinute,
        catalystScore: catalyst.score,
        mom: momentum.mom,
        direction: 1
      });

      const rvol =
        0.6 * ctx.rvolCumulative +
        0.4 * ctx.rvolOneMinute;

      const rubicon = computeRubicon({
        bid,
        ask,
        last,
        rvol,
        catalystScore: catalyst.score,
        floatShares,
        mom: momentum.mom,
        acceleration: momentum.acceleration,
        previousState: "YELLOW",
        previousActiveLevel: null
      });

      return {
        symbol,
        name: quote.description,

        price,
        bid,
        ask,
        spreadPct: spr,

        volume: safeNumber(quote.volume),
        averageVolume: safeNumber(quote.average_volume),
        rvol,

        floatShares,
        catalystScore: catalyst.score,
        catalystHeadline: catalyst.headline,

        vwap: ctx.vwap,
        openingRangeHigh: ctx.openingRangeHigh,
        openingRangeLow: ctx.openingRangeLow,

        momentum,
        oracle,
        rubicon
      };
    })
  );

  return rows
    .filter((x): x is ScannerRow => x !== null)
    .sort((a, b) => {
      const stateRank = {
        GREEN: 3,
        ORANGE: 2,
        YELLOW: 1
      };

      const stateDiff =
        stateRank[b.rubicon.state] -
        stateRank[a.rubicon.state];

      if (stateDiff !== 0) return stateDiff;

      return b.oracle.oracleScore - a.oracle.oracleScore;
    })
    .slice(0, limit);
};
