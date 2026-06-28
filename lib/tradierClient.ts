import type { TradierQuote, TradierTimeSaleBar } from "@/types/scanner";

const getTradierBaseUrl = (): string => {
  if (process.env.TRADIER_BASE_URL?.trim()) {
    return process.env.TRADIER_BASE_URL.trim().replace(/\/$/, "");
  }

  const env = (process.env.TRADIER_ENV ?? "live").toLowerCase();

  if (env === "sandbox" || env === "paper") {
    return "https://sandbox.tradier.com/v1";
  }

  return "https://api.tradier.com/v1";
};

const getTradierToken = (): string => {
  const token = process.env.TRADIER_API_KEY?.trim();

  if (!token) {
    throw new Error(
      "Missing TRADIER_API_KEY. This must be your Tradier access token, not your FMP key."
    );
  }

  return token;
};

const tradierFetch = async <T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {}
): Promise<T> => {
  const baseUrl = getTradierBaseUrl();
  const token = getTradierToken();

  const url = new URL(`${baseUrl}${path}`);

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
    const body = await res.text();

    if (res.status === 401) {
      throw new Error(
        [
          `Tradier API error 401: access token not approved.`,
          `Base URL used: ${baseUrl}`,
          `Fix: if this is a paper/sandbox token, set TRADIER_ENV=sandbox.`,
          `Fix: if this is a production token, set TRADIER_ENV=live.`,
          `Fix: make sure TRADIER_API_KEY contains the Tradier Access Token, not client id, not secret, not FMP key.`,
          `Raw response: ${body}`
        ].join(" ")
      );
    }

    throw new Error(`Tradier API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
};

export const getTradierQuotes = async (
  symbols: string[]
): Promise<TradierQuote[]> => {
  const cleanSymbols = symbols
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (cleanSymbols.length === 0) return [];

  const out: TradierQuote[] = [];
  const chunkSize = 100;

  for (let i = 0; i < cleanSymbols.length; i += chunkSize) {
    const chunk = cleanSymbols.slice(i, i + chunkSize);

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

export const checkTradierAuth = async (): Promise<{
  ok: boolean;
  baseUrl: string;
  message: string;
}> => {
  try {
    await getTradierQuotes(["AAPL"]);

    return {
      ok: true,
      baseUrl: getTradierBaseUrl(),
      message: "Tradier auth OK"
    };
  } catch (err) {
    return {
      ok: false,
      baseUrl: getTradierBaseUrl(),
      message: err instanceof Error ? err.message : "Unknown Tradier error"
    };
  }
};
