import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { appendInvestor, listInvestors, logActivity } from "@/lib/sheets";
import { Investor } from "@/lib/types";
import { newId } from "@/lib/id";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const investors = await listInvestors();
  return NextResponse.json(investors);
}

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Partial<Investor>;
  if (!body.full_name?.trim()) {
    return NextResponse.json({ error: "full_name required" }, { status: 400 });
  }
  const now = new Date().toISOString();
  const inv: Investor = {
    id: newId("inv"),
    full_name: body.full_name.trim(),
    company_project: body.company_project ?? "",
    category: body.category ?? "",
    relevance: body.relevance ?? "",
    node: body.node ?? "",
    notes: body.notes ?? "",
    email: body.email ?? "",
    linkedin: body.linkedin ?? "",
    website: body.website ?? "",
    location: body.location ?? "",
    tags: body.tags ?? "",
    priority: body.priority ?? "",
    status: body.status ?? "",
    stage: body.stage ?? "not_started",
    last_contacted: body.last_contacted ?? "",
    next_steps: body.next_steps ?? "",
    follow_up_date: body.follow_up_date ?? "",
    meeting_status: body.meeting_status ?? "",
    meeting_notes: body.meeting_notes ?? "",
    conviction_score: body.conviction_score ?? "",
    created_at: now,
    updated_at: now,
  };
  await appendInvestor(inv);
  await logActivity({
    id: newId("act"),
    ts: now,
    actor: "admin",
    action: "investor.create",
    target_type: "investor",
    target_id: inv.id,
    details: inv.full_name,
  }).catch(() => {});
  return NextResponse.json(inv, { status: 201 });
}
