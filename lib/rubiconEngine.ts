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

export const zPre = (L: number): number =>
  Math.min(0.12, Math.max(0.025, 0.035 * L));

export const zPost = (L: number, C: number): number =>
  Math.min(0.1, Math.max(0.015, (0.02 + 0.005 * C) * L));

export const zFail = (L: number): number =>
  Math.min(0.06, Math.max(0.012, 0.015 * L));

export const rvolGreen = (C: number, floatShares: number | null): number => {
  const sf = floatScore(floatShares);

  return Math.max(
    1.4,
    2.8 * (1 - 0.35 * C) * (1 - 0.15 * sf)
  );
};

export const momGreen = (C: number, floatShares: number | null): number => {
  const sf = floatScore(floatShares);

  return Math.max(
    0.2,
    0.45 * (1 - 0.25 * C) * (1 - 0.1 * sf)
  );
};

export const momRetest = (C: number): number =>
  -0.1 * (1 + 0.5 * C);

export const rvolHold = (C: number, floatShares: number | null): number =>
  0.7 * rvolGreen(C, floatShares);

export const momHold = (C: number): number =>
  0.05 * (1 - 0.2 * C);

export const spreadGreen = (price: number, C: number): number =>
  spreadMax(price) * (1 + 0.1 * C);

export const spreadOrange = (price: number, C: number): number =>
  1.5 * spreadGreen(price, C);

export const computeRubicon = (x: RubiconInput): RubiconResult => {
  const C = clip01(x.catalystScore);
  const M = midpoint(x.bid, x.ask, x.last);
  const spr = spreadPct(x.bid, x.ask, M);

  const nextWholeDollar = Math.ceil(M);
  const previousWholeDollar = Math.floor(M);

  const previousState = x.previousState ?? "YELLOW";

  let activeLevel =
    x.previousActiveLevel ??
    (M >= previousWholeDollar && previousWholeDollar >= 1 ? previousWholeDollar : nextWholeDollar);

  if (previousState === "YELLOW") {
    activeLevel = nextWholeDollar;
  }

  const rg = rvolGreen(C, x.floatShares);
  const mg = momGreen(C, x.floatShares);
  const sg = spreadGreen(M, C);

  const preDistance = activeLevel - M;
  const postDistance = M - activeLevel;

  const greenPre =
    M >= 0.2 &&
    M <= 10 &&
    floatValid(x.floatShares) &&
    preDistance >= 0 &&
    preDistance <= zPre(activeLevel) &&
    x.rvol >= rg &&
    x.mom >= mg &&
    spr <= sg;

  const greenPost =
    M >= 0.2 &&
    M <= 10 &&
    floatValid(x.floatShares) &&
    postDistance >= 0 &&
    postDistance <= zPost(activeLevel, C) &&
    x.rvol >= rg &&
    x.mom >= momRetest(C) &&
    x.acceleration >= -0.5 &&
    spr <= sg;

  const green = greenPre || greenPost;

  const parabolic =
    ((M - activeLevel) / activeLevel >= 0.08 + 0.03 * C) ||
    x.mom >= 2.25 + 0.75 * C ||
    x.acceleration >= 1.25;

  const orangeBase =
    M >= 0.2 &&
    M <= 10 &&
    spr <= spreadOrange(M, C) &&
    M > activeLevel + zPost(activeLevel, C) &&
    (x.rvol >= rvolHold(C, x.floatShares) || x.mom >= momHold(C));

  const orange = orangeBase || parabolic;

  const universeFail =
    M < 0.2 ||
    M > 10 ||
    !floatValid(x.floatShares);

  const hasBroken = M >= activeLevel;

  const failPre =
    M < activeLevel - zPre(activeLevel) ||
    x.rvol < 0.7 * rg ||
    x.mom < -0.25 ||
    spr > spreadOrange(M, C);

  const failPost =
    M < activeLevel - zFail(activeLevel) ||
    x.rvol < 0.6 * rg ||
    x.mom < -0.4 ||
    spr > spreadOrange(M, C);

  const fail =
    universeFail ||
    (!hasBroken && failPre) ||
    (hasBroken && failPost);

  let state: RubiconResult["state"];

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
