export async function GET() {
  const apiKey = process.env.FMPKEY;

  if (!apiKey) {
    return Response.json({
      ok: false,
      source: "fmp",
      count: 0,
      data: { tickers: [] },
      tickers: [],
      error: "FMPKEY not set",
    });
  }

  try {
    const res = await fetch(
      `https://financialmodelingprep.com/api/v3/stock_market/gainers?apikey=${apiKey}`,
      { cache: "no-store" }
    );

    if (!res.ok) {
      return Response.json({
        ok: false,
        source: "fmp",
        count: 0,
        data: { tickers: [] },
        tickers: [],
        error: `FMP HTTP ${res.status}`,
      });
    }

    const raw = await res.json();

    const tickers = Array.isArray(raw)
      ? raw.map((r: any) => ({
          ticker: r.symbol,
          price: r.price,
          prevClose: r.price - r.change,
          volume: r.volume ?? 0,
        }))
      : [];

    return Response.json({
      ok: true,
      source: "fmp",
      count: tickers.length,
      data: { tickers },
      tickers,
    });
  } catch (err: any) {
    return Response.json({
      ok: false,
      source: "fmp",
      count: 0,
      data: { tickers: [] },
      tickers: [],
      error: String(err?.message ?? err),
    });
  }
}
