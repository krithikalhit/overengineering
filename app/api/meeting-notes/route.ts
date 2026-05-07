import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { listMeetingNotes, upsertMeetingNote } from "@/lib/sheets";
import { MeetingNote } from "@/lib/types";
import { newId } from "@/lib/id";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const notes = await listMeetingNotes();
  return NextResponse.json(notes);
}

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Partial<MeetingNote>;
  if (!body.event_id) {
    return NextResponse.json({ error: "event_id required" }, { status: 400 });
  }
  const note: MeetingNote = {
    id: body.id ?? newId("mtg"),
    event_id: body.event_id,
    investor_id: body.investor_id ?? "",
    event_title: body.event_title ?? "",
    event_start: body.event_start ?? "",
    granola_url: body.granola_url ?? "",
    notes: body.notes ?? "",
    updated_at: new Date().toISOString(),
  };
  const saved = await upsertMeetingNote(note);
  return NextResponse.json(saved);
}
