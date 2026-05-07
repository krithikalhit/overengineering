#!/usr/bin/env node
// One-off: pushes every key/value in .env.local into Vercel for the
// current linked project, across production + preview + development.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const envPath = path.resolve(process.cwd(), ".env.local");
const txt = fs.readFileSync(envPath, "utf8");

function parseEnv(text) {
  const out = {};
  let i = 0;
  while (i < text.length) {
    // skip leading whitespace and comments / blank lines
    while (i < text.length && (text[i] === " " || text[i] === "\t" || text[i] === "\n" || text[i] === "\r")) i++;
    if (i >= text.length) break;
    if (text[i] === "#") {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    // read key
    const keyStart = i;
    while (i < text.length && text[i] !== "=" && text[i] !== "\n") i++;
    if (text[i] !== "=") continue;
    const key = text.slice(keyStart, i).trim();
    i++; // consume '='
    let value = "";
    if (text[i] === '"') {
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === "\\" && text[i + 1] === '"') {
          value += '"';
          i += 2;
          continue;
        }
        value += text[i];
        i++;
      }
      if (text[i] === '"') i++;
    } else if (text[i] === "'") {
      i++;
      while (i < text.length && text[i] !== "'") {
        value += text[i];
        i++;
      }
      if (text[i] === "'") i++;
    } else {
      while (i < text.length && text[i] !== "\n") {
        value += text[i];
        i++;
      }
    }
    // strip leading backslash escapes (e.g. \$10mpls -> $10mpls)
    value = value.replace(/\\\$/g, "$");
    // .env files commonly contain literal \n which we want to expand
    // ONLY for things like private keys (multi-line PEM). The dotenv convention:
    // double-quoted values get \n -> newline expansion. We already handled quoted
    // above, but the escape replacement should happen here for the pem content.
    if (/-----BEGIN [A-Z ]+-----/.test(value)) {
      value = value.replace(/\\n/g, "\n");
    }
    out[key] = value;
  }
  return out;
}

const env = parseEnv(txt);
const targets = ["production", "preview", "development"];

for (const [k, v] of Object.entries(env)) {
  for (const t of targets) {
    // Remove existing first to avoid prompt; ignore errors if not present
    spawnSync("npx", ["vercel", "env", "rm", k, t, "--yes"], { stdio: "ignore" });
    const r = spawnSync("npx", ["vercel", "env", "add", k, t], {
      input: v + "\n",
      encoding: "utf8",
    });
    if (r.status === 0) {
      console.log(`✓ ${k} (${t})`);
    } else {
      console.error(`✗ ${k} (${t}) — ${r.stderr?.trim() || r.stdout?.trim()}`);
    }
  }
}
console.log("Done.");
