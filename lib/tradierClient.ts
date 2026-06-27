import type { TradierQuote, TradierTimeSaleBar } from "@/types/scanner";

const TRADIER_BASE_URL =
  process.env.TRADIER_BASE_URL || "https://api.tradier.com/v1";

const getTradierApiKey = (): string => {
  const key = process.env.TRADIER_API_KEY;

  if (!key) {
    throw new Error("Missing TRADIER_API_KEY environment variable.");
  }

  return key;
};

const tradierFetch = async <T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {}
): Promise<T> => {
  const url = new URL(`${TRADIER_BASE_URL}${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${getTradierApiKey()}`,
      Accept: "application/json"
    },
    cache: "no-store"
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tradier API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
};

export const getTradierQuotes = async (
  symbols: string[]
): Promise<TradierQuote[]> => {
  if (symbols.length === 0) return [];

  const out: TradierQuote[] = [];
  const chunkSize = 100;

  for (let i = 0; i < symbols.length; i += chunkSize) {
    const chunk = symbols.slice(i, i + chunkSize);

    const data = await tradierFetch<{
      quotes?: {
        quote?: TradierQuote | TradierQuote[];
      };
    }>("/markets/quotes", {
      symbols: chunk.join(","),
      greeks: false
    });

    const quote = data.quotes?.quote;

    if (Array.isArray(quote)) out.push(...quote);
    else if (quote) out.push(quote);
  }

  return out;
};

export const getTradierTimesales = async (
  symbol: string,
  start: string,
  end: string,
  interval: "1min" | "5min" | "15min" | "tick" = "1min",
  sessionFilter: "open" | "all" = "open"
): Promise<TradierTimeSaleBar[]> => {
  const data = await tradierFetch<{
    series?: {
      data?: TradierTimeSaleBar | TradierTimeSaleBar[];
    };
  }>("/markets/timesales", {
    symbol,
    interval,
    start,
    end,
    session_filter: sessionFilter
  });

  const raw = data.series?.data;

  if (!raw) return [];
  if (Array.isArray(raw)) return raw;

  return [raw];
};
