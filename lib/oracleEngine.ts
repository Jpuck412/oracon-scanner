import { clip, clip01, midpoint, roundPrice, spreadMax, spreadPct } from "@/lib/marketMath";
import type { Direction, OracleResult } from "@/types/scanner";

export type OracleInput = {
  bid: number;
  ask: number;
  last?: number;

  vwap: number;
  openingRangeHigh: number;
  openingRangeLow: number;

  tickSize?: number;

  rvolCumulative: number;
  rvolOneMinute: number;

  catalystScore: number;
  mom: number;

  direction?: Direction;
};

export const ORACLE_CONST = {
  VWAP_MIN: 0.0025,
  VWAP_IDEAL: 0.015,
  VWAP_MAX_BASE: 0.075,
  VWAP_MAX_NEWS: 0.025,

  ORB_MIN: 0.02,
  ORB_IDEAL: 0.2,
  ORB_MAX_BASE: 0.7,
  ORB_MAX_NEWS: 0.2,

  RVOL_MIN_BASE: 2.5,
  RVOL_TARGET_BASE: 5.0,
  RVOL_FLOOR: 1.4,

  MOM_MIN_BASE: 0.35,
  MOM_TARGET_BASE: 1.75,

  SCORE_MIN_BASE: 0.72,
  SCORE_NEWS_RELAX: 0.12,

  OR_PCT_MIN: 0.015,
  OR_PCT_MAX: 0.18,

  BUFFER_TICKS: 2
} as const;

