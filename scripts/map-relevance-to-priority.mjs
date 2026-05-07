#!/usr/bin/env node
// One-off: maps the `relevance` column to `priority` for any rows where
// priority is currently empty. High -> p1, Medium -> p2, Low -> p3.
//
// Usage: node scripts/map-relevance-to-priority.mjs

import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";
import { JWT } from "google-auth-library";

function loadEnv(file) {
  const txt = fs.readFileSync(file, "utf8");
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    value = value.replace(/\\\$/g, "$").replace(/\\n/g, "\n");
    if (!process.env[key]) process.env[key] = value;
  }
}

function priorityFor(relevance) {
  const r = (relevance ?? "").trim().toLowerCase();
  if (r === "high") return "p1";
  if (r === "medium" || r === "med") return "p2";
  if (r === "low") return "p3";
  return "";
}

async function main() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) loadEnv(envPath);

  const { GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY } = process.env;
  if (!GOOGLE_SHEET_ID || !GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
    console.error("Missing Google env vars in .env.local");
    process.exit(1);
  }

  const auth = new JWT({
    email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: GOOGLE_PRIVATE_KEY,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "investors!A1:Z",
  });
  const values = res.data.values ?? [];
  if (values.length < 2) {
    console.log("Sheet is empty.");
    return;
  }

  const headers = values[0];
  const relIdx = headers.indexOf("relevance");
  const priIdx = headers.indexOf("priority");
  if (relIdx < 0 || priIdx < 0) {
    console.error("Sheet must have `relevance` and `priority` columns.");
    process.exit(1);
  }

  // Convert column index to A1 letter
  const colLetter = (i) => {
    let s = "";
    let n = i;
    while (true) {
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26) - 1;
      if (n < 0) break;
    }
    return s;
  };
  const priCol = colLetter(priIdx);

  const updates = [];
  let unchanged = 0;
  let unmapped = 0;
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const currentPriority = (row[priIdx] ?? "").trim();
    if (currentPriority !== "") {
      unchanged++;
      continue;
    }
    const mapped = priorityFor(row[relIdx]);
    if (!mapped) {
      unmapped++;
      continue;
    }
    const rowNumber = i + 1; // header is row 1
    updates.push({
      range: `investors!${priCol}${rowNumber}`,
      values: [[mapped]],
    });
  }

  console.log(
    `Rows: ${values.length - 1}. Already had priority: ${unchanged}. No mappable relevance: ${unmapped}. Updating: ${updates.length}.`,
  );

  if (updates.length === 0) return;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: GOOGLE_SHEET_ID,
    requestBody: {
      valueInputOption: "RAW",
      data: updates,
    },
  });
  console.log(`Updated ${updates.length} rows.`);
}

main().catch((err) => {
  console.error("Failed:", err.message ?? err);
  process.exit(1);
});
