import { google, sheets_v4 } from "googleapis";
import { JWT } from "google-auth-library";
import {
  ACTIVITY_HEADERS,
  ActivityEntry,
  CONNECTOR_HEADERS,
  Connector,
  INTRO_HEADERS,
  INVESTOR_HEADERS,
  IntroRelationship,
  Investor,
  MEETING_NOTE_HEADERS,
  MeetingNote,
  SUGGESTED_INTRO_HEADERS,
  SuggestedIntro,
} from "./types";

const SHEET_INVESTORS = "investors";
const SHEET_CONNECTORS = "connectors";
const SHEET_INTROS = "intro_relationships";
const SHEET_ACTIVITY = "activity_log";
const SHEET_MEETING_NOTES = "meeting_notes";
const SHEET_SUGGESTIONS = "suggested_intros";

let cached: sheets_v4.Sheets | null = null;

function client(): sheets_v4.Sheets {
  if (cached) return cached;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY");
  }
  const auth = new JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  cached = google.sheets({ version: "v4", auth });
  return cached;
}

function spreadsheetId(): string {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("Missing GOOGLE_SHEET_ID");
  return id;
}

async function readSheet(range: string): Promise<string[][]> {
  const res = await client().spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range,
  });
  return (res.data.values ?? []) as string[][];
}

function rowsToObjects<T extends Record<string, string>>(
  values: string[][],
  headers: readonly (keyof T)[],
): T[] {
  if (values.length === 0) return [];
  const [headerRow, ...rest] = values;
  // Tolerate user-edited header order: build a map header -> column index
  const idx: Record<string, number> = {};
  headerRow.forEach((h, i) => {
    idx[h.trim()] = i;
  });
  return rest
    .filter((r) => r.some((c) => (c ?? "").trim() !== ""))
    .map((row) => {
      const obj = {} as Record<string, string>;
      for (const h of headers) {
        const i = idx[h as string];
        obj[h as string] = i === undefined ? "" : (row[i] ?? "").toString();
      }
      return obj as T;
    });
}

function objectsToRows<T extends Record<string, string>>(
  objs: T[],
  headers: readonly (keyof T)[],
): string[][] {
  return objs.map((o) => headers.map((h) => (o[h] ?? "").toString()));
}

async function ensureHeaders(sheet: string, headers: readonly string[]): Promise<void> {
  const existing = await readSheet(`${sheet}!1:1`).catch(() => [] as string[][]);
  const current = existing[0] ?? [];
  if (current.join("|") === headers.join("|")) return;
  await client().spreadsheets.values.update({
    spreadsheetId: spreadsheetId(),
    range: `${sheet}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [headers as string[]] },
  });
}

export async function bootstrap(): Promise<void> {
  // Read spreadsheet metadata to ensure tabs exist; create missing ones.
  const meta = await client().spreadsheets.get({ spreadsheetId: spreadsheetId() });
  const existing = new Set(
    (meta.data.sheets ?? []).map((s) => s.properties?.title).filter(Boolean) as string[],
  );
  const wanted = [
    SHEET_INVESTORS,
    SHEET_CONNECTORS,
    SHEET_INTROS,
    SHEET_ACTIVITY,
    SHEET_MEETING_NOTES,
    SHEET_SUGGESTIONS,
  ];
  const missing = wanted.filter((w) => !existing.has(w));
  if (missing.length > 0) {
    await client().spreadsheets.batchUpdate({
      spreadsheetId: spreadsheetId(),
      requestBody: {
        requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
      },
    });
  }
  await ensureHeaders(SHEET_INVESTORS, INVESTOR_HEADERS as readonly string[]);
  await ensureHeaders(SHEET_CONNECTORS, CONNECTOR_HEADERS as readonly string[]);
  await ensureHeaders(SHEET_INTROS, INTRO_HEADERS as readonly string[]);
  await ensureHeaders(SHEET_ACTIVITY, ACTIVITY_HEADERS as readonly string[]);
  await ensureHeaders(SHEET_MEETING_NOTES, MEETING_NOTE_HEADERS as readonly string[]);
  await ensureHeaders(SHEET_SUGGESTIONS, SUGGESTED_INTRO_HEADERS as readonly string[]);
}

// ---------- Investors ----------

export async function listInvestors(): Promise<Investor[]> {
  const values = await readSheet(`${SHEET_INVESTORS}!A1:Z`);
  return rowsToObjects<Investor>(values, INVESTOR_HEADERS);
}

export async function appendInvestor(inv: Investor): Promise<void> {
  await client().spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range: `${SHEET_INVESTORS}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: objectsToRows([inv], INVESTOR_HEADERS) },
  });
}

