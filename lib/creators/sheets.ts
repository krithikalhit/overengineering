import { sheetsClient, spreadsheetId } from "../sheets";
import { CreatorVideo, VIDEO_HEADERS, emptyVideo } from "./types";

// `creator_videos` tab of the CRM sheet. Created on demand; same service account as /admin.
const TAB = "creator_videos";

async function tabId(): Promise<number> {
  const meta = await sheetsClient().spreadsheets.get({ spreadsheetId: spreadsheetId() });
  const sheet = (meta.data.sheets ?? []).find((s) => s.properties?.title === TAB);
  if (sheet?.properties?.sheetId != null) return sheet.properties.sheetId;
  const res = await sheetsClient().spreadsheets.batchUpdate({
    spreadsheetId: spreadsheetId(),
    requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
  });
  const id = res.data.replies?.[0]?.addSheet?.properties?.sheetId;
  if (id == null) throw new Error("could not create creator_videos tab");
  await sheetsClient().spreadsheets.values.update({
    spreadsheetId: spreadsheetId(),
    range: `${TAB}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [VIDEO_HEADERS as string[]] },
  });
  return id;
}

export async function ensureVideosSheet(): Promise<void> {
  await tabId();
  const head = await sheetsClient().spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `${TAB}!1:1`,
  });
  const current = (head.data.values?.[0] ?? []) as string[];
  if (current.join("|") === VIDEO_HEADERS.join("|")) return;
  await sheetsClient().spreadsheets.values.update({
    spreadsheetId: spreadsheetId(),
    range: `${TAB}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [VIDEO_HEADERS as string[]] },
  });
}

function toRow(v: CreatorVideo): string[] {
  return VIDEO_HEADERS.map((h) => (v[h] ?? "").toString());
}

export async function listVideos(): Promise<CreatorVideo[]> {
  let values: string[][];
  try {
    const res = await sheetsClient().spreadsheets.values.get({
      spreadsheetId: spreadsheetId(),
      range: `${TAB}!A1:Z`,
    });
    values = (res.data.values ?? []) as string[][];
  } catch (e) {
    // Only a missing tab means "no videos"; any other failure must surface, otherwise an
    // update or delete would wrongly report "not found" during a transient API error.
    const msg = e instanceof Error ? e.message : String(e);
    if (/Unable to parse range/i.test(msg)) return [];
    throw e;
  }
  if (values.length < 2) return [];
  const [headerRow, ...rest] = values;
  const idx: Record<string, number> = {};
  headerRow.forEach((h, i) => (idx[h.trim()] = i));
  return rest
    .filter((r) => r.some((c) => (c ?? "").trim() !== ""))
    .map((row) => {
      const v = emptyVideo();
      for (const h of VIDEO_HEADERS) {
        const i = idx[h];
        v[h] = (i === undefined ? "" : (row[i] ?? "").toString()) as never;
      }
      return v;
    })
    .filter((v) => v.id);
}

export async function appendVideo(v: CreatorVideo): Promise<void> {
  await ensureVideosSheet();
  await sheetsClient().spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range: `${TAB}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [toRow(v)] },
  });
}

function colLetter(i: number): string {
  let n = i + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/**
 * Writes only the patched cells, so two edits landing at once (price on one card, owner on
 * another, or both on the same card) never overwrite each other with a stale full row.
 */
export async function updateVideo(id: string, patch: Partial<CreatorVideo>): Promise<CreatorVideo | null> {
  const all = await listVideos();
  const i = all.findIndex((v) => v.id === id);
  if (i < 0) return null;
  const row = i + 2;
  const updated: CreatorVideo = { ...all[i], ...patch, id, updated_at: new Date().toISOString() };
  const data = (Object.keys(patch) as (keyof CreatorVideo)[])
    .filter((k) => k !== "id" && k !== "created_at" && VIDEO_HEADERS.includes(k))
    .concat("updated_at")
    .map((k) => ({
      range: `${TAB}!${colLetter(VIDEO_HEADERS.indexOf(k))}${row}`,
      values: [[(updated[k] ?? "").toString()]],
    }));
  await sheetsClient().spreadsheets.values.batchUpdate({
    spreadsheetId: spreadsheetId(),
    requestBody: { valueInputOption: "RAW", data },
  });
  return updated;
}

export async function deleteVideo(id: string): Promise<boolean> {
  const all = await listVideos();
  const i = all.findIndex((v) => v.id === id);
  if (i < 0) return false;
  const sheetId = await tabId();
  await sheetsClient().spreadsheets.batchUpdate({
    spreadsheetId: spreadsheetId(),
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: { sheetId, dimension: "ROWS", startIndex: i + 1, endIndex: i + 2 },
          },
        },
      ],
    },
  });
  return true;
}
