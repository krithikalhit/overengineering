import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { listMeetings } from "@/lib/notion";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauth" }, { status: 401 });
  try {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 14);
    const meetings = await listMeetings({ from, to });
    return NextResponse.json(meetings);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    );
  }
}
