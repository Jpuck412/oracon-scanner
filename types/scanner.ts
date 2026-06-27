export type Direction = 1 | -1;

export type RubiconState = "YELLOW" | "GREEN" | "ORANGE";

export type TradierQuote = {
  symbol: string;
  description?: string;
  exch?: string;
  type?: string;

  last?: number;
  change?: number;
  volume?: number;

  open?: number;
  high?: number;
  low?: number;
  close?: number;
  prevclose?: number;

  bid?: number;
  ask?: number;
  bidsize?: number;
  asksize?: number;

  average_volume?: number;
  change_percentage?: number;
  last_volume?: number;
  trade_date?: number;
};

export type TradierTimeSaleBar = {
  time: string;
  timestamp?: number;

  price?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number;
};

export type FmpGainer = {
  symbol: string;
  name?: string;
  price?: number;
  change?: number;
  changesPercentage?: number;
  changePercentage?: number;
};

export type FmpFloatResponse = {
  symbol?: string;
  freeFloat?: number;
  floatShares?: number;
  outstandingShares?: number;
  source?: string;
};

export type FmpNewsItem = {
  symbol?: string;
  publishedDate?: string;
  publisher?: string;
  title?: string;
  image?: string;
  site?: string;
  text?: string;
  url?: string;
};

export type MomentumResult = {
  v1: number;
  v3: number;
  v5: number;
  acceleration: number;
  mom: number;
};

export type IntradayContext = {
  vwap: number;
  openingRangeHigh: number;
  openingRangeLow: number;
  rvolCumulative: number;
  rvolOneMinute: number;
  cumulativeVolume: number;
  oneMinuteVolume: number;
  m1: number;
  m3: number;
  m5: number;
};

export type OracleResult = {
  valid: boolean;
  invalidReasons: string[];

  midpoint: number;
  spreadPct: number;

  vwapDistance: number;
  orbBreakout: number;

  sVwap: number;
  sOrb: number;
  sRvol: number;
  sMom: number;

  oracleScore: number;
  requiredScore: number;

  entryTrigger: number;
  maxEntry: number;
  suggestedEntry: number | null;
};

export type RubiconResult = {
  state: RubiconState;
  activeLevel: number;
  nextWholeDollar: number;
  previousWholeDollar: number;

  greenPre: boolean;
  greenPost: boolean;
  green: boolean;
  orange: boolean;
  parabolic: boolean;
  fail: boolean;

  rvolGreen: number;
  momGreen: number;
  spreadGreen: number;
};

export type ScannerRow = {
  symbol: string;
  name?: string;

  price: number;
  bid: number;
  ask: number;
  spreadPct: number;

  volume: number;
  averageVolume: number;
  rvol: number;

  floatShares: number | null;
  catalystScore: number;
  catalystHeadline: string | null;

  vwap: number;
  openingRangeHigh: number;
  openingRangeLow: number;

  momentum: MomentumResult;
  oracle: OracleResult;
  rubicon: RubiconResult;
};
