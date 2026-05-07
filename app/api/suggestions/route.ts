import { NextRequest, NextResponse } from "next/server";
import { appendSuggestion, logActivity } from "@/lib/sheets";
import { SuggestedIntro } from "@/lib/types";
import { newId } from "@/lib/id";

type Body = {
  suggester: { name: string; email: string; company?: string };
  person: { name: string; company?: string; email?: string };
  notes?: string;
};

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<Body>;
  if (
    !body.suggester?.name?.trim() ||
    !body.suggester.email?.trim() ||
    !body.person?.name?.trim()
  ) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  if (!isValidEmail(body.suggester.email)) {
    return NextResponse.json({ error: "invalid suggester email" }, { status: 400 });
  }
  if (body.person.email && !isValidEmail(body.person.email)) {
    return NextResponse.json({ error: "invalid person email" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const entry: SuggestedIntro = {
    id: newId("sug"),
    suggester_name: body.suggester.name.trim(),
    suggester_email: body.suggester.email.trim().toLowerCase(),
    suggester_company: body.suggester.company?.trim() ?? "",
    person_name: body.person.name.trim(),
    person_company: body.person.company?.trim() ?? "",
    person_email: body.person.email?.trim().toLowerCase() ?? "",
    notes: body.notes?.trim() ?? "",
    created_at: now,
  };
  await appendSuggestion(entry);
  await logActivity({
    id: newId("act"),
    ts: now,
    actor: entry.suggester_email,
    action: "suggestion.created",
    target_type: "person",
    target_id: entry.id,
    details: `${entry.suggester_name} → ${entry.person_name}${entry.person_company ? " @ " + entry.person_company : ""}`,
  }).catch(() => {});
  return NextResponse.json({ ok: true }, { status: 201 });
}
