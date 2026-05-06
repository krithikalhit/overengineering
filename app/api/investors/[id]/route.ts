import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { logActivity, updateInvestor } from "@/lib/sheets";
import { Investor } from "@/lib/types";
import { newId } from "@/lib/id";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const patch = (await req.json().catch(() => ({}))) as Partial<Investor>;
  const result = await updateInvestor(id, patch);
  if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });
  await logActivity({
    id: newId("act"),
    ts: new Date().toISOString(),
    actor: "admin",
    action: "investor.update",
    target_type: "investor",
    target_id: id,
    details: Object.keys(patch).join(","),
  }).catch(() => {});
  return NextResponse.json(result);
}
