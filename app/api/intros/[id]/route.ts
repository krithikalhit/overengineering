import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { logActivity, updateIntro } from "@/lib/sheets";
import { IntroRelationship } from "@/lib/types";
import { newId } from "@/lib/id";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const patch = (await req.json().catch(() => ({}))) as Partial<IntroRelationship>;
  const result = await updateIntro(id, patch);
  if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });
  await logActivity({
    id: newId("act"),
    ts: new Date().toISOString(),
    actor: "admin",
    action: "intro.update",
    target_type: "intro",
    target_id: id,
    details: patch.intro_status ?? Object.keys(patch).join(","),
  }).catch(() => {});
  return NextResponse.json(result);
}
