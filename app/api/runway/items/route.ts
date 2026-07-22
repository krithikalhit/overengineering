import { NextRequest, NextResponse } from "next/server";
import { userSheetsClient } from "@/lib/runway/session";
import { addLineItem, RunwayError } from "@/lib/runway/sheets";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sheets = await userSheetsClient();
  if (!sheets) return NextResponse.json({ error: "signin_required" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    categoryKey?: string;
    label?: string;
    amount?: number;
    startMonth?: string;
  } | null;
  if (!body?.categoryKey || !body.label || typeof body.amount !== "number") {
    return NextResponse.json(
      { error: "categoryKey, label and a numeric amount are required" },
      { status: 400 },
    );
  }

  try {
    const result = await addLineItem(sheets, {
      categoryKey: body.categoryKey,
      label: body.label,
      amount: body.amount,
      startMonth: body.startMonth || undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof RunwayError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const status = (err as { status?: number }).status;
    if (status === 403) {
      return NextResponse.json(
        { error: "Your Google account cannot edit the master sheet." },
        { status: 403 },
      );
    }
    throw err;
  }
}
