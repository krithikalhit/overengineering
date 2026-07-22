import { google, sheets_v4 } from "googleapis";
import { RIFFLE_SHEET_MAP, SectionKind } from "./sheetMap";

// Runway <-> master financial sheet. The static map in sheetMap.ts is only a hint:
// every read/write starts by re-deriving the real layout from the live sheet
// (labels in column A, SUM ranges parsed from the category header formulas).

// ---------- client ----------

export function runwaySheetsClient(accessToken: string): sheets_v4.Sheets {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.sheets({ version: "v4", auth });
}

function spreadsheetId(): string {
  const id = process.env.SPREADSHEET_ID;
  if (!id) throw new RunwayError("Missing SPREADSHEET_ID env var", 500);
  return id;
}

export class RunwayError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// ---------- A1 helpers ----------

export function colToIndex(col: string): number {
  let n = 0;
  for (const ch of col.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function indexToCol(i: number): string {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function qTab(tab: string): string {
  return `'${tab.replace(/'/g, "''")}'`;
}

// ---------- label / formula parsing ----------

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9&]/g, "");
}

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** Parse "April 2025", "Apr 2025", "April '25" style headers. */
export function parseMonthHeader(raw: string): { year: number; month: number } | null {
  const s = raw.trim().toLowerCase();
  const m = s.match(/^([a-z]+)[\s,.'-]+(?:')?(\d{2}|\d{4})$/);
  if (!m) return null;
  const idx = MONTH_NAMES.findIndex((name) => name === m[1] || name.slice(0, 3) === m[1].slice(0, 3));
  if (idx < 0) return null;
  let year = Number(m[2]);
  if (year < 100) year += 2000;
  return { year, month: idx + 1 };
}

interface A1Range { startCol: string; startRow: number; endCol: string; endRow: number }

/** All simple ranges (e.g. C27:C64) appearing in a formula. */
function rangesInFormula(formula: string): A1Range[] {
  const out: A1Range[] = [];
  const re = /\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(formula))) {
    out.push({ startCol: m[1], startRow: Number(m[2]), endCol: m[3], endRow: Number(m[4]) });
  }
  return out;
}

/** Vertical single-column SUM range for the given column, if the formula has one. */
export function verticalSumRange(formula: string | undefined, col: string): { startRow: number; endRow: number } | null {
  if (!formula || !/^\s*=/.test(formula) || !/sum\s*\(/i.test(formula)) return null;
  for (const r of rangesInFormula(formula)) {
    if (r.startCol === col && r.endCol === col && r.startRow <= r.endRow) {
      return { startRow: r.startRow, endRow: r.endRow };
    }
  }
  return null;
}

// ---------- validated map ----------

export interface MonthCol {
  col: string;
  colIndex: number;
  year: number;
  month: number; // 1-12
  label: string;
}

export interface ValidatedCategory {
  key: string;
  label: string;
  kind: SectionKind;
  headerRow: number;
  detailStartRow: number;
  detailEndRow: number;
  writable: boolean;
  issues: string[];
}

export interface ValidatedSheetMap {
  tab: string;
  sheetId: number;
  nameCol: string;
  totalsCol: string;
  monthHeaderRow: number;
  monthCols: MonthCol[];
  currentMonthIndex: number | null; // index into monthCols for "today", null if not present
  categories: ValidatedCategory[];
  liquidityRows: { label: string; row: number | null }[];
  totalBurnRow: number | null;
  averageBurnCell: string | null;
  runwayCell: string | null;
  outOfCashCell: string | null;
  issues: string[];
}

const MAX_ROWS = 800;
const MAP_TTL_MS = 30_000;
let mapCache: { map: ValidatedSheetMap; at: number } | null = null;

export function invalidateMapCache(): void {
  mapCache = null;
}

async function batchGet(
  sheets: sheets_v4.Sheets,
  ranges: string[],
  render: "FORMATTED_VALUE" | "UNFORMATTED_VALUE" | "FORMULA" = "FORMATTED_VALUE",
): Promise<string[][][]> {
  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: spreadsheetId(),
    ranges,
    valueRenderOption: render,
  });
  return (res.data.valueRanges ?? []).map((vr) => (vr.values ?? []) as string[][]);
}

