import { NextResponse } from "next/server";
import { userSheetsClient } from "@/lib/runway/session";
import { getRunwaySummary, RunwayError } from "@/lib/runway/sheets";

export const dynamic = "force-dynamic";

export async function GET() {
  const sheets = await userSheetsClient();
  if (!sheets) return NextResponse.json({ error: "signin_required" }, { status: 401 });
  try {
    return NextResponse.json(await getRunwaySummary(sheets));
  } catch (err) {
    if (err instanceof RunwayError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const status = (err as { status?: number }).status;
    if (status === 403 || status === 404) {
      return NextResponse.json(
        { error: "Your Google account cannot open the master sheet. Ask for access, then retry." },
        { status: 403 },
      );
    }
    throw err;
  }
}
