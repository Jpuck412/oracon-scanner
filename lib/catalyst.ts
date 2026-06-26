/**
 * Catalyst scoring module — returns C (0 to 1) consumed by both
 * Oracle and Rubicon engines to relax/tighten thresholds.
 *
 * CURRENT STATE: Stub implementation. Returns 0 (no catalyst) for
 * everything until a real news/sentiment source is wired in (likely
 * candidate: Gemini API for headline parsing, once that decision is
 * made). This lets both engines run and be tested TODAY without
 * blocking on an undecided data source.
 *
 * When real data is wired in, only the body of getCatalystScore()
 * needs to change — the function signature and return contract
 * stay identical, so nothing downstream breaks.
 */

export interface CatalystResult {
  score: number;       // 0 to 1
  hasNews: boolean;     // quick boolean check for UI badges
  headline?: string;    // optional, for display in the scanner UI
  source?: string;      // where the catalyst was detected (e.g. "PR Newswire")
}

/**
 * Get the catalyst score for a symbol.
 * STUB: always returns 0/no-catalyst until real news source is integrated.
 */
export async function getCatalystScore(symbol: string): Promise<CatalystResult> {
  // TODO: wire in real news/sentiment source (Gemini API or news wire API)
  // For now, every symbol is treated as having no catalyst, meaning both
  // engines run their FULL/STRICT thresholds with zero relief.
  return {
    score: 0,
    hasNews: false,
  };
}

/**
 * Batch version — fetch catalyst scores for multiple symbols at once.
 * Useful for the scanner's main loop, which evaluates many tickers per tick.
 * Stub just maps the single-symbol stub, but a real implementation could
 * batch the API call for efficiency.
 */
export async function getCatalystScores(
  symbols: string[]
): Promise<Map<string, CatalystResult>> {
  const results = new Map<string, CatalystResult>();

  for (const symbol of symbols) {
    results.set(symbol.toUpperCase(), await getCatalystScore(symbol));
  }

  return results;
}