/** Find the row in column A whose normalized text matches; prefers the row nearest the hint. */
function findLabelRow(colA: string[], label: string, hintRow: number, contains = false): number | null {
  const target = norm(label);
  if (!target) return null;
  const hits: number[] = [];
  for (let i = 0; i < colA.length; i++) {
    const v = norm(colA[i] ?? "");
    if (v === target || (contains && v.includes(target))) hits.push(i + 1);
  }
  if (hits.length === 0) return null;
  hits.sort((a, b) => Math.abs(a - hintRow) - Math.abs(b - hintRow));
  return hits[0];
}

export async function validateSheetMap(
  sheets: sheets_v4.Sheets,
  opts: { fresh?: boolean } = {},
): Promise<ValidatedSheetMap> {
  if (!opts.fresh && mapCache && Date.now() - mapCache.at < MAP_TTL_MS) return mapCache.map;

  const hint = RIFFLE_SHEET_MAP;
  const issues: string[] = [];

  // 1. Tabs.
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: spreadsheetId(),
    fields: "sheets.properties(sheetId,title,gridProperties(columnCount,rowCount))",
  });
  const tabs = (meta.data.sheets ?? [])
    .map((s) => s.properties)
    .filter((p): p is sheets_v4.Schema$SheetProperties => !!p?.title);
  if (tabs.length === 0) throw new RunwayError("Spreadsheet has no tabs", 502);

  // 2. Resolve the main tab: env override > hint > auto-detect by category labels in col A.
  const wantTab = process.env.RUNWAY_SHEET_TAB || hint.tab;
  let tabProps = tabs.find((t) => t.title === wantTab);
  if (!tabProps) {
    const colAs = await batchGet(sheets, tabs.map((t) => `${qTab(t.title!)}!A1:A${MAX_ROWS}`));
    let best: { props: sheets_v4.Schema$SheetProperties; score: number } | null = null;
    tabs.forEach((t, i) => {
      const labels = new Set(colAs[i].map((r) => norm(r[0] ?? "")));
      const score = hint.categories.filter((c) => labels.has(norm(c.label))).length;
      if (!best || score > best.score) best = { props: t, score };
    });
    if (!best || (best as { score: number }).score < 3) {
      throw new RunwayError(
        `Could not find the main financial tab. Set RUNWAY_SHEET_TAB (or sheetMap.tab) to one of: ${tabs.map((t) => t.title).join(", ")}`,
        502,
      );
    }
    tabProps = (best as { props: sheets_v4.Schema$SheetProperties }).props;
    issues.push(`Tab auto-detected as "${tabProps.title}" — pin it via RUNWAY_SHEET_TAB.`);
  }
  const tab = tabProps.title!;
  const numericSheetId = tabProps.sheetId!;
  const lastGridCol = indexToCol(Math.min((tabProps.gridProperties?.columnCount ?? 60) - 1, 120));

  // 3. Column A + the top rows (for month headers).
  const [colARows, topRows] = await batchGet(sheets, [
    `${qTab(tab)}!A1:A${MAX_ROWS}`,
    `${qTab(tab)}!A1:${lastGridCol}6`,
  ]);
  const colA = colARows.map((r) => (r[0] ?? "").toString());

  // 4. Month header row: prefer the hinted row, else scan the top rows.
  let monthHeaderRow = 0;
  let monthCols: MonthCol[] = [];
  const candidateRows = [hint.monthHeaderRow, 1, 2, 3, 4, 5, 6].filter(
    (v, i, a) => a.indexOf(v) === i,
  );
  for (const rowNum of candidateRows) {
    const row = topRows[rowNum - 1] ?? [];
    const first = row.findIndex((c) => parseMonthHeader((c ?? "").toString()) !== null);
    if (first < 0) continue;
    const cols: MonthCol[] = [];
    for (let i = first; i < row.length; i++) {
      const parsed = parseMonthHeader((row[i] ?? "").toString());
      if (!parsed) break; // months must be contiguous
      cols.push({ col: indexToCol(i), colIndex: i, ...parsed, label: (row[i] ?? "").toString().trim() });
    }
    if (cols.length >= 2) {
      monthHeaderRow = rowNum;
      monthCols = cols;
      break;
    }
  }
  if (monthCols.length === 0) {
    throw new RunwayError(
      `Could not find month headers ("April 2025", ...) in the top rows of tab "${tab}".`,
      502,
    );
  }
  if (monthCols[0].col !== hint.firstMonthCol) {
    issues.push(`First month column is ${monthCols[0].col}, not ${hint.firstMonthCol} as hinted.`);
  }

  const now = new Date();
  const curIdx = monthCols.findIndex(
    (m) => m.year === now.getFullYear() && m.month === now.getMonth() + 1,
  );
  if (curIdx < 0) issues.push("Current month not found in the month headers — writes are disabled.");

  // 5. Categories: locate header rows by label, then parse the real SUM range from the formula.
  const located = hint.categories.map((c) => ({
    ...c,
    foundRow: findLabelRow(colA, c.label, c.headerRow),
  }));
  const formulaRanges = located
    .filter((c) => c.foundRow !== null)
    .map((c) => `${qTab(tab)}!${monthCols[0].col}${c.foundRow}:${monthCols[monthCols.length - 1].col}${c.foundRow}`);
  const formulaRows = formulaRanges.length > 0 ? await batchGet(sheets, formulaRanges, "FORMULA") : [];

  let fi = 0;
  const categories: ValidatedCategory[] = located.map((c) => {
    const catIssues: string[] = [];
    if (c.foundRow === null) {
      return {
        key: c.key, label: c.label, kind: c.kind,
        headerRow: c.headerRow, detailStartRow: c.detailStartRow, detailEndRow: c.detailEndRow,
        writable: false,
        issues: [`Label "${c.label}" not found in column A.`],
      };
    }
    const headerRow = c.foundRow;
    if (headerRow !== c.headerRow) {
      catIssues.push(`Header row is ${headerRow}, map hinted ${c.headerRow} — using live sheet.`);
    }
    const cells = formulaRows[fi++]?.[0] ?? [];
    let sum: { startRow: number; endRow: number } | null = null;
    for (let i = 0; i < cells.length && !sum; i++) {
      sum = verticalSumRange((cells[i] ?? "").toString(), monthCols[i]?.col ?? indexToCol(monthCols[0].colIndex + i));
    }
    if (!sum) {
      return {
        key: c.key, label: c.label, kind: c.kind,
        headerRow, detailStartRow: c.detailStartRow, detailEndRow: c.detailEndRow,
        writable: false,
        issues: [...catIssues, `No vertical SUM formula found on header row ${headerRow} — cannot write safely.`],
      };
    }
    if (sum.startRow !== c.detailStartRow || sum.endRow !== c.detailEndRow) {
      catIssues.push(
        `Detail range is ${sum.startRow}-${sum.endRow} per the live SUM, map hinted ${c.detailStartRow}-${c.detailEndRow} — using live sheet.`,
      );
    }
    const writable = sum.startRow > headerRow || sum.endRow < headerRow; // header must sit outside its own SUM
    return {
      key: c.key, label: c.label, kind: c.kind,
      headerRow, detailStartRow: sum.startRow, detailEndRow: sum.endRow,
      writable: writable && curIdx >= 0,
      issues: writable ? catIssues : [...catIssues, "Header row sits inside its own SUM range."],
    };
  });

  // 6. Liquidity rows, Total Burn, and the three stat cells — located by label, hint as tiebreak.
  const liquidityRows = hint.liquidityRows.map((l) => ({
    label: l.label,
    row: findLabelRow(colA, l.label, l.row, true),
  }));
  liquidityRows.forEach((l) => {
    if (l.row === null) issues.push(`Liquidity row "${l.label}" not found in column A.`);
  });

  const totalBurnRow = findLabelRow(colA, "Total Burn", hint.totalBurnRow, true);
  if (totalBurnRow === null) issues.push('"Total Burn" row not found — write verification will skip the burn check.');

  const statCell = (label: string, hintCell: string): string | null => {
    const hintRow = Number(hintCell.match(/\d+/)?.[0] ?? 0);
    const row = findLabelRow(colA, label, hintRow, true);
    return row === null ? null : `${hint.totalsCol}${row}`;
  };
  const averageBurnCell = statCell("Average Burn", hint.averageBurnCell);
  const runwayCell = statCell("Runway", hint.runwayCell);
  const outOfCashCell = statCell("Out of Cash", hint.outOfCashCell);

  const map: ValidatedSheetMap = {
    tab,
    sheetId: numericSheetId,
    nameCol: hint.nameCol,
    totalsCol: hint.totalsCol,
    monthHeaderRow,
    monthCols,
    currentMonthIndex: curIdx >= 0 ? curIdx : null,
    categories,
    liquidityRows,
    totalBurnRow,
    averageBurnCell,
    runwayCell,
    outOfCashCell,
    issues,
  };
  mapCache = { map, at: Date.now() };
  return map;
}

