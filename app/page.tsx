"use client";
import React, { useEffect, useMemo, useState } from "react";

interface Stock {
  ticker: string; price: number; gain: number; volume: number;
  eliteScore: number; lifecycle: string; verdict: string;
}

function normalize(raw: any): Stock {
  const ticker = String(raw.ticker ?? raw.T ?? raw.symbol ?? "???").toUpperCase();
  const price = Number(raw.lastPrice ?? raw.price ?? raw.c ?? 0);
  const prevClose = Number(raw.prevClose ?? raw.pc ?? (price * 0.95));
  const gain = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
  const volume = Number(raw.volume ?? raw.v ?? 0);
  const eliteScore = Math.round(Math.min(100, Math.abs(gain) * 3 + (volume > 500000 ? 20 : 0)));
  const lifecycle = gain >= 75 ? "EXTENDED" : gain >= 30 ? "RUNNING" : gain >= 12 ? "IGNITING" : gain >= 3 ? "FORMING" : "WAKING";
  const verdict = eliteScore >= 72 ? "YES" : eliteScore >= 50 ? "WAIT" : "NO";
  return { ticker, price, gain, volume, eliteScore, lifecycle, verdict };
}

export default function Page() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [apiOk, setApiOk] = useState(false);
  const [lastScan, setLastScan] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/gainers", { cache: "no-store" });
      const json = await res.json();
      const list = Array.isArray(json?.data?.tickers) ? json.data.tickers
        : Array.isArray(json?.tickers) ? json.tickers
        : Array.isArray(json?.results) ? json.results
        : [];
      setStocks(list.map(normalize).sort((a: Stock, b: Stock) => b.eliteScore - a.eliteScore));
      setApiOk(true);
    } catch {
      setApiOk(false);
    }
    setLastScan(new Date().toISOString());
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ background: "#20242B", color: "#E6EAF0", minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ color: "#4DA3FF", fontWeight: 700, fontSize: 16 }}>PROOF OF STRUCTURE™ ELITE</div>
          <div style={{ color: "#9AA4B2", fontSize: 12 }}>Evidence Before Entry.</div>
        </div>
        <div style={{ fontSize: 11, color: "#9AA4B2" }}>
          <span style={{ color: apiOk ? "#00D084" : "#FF5C5C" }}>● {apiOk ? "API LIVE" : "API DOWN"}</span>
          {" "}— last scan {lastScan ? new Date(lastScan).toLocaleTimeString() : "—"}
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#4DA3FF", borderBottom: "1px solid #3A404C" }}>
            <th style={{ padding: 8 }}>Ticker</th>
            <th style={{ padding: 8 }}>Price</th>
            <th style={{ padding: 8 }}>Gain</th>
            <th style={{ padding: 8 }}>Volume</th>
            <th style={{ padding: 8 }}>Lifecycle</th>
            <th style={{ padding: 8 }}>Elite</th>
            <th style={{ padding: 8 }}>Verdict</th>
          </tr>
        </thead>
        <tbody>
          {stocks.length === 0 && (
            <tr><td colSpan={7} style={{ padding: 16, color: "#9AA4B2", textAlign: "center" }}>
              No tickers returned from API.
            </td></tr>
          )}
          {stocks.map((s) => (
            <tr key={s.ticker} style={{ borderBottom: "1px solid #3A404C" }}>
              <td style={{ padding: 8, fontFamily: "monospace" }}>{s.ticker}</td>
              <td style={{ padding: 8 }}>${s.price.toFixed(2)}</td>
              <td style={{ padding: 8, color: s.gain >= 0 ? "#00D084" : "#FF5C5C" }}>{s.gain.toFixed(2)}%</td>
              <td style={{ padding: 8 }}>{s.volume.toLocaleString()}</td>
              <td style={{ padding: 8 }}>{s.lifecycle}</td>
              <td style={{ padding: 8 }}>{s.eliteScore}</td>
              <td style={{ padding: 8, color: s.verdict === "YES" ? "#00D084" : s.verdict === "WAIT" ? "#FFB547" : "#FF5C5C" }}>{s.verdict}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
