import { clip01, midpoint, spreadMax, spreadPct } from "@/lib/marketMath";
import type { RubiconResult, RubiconState } from "@/types/scanner";

export type RubiconInput = {
  bid: number;
  ask: number;
  last?: number;

  rvol: number;
  catalystScore: number;
  floatShares: number | null;

  mom: number;
  acceleration: number;

  previousState?: RubiconState;
  previousActiveLevel?: number | null;
};

export const floatScore = (floatShares: number | null): number => {
  if (!floatShares || floatShares <= 0) return 0;
  return clip01((50_000_000 - floatShares) / 48_000_000);
};

export const floatValid = (floatShares: number | null): boolean =>
  !!floatShares && floatShares >= 500_000 && floatShares <= 50_000_000;

export const zPre = (level: number): number =>
  Math.min(0.12, Math.max(0.025, 0.035 * level));

export const zPost = (level: number, catalyst: number): number =>
  Math.min(0.1, Math.max(0.015, (0.02 + 0.005 * catalyst) * level));

export const zFail = (level: number): number =>
  Math.min(0.06, Math.max(0.012, 0.015 * level));

export const rvolGreen = (
  catalyst: number,
  floatShares: number | null
): number => {
  const sf = floatScore(floatShares);

  return Math.max(
    1.4,
    2.8 * (1 - 0.35 * catalyst) * (1 - 0.15 * sf)
  );
};

export const momGreen = (
  catalyst: number,
  floatShares: number | null
): number => {
  const sf = floatScore(floatShares);

  return Math.max(
    0.2,
    0.45 * (1 - 0.25 * catalyst) * (1 - 0.1 * sf)
  );
};

export const momRetest = (catalyst: number): number =>
  -0.1 * (1 + 0.5 * catalyst);

export const rvolHold = (
  catalyst: number,
  floatShares: number | null
): number =>
  0.7 * rvolGreen(catalyst, floatShares);

export const momHold = (catalyst: number): number =>
  0.05 * (1 - 0.2 * catalyst);

export const spreadGreen = (price: number, catalyst: number): number =>
  spreadMax(price) * (1 + 0.1 * catalyst);

export const spreadOrange = (price: number, catalyst: number): number =>
  1.5 * spreadGreen(price, catalyst);

export const computeRubicon = (x: RubiconInput): RubiconResult => {
  const catalyst = clip01(x.catalystScore);
  const mid = midpoint(x.bid, x.ask, x.last);
  const spr = spreadPct(x.bid, x.ask, mid);

  const nextWholeDollar = Math.ceil(mid);
  const previousWholeDollar = Math.floor(mid);

  const previousState = x.previousState ?? "YELLOW";

  let activeLevel =
    x.previousActiveLevel ??
    (mid >= previousWholeDollar && previousWholeDollar >= 1
      ? previousWholeDollar
      : nextWholeDollar);

  if (previousState === "YELLOW") {
    activeLevel = nextWholeDollar;
  }

  const rg = rvolGreen(catalyst, x.floatShares);
  const mg = momGreen(catalyst, x.floatShares);
  const sg = spreadGreen(mid, catalyst);

  const preDistance = activeLevel - mid;
  const postDistance = mid - activeLevel;

  const greenPre =
    mid >= 0.2 &&
    mid <= 10 &&
    floatValid(x.floatShares) &&
    preDistance >= 0 &&
    preDistance <= zPre(activeLevel) &&
    x.rvol >= rg &&
    x.mom >= mg &&
    spr <= sg;

  const greenPost =
    mid >= 0.2 &&
    mid <= 10 &&
    floatValid(x.floatShares) &&
    postDistance >= 0 &&
    postDistance <= zPost(activeLevel, catalyst) &&
    x.rvol >= rg &&
    x.mom >= momRetest(catalyst) &&
    x.acceleration >= -0.5 &&
    spr <= sg;

  const green = greenPre || greenPost;

  const parabolic =
    ((mid - activeLevel) / activeLevel >= 0.08 + 0.03 * catalyst) ||
    x.mom >= 2.25 + 0.75 * catalyst ||
    x.acceleration >= 1.25;

  const orangeBase =
    mid >= 0.2 &&
    mid <= 10 &&
    spr <= spreadOrange(mid, catalyst) &&
    mid > activeLevel + zPost(activeLevel, catalyst) &&
    (x.rvol >= rvolHold(catalyst, x.floatShares) || x.mom >= momHold(catalyst));

  const orange = orangeBase || parabolic;

  const universeFail =
    mid < 0.2 ||
    mid > 10 ||
    !floatValid(x.floatShares);

  const hasBroken = mid >= activeLevel;

  const failPre =
    mid < activeLevel - zPre(activeLevel) ||
    x.rvol < 0.7 * rg ||
    x.mom < -0.25 ||
    spr > spreadOrange(mid, catalyst);

  const failPost =
    mid < activeLevel - zFail(activeLevel) ||
    x.rvol < 0.6 * rg ||
    x.mom < -0.4 ||
    spr > spreadOrange(mid, catalyst);

  const fail =
    universeFail ||
    (!hasBroken && failPre) ||
    (hasBroken && failPost);

  let state: RubiconState;

  if (fail) state = "YELLOW";
  else if (orange) state = "ORANGE";
  else if (green) state = "GREEN";
  else state = "YELLOW";

  if (state === "YELLOW") {
    activeLevel = nextWholeDollar;
  }

  return {
    state,
    activeLevel,
    nextWholeDollar,
    previousWholeDollar,

    greenPre,
    greenPost,
    green,
    orange,
    parabolic,
    fail,

    rvolGreen: rg,
    momGreen: mg,
    spreadGreen: sg
  };
};
