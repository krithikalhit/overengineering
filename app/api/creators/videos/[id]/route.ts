import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { deleteVideo, updateVideo } from "@/lib/creators/sheets";
import { CreatorVideo, VIDEO_HEADERS } from "@/lib/creators/types";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Partial<CreatorVideo>;
  const patch: Partial<CreatorVideo> = {};
  for (const h of VIDEO_HEADERS) {
    if (h === "id" || h === "created_at") continue;
    if (typeof body[h] === "string") patch[h] = body[h] as never;
  }
  if ((patch.thumbnail_url ?? "").length > 48_000) {
    return NextResponse.json({ error: "thumbnail too large" }, { status: 413 });
  }
  const result = await updateVideo(id, patch);
  if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(result);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const ok = await deleteVideo(id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
