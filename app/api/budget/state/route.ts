import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { readBudgetState, writeBudgetState } from "@/lib/budget-store";

// Shared store for /budget (public/budget.html). Same admin cookie as the page.
export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const doc = await readBudgetState();
  return NextResponse.json(doc ?? { state: null, rev: 0, updatedAt: null }, {
    headers: { "cache-control": "no-store" },
  });
}

export async function PUT(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { state?: unknown; rev?: number } | null;
  const state = body?.state as { scenarios?: unknown } | undefined;
  if (!state || !Array.isArray(state.scenarios) || state.scenarios.length === 0) {
    return NextResponse.json({ error: "state.scenarios required" }, { status: 400 });
  }
  const rev = Number(body?.rev) || Date.now();
  try {
    const saved = await writeBudgetState(state, rev);
    return NextResponse.json({ rev: saved.rev, updatedAt: saved.updatedAt });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "write failed";
    return NextResponse.json({ error: msg }, { status: msg === "state too large" ? 413 : 500 });
  }
}
