import { clip, clip01, midpoint, spreadPct, spreadMax, openingRangeStats, blendedRVOL, momentum } from "./marketMath";
import { getMomentumWindow } from "./priceHistory";
import type { Quote, OracleResult } from "@/types/scanner";

const EPSILON = 1e-8;

/**
 * Full Oracle Entry Formula implementation — long-only, $0.20-$10.00 universe.
 * Every constant below is labeled and matches the solved formula exactly.
 * Tune values here as live trading data validates/invalidates thresholds.
 */

export async function evaluateOracle(
  quote: Quote,
  catalystScore: number
): Promise<OracleResult> {
  const reasons: string[] = [];
  const C = clip01(catalystScore);

  const M = midpoint(quote);
  const SpreadPct = spreadPct(quote);
  const SpreadMaxVal = spreadMax(M);

  const { width: ORW, mid: ORM, pct: ORPct } = openingRangeStats({
    orh: quote.orh,
    orl: quote.orl,
  });

  const R = blendedRVOL(quote.rvolCum, quote.rvol1m);

  // Momentum requires historical midpoints — if insufficient history, invalid
  const window = getMomentumWindow(quote.symbol, quote.timestamp);
  if (!window) {
    return buildInvalidResult(quote, C, SpreadPct, R, ["Insufficient price history for momentum calculation"]);
  }

  const { mom: Mom, acceleration: A } = momentum({
    m: M,
    m1: window.m1,
    m3: window.m3,
    m5: window.m5,
    spreadPctValue: SpreadPct,
  });

  // STEP 6: catalyst-adjusted thresholds
  const VWAP_Max = 0.075 + 0.025 * C;
  const ORB_Max = 0.7 + 0.2 * C;
  const RVOL_Min = Math.max(1.4, 2.5 * (1 - 0.35 * C));
  const RVOL_Target = Math.max(RVOL_Min + 0.5, 5.0 * (1 - 0.25 * C));
  const Mom_Min = 0.35 * (1 - 0.25 * C);
  const Mom_Target = 1.75 * (1 - 0.15 * C);
  const RequiredScore = 0.72 - 0.12 * C;

  // STEP 7: VWAP distance score
  const VWAP_Distance = (M - quote.vwap) / quote.vwap;
  const sVwapLow = clip01((VWAP_Distance - 0.0025) / (0.015 - 0.0025));
  const sVwapHigh = clip01((VWAP_Max - VWAP_Distance) / (VWAP_Max - 0.015));
  const S_VWAP = sVwapLow * sVwapHigh;

  // STEP 8: ORB breakout score
  const ORB_Breakout = ORW > EPSILON ? (M - quote.orh) / ORW : 0;
  const sOrbLow = clip01((ORB_Breakout - 0.02) / (0.2 - 0.02));
  const sOrbHigh = clip01((ORB_Max - ORB_Breakout) / (ORB_Max - 0.2));
  const S_ORB = sOrbLow * sOrbHigh;

  // STEP 9: RVOL score
  const S_RVOL = clip01((R - RVOL_Min) / (RVOL_Target - RVOL_Min));

  // STEP 10: Momentum score
  const S_MOM = clip01((Mom - Mom_Min) / (Mom_Target - Mom_Min));

  // STEP 11: Final Oracle score
  const OracleScore = 0.26 * S_ORB + 0.22 * S_VWAP + 0.22 * S_RVOL + 0.18 * S_MOM + 0.12 * C;

  // STEP 12: ORB entry buffer
  const Theta_ORB = clip(
    0.08 * (1 - 0.3 * C) * (1 - 0.25 * S_RVOL) * (1 - 0.2 * S_MOM),
    0.015,
    0.1
  );
  const ORB_Buffer = Math.max(2 * quote.tick, Theta_ORB * ORW);

  // STEP 13: VWAP entry buffer
  const Theta_VWAP = 0.003 * (1 - 0.25 * C) * (1 - 0.15 * S_RVOL);

  // STEP 14: Final entry trigger
  const ORB_Trigger = quote.orh + ORB_Buffer;
  const VWAP_Trigger = quote.vwap * (1 + Theta_VWAP);
  const OracleEntryTrigger = Math.max(ORB_Trigger, VWAP_Trigger);

  // STEP 15: Max chase price
  const ChaseKappa = clip(0.2 + 0.2 * C + 0.15 * S_RVOL + 0.1 * S_MOM, 0.2, 0.6);
  const MaxEntryPrice = OracleEntryTrigger + ChaseKappa * ORW;

  // STEP 16: Invalid conditions
  if (M < 0.2) reasons.push("Price below $0.20 universe floor");
  if (M > 10.0) reasons.push("Price above $10.00 universe ceiling");
  if (ORW <= Math.max(0.015 * ORM, 10 * quote.tick)) reasons.push("Opening range too tight/noisy");
  if (ORPct > 0.18) reasons.push("Opening range % too wide");
  if (SpreadPct > SpreadMaxVal) reasons.push("Spread too wide");
  if (R < RVOL_Min) reasons.push("RVOL below minimum threshold");
  if (VWAP_Distance > VWAP_Max) reasons.push("Too extended from VWAP");
  if (ORB_Breakout > ORB_Max) reasons.push("Too extended from ORB high");
  if (Mom < Mom_Min) reasons.push("Momentum below minimum threshold");
  if (OracleScore < RequiredScore) reasons.push("Composite score below required threshold");

  const invalid = reasons.length > 0;

  // STEP 17: Final solved entry price
  let suggestedEntry: number | null = null;
  if (!invalid) {
    if (M < OracleEntryTrigger) {
      suggestedEntry = OracleEntryTrigger;
    } else if (quote.ask >= OracleEntryTrigger && quote.ask <= MaxEntryPrice) {
      suggestedEntry = quote.ask;
    } else {
      suggestedEntry = null;
    }
  }

  return {
    symbol: quote.symbol,
    score: OracleScore,
    requiredScore: RequiredScore,
    passed: !invalid && OracleScore >= RequiredScore,
    invalid,
    invalidReasons: reasons,
    entryTrigger: invalid ? null : OracleEntryTrigger,
    maxEntryPrice: invalid ? null : MaxEntryPrice,
    suggestedEntry,
    components: {
      sVwap: S_VWAP,
      sOrb: S_ORB,
      sRvol: S_RVOL,
      sMom: S_MOM,
      momentum: Mom,
      acceleration: A,
      vwapDistance: VWAP_Distance,
      orbBreakout: ORB_Breakout,
      blendedRvol: R,
      spreadPct: SpreadPct,
    },
    catalystScore: C,
    timestamp: quote.timestamp,
  };
}

function buildInvalidResult(
  quote: Quote,
  C: number,
  spreadPctVal: number,
  R: number,
  reasons: string[]
): OracleResult {
  return {
    symbol: quote.symbol,
    score: 0,
    requiredScore: 0.72 - 0.12 * C,
    passed: false,
    invalid: true,
    invalidReasons: reasons,
    entryTrigger: null,
    maxEntryPrice: null,
    suggestedEntry: null,
    components: {
      sVwap: 0,
      sOrb: 0,
      sRvol: 0,
      sMom: 0,
      momentum: 0,
      acceleration: 0,
      vwapDistance: 0,
      orbBreakout: 0,
      blendedRvol: R,
      spreadPct: spreadPctVal,
    },
    catalystScore: C,
    timestamp: quote.timestamp,
  };
}
