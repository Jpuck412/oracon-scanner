/**
 * Tradier production API client — real-time quotes for the scanner.
 * Uses the PRODUCTION endpoint (api.tradier.com), not sandbox, since
 * Oracle/Rubicon require real-time tick data, not 15-min delayed.
 *
 * Requires TRADIER_API_KEY set as an environment variable in Vercel
 * (Project Settings -> Environment Variables). NEVER hardcode the
 * token here or commit it to the repo.
 */

const TRADIER_BASE_URL = "https://api.tradier.com/v1";

interface TradierQuoteRaw {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  average_volume: number;
  vwap?: number; // not always returned, may need separate calc
}

interface TradierQuotesResponse {
  quotes: {
    quote: TradierQuoteRaw | TradierQuoteRaw[];
  };
}

function getApiKey(): string {
  const key = process.env.TRADIER_API_KEY;
  if (!key) {
    throw new Error(
      "TRADIER_API_KEY is not set. Add it in Vercel Project Settings -> Environment Variables."
    );
  }
  return key;
}

/**
 * Fetch real-time quotes for one or more symbols from Tradier's
 * production market data endpoint.
 */
export async function fetchQuotes(symbols: string[]): Promise<TradierQuoteRaw[]> {
  if (symbols.length === 0) return [];

  const apiKey = getApiKey();
  const url = `${TRADIER_BASE_URL}/markets/quotes?symbols=${encodeURIComponent(
    symbols.join(",")
  )}&greeks=false`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    // Real-time data should never be cached
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Tradier API error: ${response.status} ${response.statusText}`);
  }

  const data: TradierQuotesResponse = await response.json();
  const quote = data.quotes?.quote;

  if (!quote) return [];

  // Tradier returns a single object (not array) when only 1 symbol is requested
  return Array.isArray(quote) ? quote : [quote];
}

/**
 * Fetch historical/intraday time & sales data — used to derive
 * opening range (first 5-min candle) and average volume by time-of-day.
 */
export async function fetchTimeSales(
  symbol: string,
  interval: "1min" | "5min" = "1min",
  start?: string,
  end?: string
): Promise<any> {
  const apiKey = getApiKey();
  const params = new URLSearchParams({
    symbol,
    interval,
    ...(start && { start }),
    ...(end && { end }),
  });

  const url = `${TRADIER_BASE_URL}/markets/timesales?${params.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Tradier timesales error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export type { TradierQuoteRaw };
