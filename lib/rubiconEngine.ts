import { clip01, midpoint, spreadPct, spreadMax, blendedRVOL, momentum } from "./marketMath";
import { getMomentumWindow } from "./priceHistory";
import type { Quote, RubiconResult, RubiconState } from "@/types/scanner";

/**
 * Full Rubicon 3-Light State Machine — long-only whole-dollar breakout,
 * $0.50-$10.00 low-float universe. Every constant matches the solved
 * formula exactly.
 */

export async function evaluateRubicon(
  quote: Quote,
  catalystScore: number
): Promise<RubiconResult> {
  const C = clip01(catalystScore);
  const failReasons: string[] = [];

  const M = midpoint(quote);
  const SpreadPct = spreadPct(quote);
  const F = quote.float;

  const window = getMomentumWindow(quote.symbol, quote.timestamp);
  if (!window) {
    return buildFailedResult(quote, C, SpreadPct, ["Insufficient price history for momentum calculation"]);
  }

  const { mom: Mom, acceleration: A } = momentum({
    m: M,
    m1: window.m1,
    m3: window.m3,
    m5: window.m5,
    spreadPctValue: SpreadPct,
  });

  const R = blendedRVOL(quote.rvolCum, quote.rvol1m);

  // STEP 1-2: Float score + validity
  const FloatScore = clip01((50_000_000 - F) / 48_000_000);
  const FloatValid = F >= 500_000 && F <= 50_000_000;

  // Active whole-dollar level: nearest level at or above current price
  const L = Number.isInteger(M) ? M : Math.ceil(M);

  // STEP 3: Level zones
  const Z_Pre = Math.min(0.12, Math.max(0.025, 0.035 * L));
  const Z_Post = Math.min(0.1, Math.max(0.015, (0.02 + 0.005 * C) * L));
  const Z_Fail = Math.min(0.06, Math.max(0.012, 0.015 * L));

  // STEP 4: Green thresholds
  const RVOL_Green = Math.max(1.4, 2.8 * (1 - 0.35 * C) * (1 - 0.15 * FloatScore));
  const Mom_Green = Math.max(0.2, 0.45 * (1 - 0.25 * C) * (1 - 0.1 * FloatScore));
  const Mom_Retest = -0.1 * (1 + 0.5 * C);

  // STEP 5: Spread thresholds
  const SpreadMaxVal = spreadMax(M);
  const SpreadGreen = SpreadMaxVal * (1 + 0.1 * C);
  const SpreadOrange = 1.5 * SpreadGreen;

  // STEP 6: Pre-breakout GREEN
  const distToLevel = L - M;
  const GREEN_PRE =
    M >= 0.2 &&
    M <= 10.0 &&
    FloatValid &&
    distToLevel >= 0 &&
    distToLevel <= Z_Pre &&
    R >= RVOL_Green &&
    Mom >= Mom_Green &&
    SpreadPct <= SpreadGreen;

  // STEP 7: Post-breakout GREEN (retest)
  const distPastLevel = M - L;
  const GREEN_POST =
    M >= 0.2 &&
    M <= 10.0 &&
    FloatValid &&
    distPastLevel >= 0 &&
    distPastLevel <= Z_Post &&
    R >= RVOL_Green &&
    Mom >= Mom_Retest &&
    A >= -0.5 &&
    SpreadPct <= SpreadGreen;

  // STEP 8: Final GREEN
  const GREEN = GREEN_PRE || GREEN_POST;

  // STEP 9: ORANGE base
  const RVOL_Hold = 0.7 * RVOL_Green;
  const Mom_Hold = 0.05 * (1 - 0.2 * C);
  const ORANGE_BASE =
    M >= 0.2 &&
    M <= 10.0 &&
    SpreadPct <= SpreadOrange &&
    M > L + Z_Post &&
    (R >= RVOL_Hold || Mom >= Mom_Hold);

  // STEP 10: Parabolic override
  const PARABOLIC =
    (M - L) / L >= 0.08 + 0.03 * C || Mom >= 2.25 + 0.75 * C || A >= 1.25;

  // STEP 11: Final ORANGE
  const ORANGE = ORANGE_BASE || PARABOLIC;

  // STEP 12: Failure conditions
  const UNIVERSE_FAIL = M < 0.2 || M > 10.0 || F < 500_000 || F > 50_000_000;
  if (UNIVERSE_FAIL) failReasons.push("Outside universe bounds (price or float)");

  let FAIL_PRE = false;
  let FAIL_POST = false;

  if (M < L) {
    FAIL_PRE =
      M < L - Z_Pre || R < 0.7 * RVOL_Green || Mom < -0.25 || SpreadPct > SpreadOrange;
    if (FAIL_PRE) failReasons.push("Pre-breakout setup failed (distance/volume/momentum/spread)");
  } else {
    FAIL_POST =
      M < L - Z_Fail || R < 0.6 * RVOL_Green || Mom < -0.4 || SpreadPct > SpreadOrange;
    if (FAIL_POST) failReasons.push("Post-breakout setup failed (pulled back too far)");
  }

  const FAIL = UNIVERSE_FAIL || FAIL_PRE || FAIL_POST;

  // STEP 13: Final state — FAIL beats ORANGE beats GREEN, default YELLOW
  let state: RubiconState;
  if (FAIL) {
    state = "YELLOW";
  } else if (ORANGE) {
    state = "ORANGE";
  } else if (GREEN) {
    state = "GREEN";
  } else {
    state = "YELLOW";
  }

  return {
    symbol: quote.symbol,
    state,
    level: L,
    distanceToLevel: L - M,
    floatScore: FloatScore,
    floatValid: FloatValid,
    failed: FAIL,
    failReasons,
    isParabolic: PARABOLIC,
    components: {
      spreadPct: SpreadPct,
      blendedRvol: R,
      momentum: Mom,
      acceleration: A,
    },
    catalystScore: C,
    timestamp: quote.timestamp,
  };
}

function buildFailedResult(
  quote: Quote,
  C: number,
  spreadPctVal: number,
  reasons: string[]
): RubiconResult {
  return {
    symbol: quote.symbol,
    state: "YELLOW",
    level: Math.ceil(midpoint(quote)),
    distanceToLevel: 0,
    floatScore: 0,
    floatValid: false,
    failed: true,
    failReasons: reasons,
    isParabolic: false,
    components: {
      spreadPct: spreadPctVal,
      blendedRvol: 0,
      momentum: 0,
      acceleration: 0,
    },
    catalystScore: C,
    timestamp: quote.timestamp,
  };
}
