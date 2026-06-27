import type { TradierQuote, TradierTimeSaleBar } from "@/types/scanner";

const TRADIER_BASE_URL =
  process.env.TRADIER_BASE_URL || "https://api.tradier.com/v1";

const TRADIER_ACCESS_TOKEN = process.env.TRADIER_ACCESS_TOKEN;

const requireTradierToken = (): string => {
  if (!TRADIER_ACCESS_TOKEN) {
    throw new Error("Missing TRADIER_ACCESS_TOKEN in environment.");
  }

  return TRADIER_ACCESS_TOKEN;
};

const tradierFetch = async <T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {}
): Promise<T> => {
  const token = requireTradierToken();

  const url = new URL(`${TRADIER_BASE_URL}${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    },
    cache: "no-store"
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tradier ${res.status}: ${text}`);
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
      quotes?: { quote?: TradierQuote | TradierQuote[] };
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
    series?: { data?: TradierTimeSaleBar | TradierTimeSaleBar[] };
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