export const computeOracle = (x: OracleInput): OracleResult => {
  const direction = x.direction ?? 1;
  const tickSize = x.tickSize ?? 0.0001;
  const catalyst = clip01(x.catalystScore);

  const mid = midpoint(x.bid, x.ask, x.last);
  const spr = spreadPct(x.bid, x.ask, mid);

  const orh = x.openingRangeHigh;
  const orl = x.openingRangeLow;
  const orw = orh - orl;
  const orm = (orh + orl) / 2;
  const orPct = orm > 0 ? orw / orm : 1;

  const blendedRvol = 0.6 * x.rvolCumulative + 0.4 * x.rvolOneMinute;

  const vwapMax =
    ORACLE_CONST.VWAP_MAX_BASE +
    ORACLE_CONST.VWAP_MAX_NEWS * catalyst;

  const orbMax =
    ORACLE_CONST.ORB_MAX_BASE +
    ORACLE_CONST.ORB_MAX_NEWS * catalyst;

  const rvolMin = Math.max(
    ORACLE_CONST.RVOL_FLOOR,
    ORACLE_CONST.RVOL_MIN_BASE * (1 - 0.35 * catalyst)
  );

  const rvolTarget = Math.max(
    rvolMin + 0.5,
    ORACLE_CONST.RVOL_TARGET_BASE * (1 - 0.25 * catalyst)
  );

  const momMin = ORACLE_CONST.MOM_MIN_BASE * (1 - 0.25 * catalyst);
  const momTarget = ORACLE_CONST.MOM_TARGET_BASE * (1 - 0.15 * catalyst);

  const vwapDistance = x.vwap > 0 ? direction * ((mid - x.vwap) / x.vwap) : -1;

  const sVwap =
    clip01((vwapDistance - ORACLE_CONST.VWAP_MIN) / (ORACLE_CONST.VWAP_IDEAL - ORACLE_CONST.VWAP_MIN)) *
    clip01((vwapMax - vwapDistance) / (vwapMax - ORACLE_CONST.VWAP_IDEAL));

  const orbLevel =
    ((1 + direction) / 2) * orh +
    ((1 - direction) / 2) * orl;

  const orbBreakout = orw > 0 ? direction * ((mid - orbLevel) / orw) : -1;

  const sOrb =
    clip01((orbBreakout - ORACLE_CONST.ORB_MIN) / (ORACLE_CONST.ORB_IDEAL - ORACLE_CONST.ORB_MIN)) *
    clip01((orbMax - orbBreakout) / (orbMax - ORACLE_CONST.ORB_IDEAL));

  const sRvol = clip01((blendedRvol - rvolMin) / (rvolTarget - rvolMin));
  const sMom = clip01((x.mom - momMin) / (momTarget - momMin));

  const oracleScore =
    0.26 * sOrb +
    0.22 * sVwap +
    0.22 * sRvol +
    0.18 * sMom +
    0.12 * catalyst;

  const requiredScore =
    ORACLE_CONST.SCORE_MIN_BASE -
    ORACLE_CONST.SCORE_NEWS_RELAX * catalyst;

  const thetaOrb = clip(
    0.08 *
      (1 - 0.3 * catalyst) *
      (1 - 0.25 * sRvol) *
      (1 - 0.2 * sMom),
    0.015,
    0.1
  );

  const orbBuffer = Math.max(
    ORACLE_CONST.BUFFER_TICKS * tickSize,
    thetaOrb * orw
  );

  const thetaVwap =
    0.003 *
    (1 - 0.25 * catalyst) *
    (1 - 0.15 * sRvol);

  const entryTrigger =
    direction === 1
      ? Math.max(orh + orbBuffer, x.vwap * (1 + thetaVwap))
      : Math.min(orl - orbBuffer, x.vwap * (1 - thetaVwap));

  const chaseKappa = clip(
    0.2 + 0.2 * catalyst + 0.15 * sRvol + 0.1 * sMom,
    0.2,
    0.6
  );

  const maxEntry =
    direction === 1
      ? entryTrigger + chaseKappa * orw
      : entryTrigger - chaseKappa * orw;

  const invalidReasons: string[] = [];

  if (mid < 0.2) invalidReasons.push("PRICE_BELOW_0_20");
  if (mid > 10) invalidReasons.push("PRICE_ABOVE_10");
  if (orw <= Math.max(ORACLE_CONST.OR_PCT_MIN * orm, 10 * tickSize)) {
    invalidReasons.push("OPENING_RANGE_TOO_TIGHT");
  }
  if (orPct > ORACLE_CONST.OR_PCT_MAX) invalidReasons.push("OPENING_RANGE_TOO_WIDE");
  if (spr > spreadMax(mid)) invalidReasons.push("SPREAD_TOO_WIDE");
  if (blendedRvol < rvolMin) invalidReasons.push("RVOL_TOO_LOW");
  if (vwapDistance > vwapMax) invalidReasons.push("VWAP_TOO_EXTENDED");
  if (orbBreakout > orbMax) invalidReasons.push("ORB_TOO_EXTENDED");
  if (x.mom < momMin) invalidReasons.push("MOMENTUM_TOO_LOW");
  if (oracleScore < requiredScore) invalidReasons.push("SCORE_TOO_LOW");

  const valid = invalidReasons.length === 0;

  let suggestedEntry: number | null = null;

  if (valid && direction === 1) {
    if (mid < entryTrigger) {
      suggestedEntry = entryTrigger;
    } else if (x.ask >= entryTrigger && x.ask <= maxEntry) {
      suggestedEntry = x.ask;
    }
  }

  if (valid && direction === -1) {
    if (mid > entryTrigger) {
      suggestedEntry = entryTrigger;
    } else if (x.bid <= entryTrigger && x.bid >= maxEntry) {
      suggestedEntry = x.bid;
    }
  }

  return {
    valid,
    invalidReasons,

    midpoint: roundPrice(mid, tickSize),
    spreadPct: spr,

    vwapDistance,
    orbBreakout,

    sVwap,
    sOrb,
    sRvol,
    sMom,

    oracleScore,
    requiredScore,

    entryTrigger: roundPrice(entryTrigger, tickSize),
    maxEntry: roundPrice(maxEntry, tickSize),
    suggestedEntry: suggestedEntry === null ? null : roundPrice(suggestedEntry, tickSize)
  };
};
