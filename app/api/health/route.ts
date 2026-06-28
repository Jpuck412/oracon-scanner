import { NextResponse } from "next/server";
import { checkTradierAuth } from "@/lib/tradierClient";
import { getFmpGainersSafe, getUniverseSymbols } from "@/lib/dataAdapter";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const tradier = await checkTradierAuth();

  const fmpGainers = await getFmpGainersSafe();

  let universe: string[] = [];

  try {
    universe = await getUniverseSymbols(20);
  } catch {
    universe = [];
  }

  return NextResponse.json({
    ok: tradier.ok && universe.length > 0,
    env: {
      hasFmpKey: Boolean(process.env.FMPKEY),
      hasTradierKey: Boolean(process.env.TRADIER_API_KEY),
      tradierEnv: process.env.TRADIER_ENV ?? "live",
      hasScannerSymbols: Boolean(process.env.SCANNER_SYMBOLS)
    },
    tradier,
    fmp: {
      biggestGainersAvailable: fmpGainers.length > 0,
      biggestGainersCount: fmpGainers.length,
      note:
        fmpGainers.length > 0
          ? "FMP biggest-gainers OK"
          : "FMP biggest-gainers unavailable or restricted; scanner will use SCANNER_SYMBOLS fallback."
    },
    universe
  });
}
