/**
 * Shared TypeScript types for both Oracle and Rubicon engines,
 * plus the data shapes the UI layer consumes.
 */

export interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  vwap: number;
  orh: number; // 5-min opening range high
  orl: number; // 5-min opening range low
  tick: number; // minimum tick size for this symbol
  rvolCum: number;
  rvol1m: number;
  float: number; // shares
  timestamp: number; // epoch ms
}

export type RubiconState = "GREEN" | "YELLOW" | "ORANGE";

export interface OracleResult {
  symbol: string;
  score: number; // 0-1 OracleScore
  requiredScore: number;
  passed: boolean; // score >= requiredScore AND not invalid
  invalid: boolean;
  invalidReasons: string[];
  entryTrigger: number | null; // OracleEntryTrigger
  maxEntryPrice: number | null;
  suggestedEntry: number | null; // final SuggestedEntry per Step 17
  components: {
    sVwap: number;
    sOrb: number;
    sRvol: number;
    sMom: number;
    momentum: number;
    acceleration: number;
    vwapDistance: number;
    orbBreakout: number;
    blendedRvol: number;
    spreadPct: number;
  };
  catalystScore: number;
  timestamp: number;
}

export interface RubiconResult {
  symbol: string;
  state: RubiconState;
  level: number; // L, active whole-dollar level
  distanceToLevel: number; // signed, in price terms (L - M)
  floatScore: number;
  floatValid: boolean;
  failed: boolean;
  failReasons: string[];
  isParabolic: boolean;
  components: {
    spreadPct: number;
    blendedRvol: number;
    momentum: number;
    acceleration: number;
  };
  catalystScore: number;
  timestamp: number;
}

export interface ScannerRow {
  symbol: string;
  price: number; // midpoint
  quote: Quote;
  oracle: OracleResult;
  rubicon: RubiconResult;
}
