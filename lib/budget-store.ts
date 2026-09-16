import { sheetsClient, spreadsheetId } from "./sheets";

// Shared state for the budget sandbox (public/budget.html), kept in one tab of the
// CRM sheet. Row 1 is a JSON header {rev, updatedAt, chunks}; rows 2..n+1 hold the
// state JSON split into 40k-char chunks (a cell tops out at 50k).
const TAB = "budget_state";
const CHUNK = 40_000;
const MAX_BYTES = 4_000_000;

export type BudgetStateDoc = { state: unknown; rev: number; updatedAt: string };

async function ensureTab(): Promise<void> {
  const meta = await sheetsClient().spreadsheets.get({ spreadsheetId: spreadsheetId() });
  const exists = (meta.data.sheets ?? []).some((s) => s.properties?.title === TAB);
  if (exists) return;
  await sheetsClient().spreadsheets.batchUpdate({
    spreadsheetId: spreadsheetId(),
    requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
  });
}

export async function readBudgetState(): Promise<BudgetStateDoc | null> {
  let values: string[][];
  try {
    const res = await sheetsClient().spreadsheets.values.get({
      spreadsheetId: spreadsheetId(),
      range: `${TAB}!A1:A500`,
    });
    values = (res.data.values ?? []) as string[][];
  } catch {
    return null; // tab doesn't exist yet
  }
  if (values.length === 0 || !values[0]?.[0]) return null;
  try {
    const head = JSON.parse(values[0][0]) as { rev: number; updatedAt: string; chunks: number };
    const json = values
      .slice(1, 1 + head.chunks)
      .map((r) => r[0] ?? "")
      .join("");
    return { state: JSON.parse(json), rev: Number(head.rev) || 0, updatedAt: head.updatedAt };
  } catch {
    return null;
  }
}

export async function writeBudgetState(state: unknown, rev: number): Promise<BudgetStateDoc> {
  const json = JSON.stringify(state);
  if (json.length > MAX_BYTES) throw new Error("state too large");
  await ensureTab();
  const chunks: string[] = [];
  for (let i = 0; i < json.length; i += CHUNK) chunks.push(json.slice(i, i + CHUNK));
  const updatedAt = new Date().toISOString();
  const head = JSON.stringify({ rev, updatedAt, chunks: chunks.length });
  await sheetsClient().spreadsheets.values.clear({
    spreadsheetId: spreadsheetId(),
    range: `${TAB}!A:A`,
  });
  await sheetsClient().spreadsheets.values.update({
    spreadsheetId: spreadsheetId(),
    range: `${TAB}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [[head], ...chunks.map((c) => [c])] },
  });
  return { state, rev, updatedAt };
}
