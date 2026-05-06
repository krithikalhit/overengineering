import { NextRequest, NextResponse } from "next/server";
import { appendIntro, listInvestors, logActivity, upsertConnector } from "@/lib/sheets";
import { IntroRelationship } from "@/lib/types";
import { newId } from "@/lib/id";

type Body = {
  investor_id: string;
  connector: { name: string; email: string; company?: string };
  relationship_strength?: string;
  notes?: string;
};

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<Body>;
  if (!body.investor_id || !body.connector?.name || !body.connector.email) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  if (!isValidEmail(body.connector.email)) {
    return NextResponse.json({ error: "invalid email" }, { status: 400 });
  }

  // Verify investor exists
  const investors = await listInvestors();
  const inv = investors.find((i) => i.id === body.investor_id);
  if (!inv) return NextResponse.json({ error: "unknown investor" }, { status: 404 });

  const now = new Date().toISOString();

  await upsertConnector({
    id: newId("con"),
    name: body.connector.name.trim(),
    email: body.connector.email.trim().toLowerCase(),
    company: body.connector.company?.trim() ?? "",
    notes: "",
    created_at: now,
  });

  const intro: IntroRelationship = {
    id: newId("intro"),
    investor_id: body.investor_id,
    connector_name: body.connector.name.trim(),
    connector_email: body.connector.email.trim().toLowerCase(),
    connector_company: body.connector.company?.trim() ?? "",
    relationship_strength: body.relationship_strength ?? "",
    intro_status: "offered",
    intro_requested_at: "",
    intro_completed_at: "",
    notes: body.notes ?? "",
    created_at: now,
  };
  await appendIntro(intro);
  await logActivity({
    id: newId("act"),
    ts: now,
    actor: body.connector.email,
    action: "intro.offered",
    target_type: "investor",
    target_id: body.investor_id,
    details: `${body.connector.name} → ${inv.full_name}`,
  }).catch(() => {});

  return NextResponse.json({ ok: true }, { status: 201 });
}
