#!/usr/bin/env node
// One-off importer: reads a CSV with columns
//   Name, Company / Project, Category, Relevance, Node, Notes
// and appends rows to the `investors` sheet using the existing schema.
//
// Usage: node scripts/import-csv.mjs <path-to.csv>

import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";
import { JWT } from "google-auth-library";

// Tiny RFC4180-ish CSV parser (handles quotes, commas, escaped quotes, CRLF)
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => (c ?? "").trim() !== ""));
}

function loadEnv(file) {
  const txt = fs.readFileSync(file, "utf8");
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip wrapping quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Honor escaped \$ -> $
    value = value.replace(/\\\$/g, "$");
    // Honor \n inside double-quoted private key
    value = value.replace(/\\n/g, "\n");
    if (!process.env[key]) process.env[key] = value;
  }
}

const HEADERS = [
  "id",
  "full_name",
  "company_project",
  "category",
  "relevance",
  "node",
  "notes",
  "email",
  "linkedin",
  "website",
  "location",
  "tags",
  "priority",
  "status",
  "stage",
  "last_contacted",
  "next_steps",
  "follow_up_date",
  "meeting_status",
  "meeting_notes",
  "conviction_score",
  "created_at",
  "updated_at",
];

function newId() {
  const r = Math.random().toString(36).slice(2, 8);
  const t = Date.now().toString(36);
  return `inv_${t}${r}`;
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: node scripts/import-csv.mjs <path-to.csv>");
    process.exit(1);
  }

  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) loadEnv(envPath);

  const text = fs.readFileSync(csvPath, "utf8");
  const rows = parseCsv(text);
  if (rows.length < 2) {
    console.error("CSV has no data rows.");
    process.exit(1);
  }

  const headerRow = rows[0].map((h) => h.trim().toLowerCase());
  const colIndex = (...names) => {
    for (const n of names) {
      const i = headerRow.indexOf(n.toLowerCase());
      if (i >= 0) return i;
    }
    return -1;
  };

  const idx = {
    name: colIndex("name", "full_name"),
    company: colIndex("company / project", "company/project", "company", "company_project"),
    category: colIndex("category"),
    relevance: colIndex("relevance"),
    node: colIndex("node"),
    notes: colIndex("notes"),
  };

  if (idx.name < 0) {
    console.error('Could not find a "Name" column. Got headers:', headerRow);
    process.exit(1);
  }

  const now = new Date().toISOString();
  const data = rows
    .slice(1)
    .map((r) => {
      const get = (i) => (i >= 0 ? (r[i] ?? "").trim() : "");
      const full_name = get(idx.name);
      if (!full_name) return null;
      const obj = {
        id: newId(),
        full_name,
        company_project: get(idx.company),
        category: get(idx.category),
        relevance: get(idx.relevance),
        node: get(idx.node),
        notes: get(idx.notes),
        email: "",
        linkedin: "",
        website: "",
        location: "",
        tags: "",
        priority: "",
        status: "",
        stage: "not_started",
        last_contacted: "",
        next_steps: "",
        follow_up_date: "",
        meeting_status: "",
        meeting_notes: "",
        conviction_score: "",
        created_at: now,
        updated_at: now,
      };
      return obj;
    })
    .filter(Boolean);

  if (data.length === 0) {
    console.error("No rows with a Name found.");
    process.exit(1);
  }

  const { GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY } = process.env;
  if (!GOOGLE_SHEET_ID || !GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
    console.error(
      "Missing GOOGLE_SHEET_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY in .env.local",
    );
    process.exit(1);
  }

  const auth = new JWT({
    email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: GOOGLE_PRIVATE_KEY,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  // Read existing investors to dedupe by full_name + company_project
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "investors!A1:Z",
  });
  const existingValues = existing.data.values ?? [];
  const seen = new Set();
  if (existingValues.length > 1) {
    const headers = existingValues[0];
    const ni = headers.indexOf("full_name");
    const ci = headers.indexOf("company_project");
    for (const row of existingValues.slice(1)) {
      const k = `${(row[ni] ?? "").trim().toLowerCase()}|${(row[ci] ?? "").trim().toLowerCase()}`;
      if (k.trim() !== "|") seen.add(k);
    }
  }

  const fresh = data.filter(
    (d) =>
      !seen.has(
        `${d.full_name.toLowerCase()}|${d.company_project.toLowerCase()}`,
      ),
  );

  console.log(
    `Parsed ${data.length} rows from CSV. ${data.length - fresh.length} already in sheet. Importing ${fresh.length}.`,
  );
  if (fresh.length === 0) return;

  const values = fresh.map((d) => HEADERS.map((h) => d[h] ?? ""));

  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "investors!A1",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });

  console.log(`Imported ${fresh.length} investors.`);
}

main().catch((err) => {
  console.error("Import failed:", err.message ?? err);
  process.exit(1);
});
