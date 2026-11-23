import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { fetchFollowers, resolveVideo } from "@/lib/creators/resolve";
import { Platform } from "@/lib/creators/types";

export const dynamic = "force-dynamic";

// GET /api/creators/resolve?url=<video link>            -> metadata for a pasted link
// GET /api/creators/resolve?followers=1&platform=..&handle=..&profile=..  -> just the count
export async function GET(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const q = req.nextUrl.searchParams;
  if (q.get("followers")) {
    const platform = (q.get("platform") ?? "other") as Platform;
    const followers = await fetchFollowers(platform, q.get("handle") ?? "", q.get("profile") ?? "");
    return NextResponse.json({ followers, checked_at: new Date().toISOString() });
  }
  const url = q.get("url") ?? "";
  const resolved = await resolveVideo(url);
  if (!resolved) {
    return NextResponse.json(
      { error: "That doesn't look like an Instagram, YouTube or TikTok video link." },
      { status: 400 },
    );
  }
  return NextResponse.json(resolved);
}
