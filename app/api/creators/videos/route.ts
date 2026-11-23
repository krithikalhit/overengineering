import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { newId } from "@/lib/id";
import { appendVideo, listVideos } from "@/lib/creators/sheets";
import { CreatorVideo, VIDEO_HEADERS, emptyVideo } from "@/lib/creators/types";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const videos = await listVideos();
  return NextResponse.json({ videos }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Partial<CreatorVideo> | null;
  if (!body?.url) return NextResponse.json({ error: "url required" }, { status: 400 });
  const now = new Date().toISOString();
  const v = emptyVideo();
  for (const h of VIDEO_HEADERS) if (typeof body[h] === "string") v[h] = body[h] as never;
  if ((v.thumbnail_url ?? "").length > 48_000) {
    return NextResponse.json({ error: "thumbnail too large" }, { status: 413 });
  }
  v.id = newId("vid");
  v.created_at = now;
  v.updated_at = now;
  if (!v.posted_at) v.posted_at = now.slice(0, 10);
  await appendVideo(v);
  return NextResponse.json(v);
}