export async function updateInvestor(id: string, patch: Partial<Investor>): Promise<Investor | null> {
  const all = await listInvestors();
  const idx = all.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  const updated: Investor = { ...all[idx], ...patch, id, updated_at: new Date().toISOString() };
  // Row offset: header is row 1; data starts row 2.
  const rowNumber = idx + 2;
  await client().spreadsheets.values.update({
    spreadsheetId: spreadsheetId(),
    range: `${SHEET_INVESTORS}!A${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: objectsToRows([updated], INVESTOR_HEADERS) },
  });
  return updated;
}

// ---------- Intros ----------

export async function listIntros(): Promise<IntroRelationship[]> {
  const values = await readSheet(`${SHEET_INTROS}!A1:Z`);
  return rowsToObjects<IntroRelationship>(values, INTRO_HEADERS);
}

export async function appendIntro(intro: IntroRelationship): Promise<void> {
  await client().spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range: `${SHEET_INTROS}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: objectsToRows([intro], INTRO_HEADERS) },
  });
}

export async function updateIntro(
  id: string,
  patch: Partial<IntroRelationship>,
): Promise<IntroRelationship | null> {
  const all = await listIntros();
  const idx = all.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  const updated: IntroRelationship = { ...all[idx], ...patch, id };
  const rowNumber = idx + 2;
  await client().spreadsheets.values.update({
    spreadsheetId: spreadsheetId(),
    range: `${SHEET_INTROS}!A${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: objectsToRows([updated], INTRO_HEADERS) },
  });
  return updated;
}

// ---------- Connectors ----------

export async function listConnectors(): Promise<Connector[]> {
  const values = await readSheet(`${SHEET_CONNECTORS}!A1:Z`);
  return rowsToObjects<Connector>(values, CONNECTOR_HEADERS);
}

export async function upsertConnector(c: Connector): Promise<Connector> {
  const all = await listConnectors();
  const match = all.find(
    (x) => x.email && c.email && x.email.toLowerCase() === c.email.toLowerCase(),
  );
  if (match) return match;
  await client().spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range: `${SHEET_CONNECTORS}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: objectsToRows([c], CONNECTOR_HEADERS) },
  });
  return c;
}

// ---------- Suggested intros ----------

export async function appendSuggestion(s: SuggestedIntro): Promise<void> {
  await client().spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range: `${SHEET_SUGGESTIONS}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: objectsToRows([s], SUGGESTED_INTRO_HEADERS) },
  });
}

// ---------- Meeting notes ----------

export async function listMeetingNotes(): Promise<MeetingNote[]> {
  const values = await readSheet(`${SHEET_MEETING_NOTES}!A1:Z`);
  return rowsToObjects<MeetingNote>(values, MEETING_NOTE_HEADERS);
}

export async function upsertMeetingNote(note: MeetingNote): Promise<MeetingNote> {
  const all = await listMeetingNotes();
  const idx = all.findIndex((n) => n.event_id === note.event_id);
  const updated: MeetingNote = { ...note, updated_at: new Date().toISOString() };
  if (idx < 0) {
    await client().spreadsheets.values.append({
      spreadsheetId: spreadsheetId(),
      range: `${SHEET_MEETING_NOTES}!A1`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: objectsToRows([updated], MEETING_NOTE_HEADERS) },
    });
    return updated;
  }
  const merged: MeetingNote = { ...all[idx], ...updated, id: all[idx].id };
  const rowNumber = idx + 2;
  await client().spreadsheets.values.update({
    spreadsheetId: spreadsheetId(),
    range: `${SHEET_MEETING_NOTES}!A${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: objectsToRows([merged], MEETING_NOTE_HEADERS) },
  });
  return merged;
}

// ---------- Activity ----------

export async function logActivity(entry: ActivityEntry): Promise<void> {
  await client().spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range: `${SHEET_ACTIVITY}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: objectsToRows([entry], ACTIVITY_HEADERS) },
  });
}
