"use client";

import { useEffect, useMemo, useState } from "react";
import type { ScannerRow } from "@/types/scanner";

const fmt = (n: number | null | undefined, digits = 2) =>
  typeof n === "number" && Number.isFinite(n) ? n.toFixed(digits) : "-";

const pct = (n: number | null | undefined, digits = 2) =>
  typeof n === "number" && Number.isFinite(n)
    ? `${(n * 100).toFixed(digits)}%`
    : "-";

const money = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n)
    ? `$${n.toFixed(n < 1 ? 4 : 2)}`
    : "-";

export default function Page() {
  const [rows, setRows] = useState<ScannerRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await fetch("/api/gainers?limit=40", {
        cache: "no-store"
      });

      const json = await res.json();

      if (!json.ok) {
        throw new Error(json.error ?? "Scanner failed");
      }

      setRows(json.rows);
      setUpdated(json.generatedAt);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();

    const id = setInterval(load, 5000);

    return () => clearInterval(id);
  }, []);

  const greenCount = useMemo(
    () => rows.filter((r) => r.rubicon.state === "GREEN").length,
    [rows]
  );

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Oracle + Rubicon Scanner</p>
          <h1>$0.20-$10 Momentum Engine</h1>
          <p className="sub">
            Uses FMPKEY for FMP gainers, float, and news. Uses TRADIER_API_KEY
            for Tradier quotes and time-sales.
          </p>
        </div>

        <div className="statusBox">
          <span>{loading ? "Loading" : "Live"}</span>
          <strong>{greenCount}</strong>
          <small>GREEN setups</small>
        </div>
      </section>

      {error && <div className="error">{error}</div>}

      <div className="meta">
        Last update: {updated ? new Date(updated).toLocaleTimeString() : "-"}
      </div>

      <section className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Price</th>
              <th>State</th>
              <th>Entry</th>
              <th>Max Entry</th>
              <th>Oracle</th>
              <th>RVOL</th>
              <th>Mom</th>
              <th>Spread</th>
              <th>Float</th>
              <th>Catalyst</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.symbol}>
                <td>
                  <strong>{r.symbol}</strong>
                  <span>{r.name ?? ""}</span>
                </td>

                <td>{money(r.price)}</td>

                <td>
                  <b className={`pill ${r.rubicon.state.toLowerCase()}`}>
                    {r.rubicon.state}
                  </b>
                </td>

                <td>{money(r.oracle.suggestedEntry ?? r.oracle.entryTrigger)}</td>
                <td>{money(r.oracle.maxEntry)}</td>

                <td>
                  {fmt(r.oracle.oracleScore, 3)}
                  <span>req {fmt(r.oracle.requiredScore, 3)}</span>
                </td>

                <td>{fmt(r.rvol, 2)}</td>
                <td>{fmt(r.momentum.mom, 2)}</td>
                <td>{pct(r.spreadPct, 2)}</td>

                <td>
                  {r.floatShares
                    ? `${(r.floatShares / 1_000_000).toFixed(1)}M`
                    : "-"}
                </td>

                <td title={r.catalystHeadline ?? ""}>
                  {fmt(r.catalystScore, 2)}
                  <span>{r.catalystHeadline ?? ""}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
