import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { fetchUtmStats, posthogConfigured } from "@/lib/creators/posthog";

export const dynamic = "force-dynamic";

// GET /api/creators/stats?campaigns=a,b,c&since=2026-08-01
export async function GET(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!posthogConfigured()) {
    return NextResponse.json({ configured: false, rows: [] });
  }
  const q = req.nextUrl.searchParams;
  const campaigns = (q.get("campaigns") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const sinceRaw = q.get("since");
  let since = sinceRaw ? new Date(sinceRaw) : new Date(Date.now() - 180 * 86400_000);
  if (Number.isNaN(since.getTime())) since = new Date(Date.now() - 180 * 86400_000);
  // Never scan further back than a year, whatever the client asks for.
  const floor = new Date(Date.now() - 365 * 86400_000);
  if (since < floor) since = floor;
  try {
    const rows = await fetchUtmStats(since, campaigns);
    return NextResponse.json(
      { configured: true, rows, fetched_at: new Date().toISOString() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "PostHog query failed";
    return NextResponse.json({ configured: true, rows: [], error: msg }, { status: 502 });
  }
}