// ---------- summary (dashboard read) ----------

/** INR-per-USD rate for display + write conversion (RUNWAY_FX_RATE). */
export function fxRate(): number | null {
  const r = Number(process.env.RUNWAY_FX_RATE);
  return Number.isFinite(r) && r > 0 ? r : null;
}

export interface RunwaySummary {
  tab: string;
  months: { label: string; ym: string }[]; // ym = "YYYY-MM"
  currentMonth: string | null;
  currentMonthYm: string | null;
  runwayMonths: number | null;
  currency: "USD" | "INR";
  fxRate: number | null;
  liquidity: { label: string; value: string }[];
  averageBurn: string | null;
  runway: string | null;
  outOfCash: string | null;
  totalBurn: string | null;
  categories: {
    key: string;
    label: string;
    kind: SectionKind;
    total: string;
    writable: boolean;
    issues: string[];
  }[];
  issues: string[];
}

export async function getRunwaySummary(sheets: sheets_v4.Sheets): Promise<RunwaySummary> {
  const map = await validateSheetMap(sheets);
  const t = qTab(map.tab);
  const cell = (a1: string | null) => (a1 ? `${t}!${a1}` : null);

  const ranges: string[] = [];
  const idx: Record<string, number> = {};
  const add = (key: string, a1: string | null) => {
    if (!a1) return;
    idx[key] = ranges.length;
    ranges.push(a1);
  };
  map.liquidityRows.forEach((l) => add(`liq:${l.label}`, l.row ? `${t}!${map.totalsCol}${l.row}` : null));
  add("averageBurn", cell(map.averageBurnCell));
  add("runway", cell(map.runwayCell));
  add("outOfCash", cell(map.outOfCashCell));
  add("totalBurn", map.totalBurnRow ? `${t}!${map.totalsCol}${map.totalBurnRow}` : null);
  map.categories.forEach((c) => add(`cat:${c.key}`, `${t}!${map.totalsCol}${c.headerRow}`));

  const values = await batchGet(sheets, ranges, "UNFORMATTED_VALUE");
  const num = (key: string): number | null => {
    if (!(key in idx)) return null;
    const raw = values[idx[key]]?.[0]?.[0];
    if (raw === undefined || raw === null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  // The sheet's model is INR; the founders think in USD. With RUNWAY_FX_RATE set
  // (the sheet's own mirror rate, e.g. 94), monetary values are shown converted.
  const rate = fxRate();
  const money = (n: number | null): string | null => {
    if (n === null) return null;
    if (rate) return (n < 0 ? "-$" : "$") + Math.round(Math.abs(n) / rate).toLocaleString("en-US");
    return (n < 0 ? "-₹" : "₹") + Math.round(Math.abs(n)).toLocaleString("en-IN");
  };

  const runwayMonths = num("runway");
  const ym = (m: MonthCol) => `${m.year}-${String(m.month).padStart(2, "0")}`;
  const curIdx = map.currentMonthIndex;
  // "Out of cash" label is missing on this sheet — derive it: current month + runway.
  let outOfCash: string | null = null;
  if (curIdx !== null && runwayMonths !== null && runwayMonths >= 0) {
    const oocIdx = curIdx + Math.floor(runwayMonths);
    outOfCash =
      oocIdx < map.monthCols.length
        ? map.monthCols[oocIdx].label
        : `after ${map.monthCols[map.monthCols.length - 1].label}`;
  }

  const issues = [...map.issues];
  if (rate) issues.push(`Displaying USD at ₹${rate}/$ (the sheet's mirror rate); the INR tab stays the source of truth.`);

  return {
    tab: map.tab,
    months: map.monthCols.map((m) => ({ label: m.label, ym: ym(m) })),
    currentMonth: curIdx !== null ? map.monthCols[curIdx].label : null,
    currentMonthYm: curIdx !== null ? ym(map.monthCols[curIdx]) : null,
    liquidity: map.liquidityRows.map((l) => ({ label: l.label, value: money(num(`liq:${l.label}`)) ?? "—" })),
    averageBurn: money(num("averageBurn")),
    runway: runwayMonths !== null ? `${runwayMonths.toFixed(1)} mo` : null,
    runwayMonths,
    outOfCash,
    totalBurn: money(num("totalBurn")),
    currency: rate ? "USD" : "INR",
    fxRate: rate,
    categories: map.categories.map((c) => ({
      key: c.key,
      label: c.label,
      kind: c.kind,
      total: money(num(`cat:${c.key}`)) ?? "—",
      writable: c.writable,
      issues: c.issues,
    })),
    issues,
  };
}

// ---------- the guarded write ----------

export interface AddLineItemInput {
  categoryKey: string;
  label: string;
  amount: number;
  /** "YYYY-MM"; defaults to the current month. Never allowed left of the current month. */
  startMonth?: string;
}

export interface AddLineItemResult {
  row: number;
  category: string;
  monthsWritten: string[];
  /** In the display currency (USD when RUNWAY_FX_RATE is set). */
  amountPerMonth: number;
  /** The value actually written to the sheet (INR when converting). */
  amountWrittenPerMonth: number;
  currency: "USD" | "INR";
  fxRate: number | null;
  verified: true;
  warnings: string[];
}

function numAt(rows: string[][] | undefined, colOffset: number): number {
  const v = rows?.[0]?.[colOffset];
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function addLineItem(
  sheets: sheets_v4.Sheets,
  input: AddLineItemInput,
): Promise<AddLineItemResult> {
  const map = await validateSheetMap(sheets, { fresh: true });
  const warnings: string[] = [];

  const cat = map.categories.find((c) => c.key === input.categoryKey);
  if (!cat) throw new RunwayError(`Unknown category "${input.categoryKey}"`);
  if (!cat.writable) {
    throw new RunwayError(`Category "${cat.label}" is not writable: ${cat.issues.join(" ")}`, 409);
  }
  if (map.currentMonthIndex === null) {
    throw new RunwayError("Current month not found in the sheet's month headers — refusing to write.", 409);
  }
  const label = input.label.trim();
  if (!label) throw new RunwayError("Label is required");
  if (!Number.isFinite(input.amount) || input.amount === 0) {
    throw new RunwayError("Amount must be a non-zero number");
  }
  // Input is in the display currency (USD when RUNWAY_FX_RATE is set); the
  // sheet's model is INR, so convert before writing.
  const rate = fxRate();
  const writeAmount = rate ? Math.round(input.amount * rate) : input.amount;

  // Resolve target month columns. Writes never go left of the current month (actuals).
  let startIdx = map.currentMonthIndex;
  if (input.startMonth) {
    const m = input.startMonth.match(/^(\d{4})-(\d{2})$/);
    if (!m) throw new RunwayError('startMonth must be "YYYY-MM"');
    const found = map.monthCols.findIndex(
      (c) => c.year === Number(m[1]) && c.month === Number(m[2]),
    );
    if (found < 0) throw new RunwayError(`Month ${input.startMonth} is not a column in the sheet`);
    if (found < map.currentMonthIndex) {
      throw new RunwayError(
        `${map.monthCols[found].label} is in the past — columns left of ${map.monthCols[map.currentMonthIndex].label} are actuals and are never written.`,
      );
    }
    startIdx = found;
  }
  const targets =
    cat.kind === "recurringExpense"
      ? map.monthCols.slice(startIdx) // start month through the last future column
      : [map.monthCols[startIdx]]; // inflow / one-off: a single month
  const firstCol = targets[0].col;
  const lastCol = targets[targets.length - 1].col;
  const t = qTab(map.tab);
  const insertRow = cat.detailEndRow;

  // Row numbers below the insertion point shift down by one after the insert.
  const shifted = (row: number) => (row >= insertRow ? row + 1 : row);
  const headerRowAfter = shifted(cat.headerRow);
  const burnRowAfter = map.totalBurnRow !== null ? shifted(map.totalBurnRow) : null;

  // 1. Pre-read the totals we must see move by exactly the written amount.
  const preRanges = [`${t}!${firstCol}${cat.headerRow}:${lastCol}${cat.headerRow}`];
  if (map.totalBurnRow !== null) {
    preRanges.push(`${t}!${firstCol}${map.totalBurnRow}:${lastCol}${map.totalBurnRow}`);
  } else {
    warnings.push('"Total Burn" row not found — burn-total verification was skipped.');
  }
  const pre = await batchGet(sheets, preRanges, "UNFORMATTED_VALUE");

  // 2. Insert a blank row AT detailEndRow so it lands inside the SUM range.
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: spreadsheetId(),
    requestBody: {
      requests: [
        {
          insertDimension: {
            range: {
              sheetId: map.sheetId,
              dimension: "ROWS",
              startIndex: insertRow - 1, // 0-based: new row becomes 1-based insertRow
              endIndex: insertRow,
            },
            inheritFromBefore: true,
          },
        },
      ],
    },
  });
  invalidateMapCache();

  const rollback = async () => {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: spreadsheetId(),
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: map.sheetId,
                dimension: "ROWS",
                startIndex: insertRow - 1,
                endIndex: insertRow,
              },
            },
          },
        ],
      },
    });
    invalidateMapCache();
  };

  try {
    // 3. If any month's SUM was a fixed range that did not auto-expand over the new
    //    row, rewrite it to include the row. Anything more exotic than a plain =SUM
    //    is not rewritten — we bail out (and roll back) instead of guessing.
    const [headerFormulas] = await batchGet(
      sheets,
      [`${t}!${map.monthCols[0].col}${headerRowAfter}:${map.monthCols[map.monthCols.length - 1].col}${headerRowAfter}`],
      "FORMULA",
    );
    const fixes: { range: string; values: string[][] }[] = [];
    (headerFormulas?.[0] ?? []).forEach((raw, i) => {
      const col = indexToCol(map.monthCols[0].colIndex + i);
      const formula = (raw ?? "").toString();
      const sum = verticalSumRange(formula, col);
      if (!sum) return; // no vertical range in this cell — nothing to check
      if (sum.startRow <= insertRow && insertRow <= sum.endRow) return; // already covers the new row
      const simple = formula.match(/^\s*=\s*sum\s*\(\s*\$?[A-Z]+\$?\d+:\$?[A-Z]+\$?\d+\s*\)\s*$/i);
      if (!simple) {
        throw new RunwayError(
          `Column ${col}: the SUM on row ${headerRowAfter} did not expand over the new row and is too complex to rewrite safely.`,
          409,
        );
      }
      const start = Math.min(sum.startRow, insertRow);
      const end = Math.max(sum.endRow, insertRow);
      fixes.push({
        range: `${t}!${col}${headerRowAfter}`,
        values: [[`=SUM(${col}${start}:${col}${end})`]],
      });
    });
    if (fixes.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: spreadsheetId(),
        requestBody: { valueInputOption: "USER_ENTERED", data: fixes },
      });
      warnings.push(`Rewrote ${fixes.length} fixed-range SUM formula(s) to include the new row.`);
    }

    // 4. Write the label and the amount(s) into the new row.
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: spreadsheetId(),
      requestBody: {
        valueInputOption: "RAW",
        data: [
          { range: `${t}!${map.nameCol}${insertRow}`, values: [[label]] },
          {
            range: `${t}!${firstCol}${insertRow}:${lastCol}${insertRow}`,
            values: [targets.map(() => writeAmount)],
          },
        ],
      },
    });

    // 5. Verify: the category total must move by exactly the amount in every written
    //    month; Total Burn must move by the amount (expense) or not at all (inflow).
    const postRanges = [`${t}!${firstCol}${headerRowAfter}:${lastCol}${headerRowAfter}`];
    if (burnRowAfter !== null) postRanges.push(`${t}!${firstCol}${burnRowAfter}:${lastCol}${burnRowAfter}`);
    const post = await batchGet(sheets, postRanges, "UNFORMATTED_VALUE");

    const EPS = 0.01;
    const mismatches: string[] = [];
    targets.forEach((mc, i) => {
      const catDelta = numAt(post[0], i) - numAt(pre[0], i);
      if (Math.abs(catDelta - writeAmount) > EPS) {
        mismatches.push(
          `${mc.label}: "${cat.label}" total moved by ${catDelta}, expected ${writeAmount}`,
        );
      }
      if (burnRowAfter !== null) {
        const burnDelta = numAt(post[1], i) - numAt(pre[1], i);
        if (cat.kind === "inflow") {
          if (Math.abs(burnDelta) > EPS) {
            mismatches.push(`${mc.label}: Total Burn moved by ${burnDelta} on an inflow (expected 0)`);
          }
        } else if (Math.abs(Math.abs(burnDelta) - Math.abs(writeAmount)) > EPS) {
          mismatches.push(
            `${mc.label}: Total Burn moved by ${burnDelta}, expected ±${writeAmount}`,
          );
        }
      }
    });
    if (mismatches.length > 0) {
      throw new RunwayError(
        `Verification failed — the insert was rolled back. ${mismatches.join("; ")}`,
        409,
      );
    }

    return {
      row: insertRow,
      category: cat.label,
      monthsWritten: targets.map((m) => m.label),
      amountPerMonth: input.amount,
      amountWrittenPerMonth: writeAmount,
      currency: rate ? "USD" : "INR",
      fxRate: rate,
      verified: true,
      warnings,
    };
  } catch (err) {
    await rollback().catch(() => {
      throw new RunwayError(
        "Write failed AND rollback failed — please check the sheet by hand. " +
          `Original error: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
    });
    throw err;
  }
}
