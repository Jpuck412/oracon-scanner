import { NextResponse } from "next/server";
import { buildScannerRows } from "@/lib/dataAdapter";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const limit = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get("limit") ?? 40))
    );

    const rows = await buildScannerRows(limit);

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      universe: "$0.20-$10.00",
      count: rows.length,
      rows
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown scanner error";

    return NextResponse.json(
      {
        ok: false,
        error: message
      },
      {
        status: 500
      }
    );
  }
}
