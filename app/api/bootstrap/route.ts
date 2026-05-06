import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { bootstrap } from "@/lib/sheets";

export async function POST() {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauth" }, { status: 401 });
  try {
    await bootstrap();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    );
  }
}
