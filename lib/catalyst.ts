import { clip01 } from "@/lib/marketMath";
import type { FmpNewsItem } from "@/types/scanner";

const MAJOR_KEYWORDS = [
  "fda approval",
  "approved by fda",
  "phase 3",
  "phase iii",
  "clinical trial met",
  "positive topline",
  "merger",
  "acquisition",
  "buyout",
  "definitive agreement",
  "earnings beat",
  "raises guidance",
  "guidance raised",
  "contract awarded",
  "major contract",
  "partnership",
  "strategic collaboration"
];

const STRONG_KEYWORDS = [
  "fda",
  "earnings",
  "revenue growth",
  "guidance",
  "contract",
  "patent",
  "launches",
  "approval",
  "grant",
  "nasdaq compliance",
  "debt financing",
  "asset sale"
];

const WEAK_KEYWORDS = [
  "announces",
  "update",
  "presentation",
  "conference",
  "interview",
  "letter to shareholders"
];

const ageHours = (dateString?: string): number => {
  if (!dateString) return 999;
  const t = new Date(dateString).getTime();
  if (!Number.isFinite(t)) return 999;
  return Math.max(0, (Date.now() - t) / 36e5);
};

const keywordWeight = (text: string): number => {
  const s = text.toLowerCase();

  if (MAJOR_KEYWORDS.some((k) => s.includes(k))) return 1.0;
  if (STRONG_KEYWORDS.some((k) => s.includes(k))) return 0.75;
  if (WEAK_KEYWORDS.some((k) => s.includes(k))) return 0.35;

  return 0;
};

export const scoreCatalystFromNews = (
  symbol: string,
  news: FmpNewsItem[]
): { score: number; headline: string | null } => {
  let bestScore = 0;
  let bestHeadline: string | null = null;

  for (const item of news) {
    const joined = `${item.title ?? ""} ${item.text ?? ""}`;
    const kw = keywordWeight(joined);
    if (kw <= 0) continue;

    const hours = ageHours(item.publishedDate);

    const recency =
      hours <= 4 ? 1.0 :
      hours <= 12 ? 0.85 :
      hours <= 24 ? 0.7 :
      hours <= 48 ? 0.45 :
      0.2;

    const symbolMatch =
      !item.symbol ||
      item.symbol.toUpperCase() === symbol.toUpperCase()
        ? 1.0
        : 0.7;

    const score = clip01(kw * recency * symbolMatch);

    if (score > bestScore) {
      bestScore = score;
      bestHeadline = item.title ?? null;
    }
  }

  return {
    score: clip01(bestScore),
    headline: bestHeadline
  };
};
