# overengineering

Founder OS for fundraising. Three pages, one Google Sheet, one Notion calendar.

- `/board` — public investor intro board (shareable link)
- `/admin` — private CRM (table + kanban, password-gated)
- `/meetings` — Notion calendar agenda (password-gated)

Stack: Next.js 15 (App Router), Tailwind, Google Sheets API, Notion API. Deploy to Vercel.

---

## 1. Local setup

```bash
npm install
cp .env.example .env.local
# fill in the variables described below
npm run dev
```

Open http://localhost:3000 — you'll be redirected to `/board`. Sign into `/admin` with `ADMIN_PASSWORD`.

After your first login, hit the bootstrap endpoint once to create any missing tabs and write headers in your Google Sheet:

```bash
curl -X POST http://localhost:3000/api/bootstrap \
  -H "Cookie: oe_admin=$(grep oe_admin ~/Library/Application\ Support/...)"
# easier: just visit /admin while logged in, then run:
curl -X POST http://localhost:3000/api/bootstrap --cookie "oe_admin=YOURTOKEN"
```

Or simpler: open the page in your browser, log in, then in the browser devtools console:

```js
fetch("/api/bootstrap", { method: "POST" }).then(r => r.json()).then(console.log)
```

---

## 2. Google Sheets setup

1. Create a new Google Sheet. Copy its ID from the URL (the long string between `/d/` and `/edit`). Set `GOOGLE_SHEET_ID`.
2. In Google Cloud Console:
   - Create a project (or reuse one)
   - Enable **Google Sheets API**
   - Create a **Service Account**, then add a JSON key
3. From the JSON key file, copy:
   - `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → `GOOGLE_PRIVATE_KEY` (keep the `\n` escapes; Vercel handles this)
4. **Share the sheet with the service account email** (Editor access). This is the step everyone forgets.
5. Hit `POST /api/bootstrap` once. The app creates four tabs with these headers:
   - `investors` — full schema (compatible with your existing columns: `name → full_name`, `company / project → company_project`, plus `category`, `relevance`, `node`, `notes`, and the expanded fields)
   - `connectors` — auto-populated when someone clicks "I can intro"
   - `intro_relationships` — links investors ↔ connectors with status
   - `activity_log` — append-only audit trail

If you're migrating from an existing sheet: rename your existing tab to `investors`, rename headers to match `lib/types.ts` (snake_case), and add an `id` column (any unique string).

---

## 3. Notion calendar setup

1. Open your meetings database in Notion → `…` → **Connections** → add a new internal integration (or share with an existing one)
2. Copy the integration secret → `NOTION_TOKEN`
3. Copy the database ID from the URL (32-char hex) → `NOTION_CALENDAR_DB_ID`
4. The app reads these properties (case-insensitive, will fall back if missing):
   - `Date` (Date) — required. Override the property name with `NOTION_DATE_PROPERTY` if yours is different.
   - `Name` / `Title` (title) — meeting title
   - `Type` (select) — meeting type
   - `Status` (status or select)
   - `Attendees` / `People` (people)
   - `Notes` (rich text) or `URL` (url)

---

## 4. Auth

Lightweight, on purpose: a single shared password (`ADMIN_PASSWORD`) signs an HTTP-only cookie via HMAC (`AUTH_SECRET`). 30-day session. No Google, no Auth0.

`/admin` and `/meetings` are gated by middleware. `/board` is fully public — no internal fields are ever sent to the client (see `app/board/page.tsx`, which projects to `PublicInvestor`).

---

## 4½. Runway (master financial sheet)

`/runway` is a burn/runway dashboard over the master financial Google Sheet, with "Add"
forms that write new line items (hires, marketing spend, investor checks, one-offs)
directly into the sheet's category groups.

Two access modes, picked automatically from the env:

- **Google OAuth** (preferred): set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `NEXTAUTH_SECRET`, and `SPREADSHEET_ID`. Every read/write runs with the signed-in
  user's own token, so sheet permissions are the access control. OAuth client setup:
  Google Auth platform → Clients, redirect URI `<origin>/api/auth/callback/google`,
  scope `https://www.googleapis.com/auth/spreadsheets`. In Testing mode refresh tokens
  expire after 7 days — the page will just ask you to sign in again.
- **Service account** (no OAuth setup needed): leave the OAuth vars unset. Runway then
  uses the CRM's service account — share the master sheet with
  `GOOGLE_SERVICE_ACCOUNT_EMAIL` as Editor and set `SPREADSHEET_ID`. Since the service
  account can always edit the sheet, `/runway` is gated behind the admin password
  (same cookie as `/admin`).

How it stays safe:

- `lib/runway/sheetMap.ts` is only a *hint*. On every use the app re-reads the live sheet:
  finds each category label in column A, parses the real detail range out of the header
  row's `=SUM(...)` formula, and repairs the map (`lib/runway/sheets.ts`).
- Adding a line item inserts a row **at** the category's last detail row so the SUM
  auto-expands, writes label + amount(s), then re-reads the category total and Total Burn
  and confirms they moved by exactly the amount written. Any mismatch → the inserted row
  is deleted and the error surfaced.
- Fixed-range SUMs that don't auto-expand are rewritten to include the new row; anything
  more exotic than a plain `=SUM(range)` aborts (and rolls back) instead of guessing.
- Columns left of the current month are actuals and are never written.
- Recurring costs fill start month → last column; inflows and one-offs write one month.

If auto-detection can't find the main tab, pin it with `RUNWAY_SHEET_TAB`.

---

## 5. Deployment (Vercel)

```bash
# from the repo root
npx vercel link            # link to a new project under your team
npx vercel env add ...     # or paste env vars in the dashboard
git push                   # auto-deploys on push to main
```

Set every variable in `.env.example` in the Vercel dashboard. For `GOOGLE_PRIVATE_KEY`, paste the full multi-line PEM — Vercel preserves newlines.

Then visit `<your-domain>/admin/login`, sign in, and `POST /api/bootstrap` once.

---

## 6. Repo

This lives in a private GitHub repo called `overengineering`:

```bash
cd /Users/krith/Code/overengineering
git init
git add .
git commit -m "Initial scaffold"
gh repo create overengineering --private --source=. --remote=origin --push
```

---

## Folder structure

```
app/
  layout.tsx
  globals.css
  page.tsx                      # → /board
  board/
    page.tsx                    # public, server-rendered
    board-client.tsx            # search, filter, "I can intro", identity dialog
  admin/
    page.tsx                    # gated CRM
    admin-client.tsx            # table + kanban, drawer, ⌘K, N=new
    login/
      page.tsx
      login-form.tsx
  meetings/
    page.tsx                    # Notion-driven agenda
  api/
    auth/route.ts               # POST login / DELETE logout
    bootstrap/route.ts          # creates missing sheet tabs/headers
    investors/route.ts          # GET list, POST create  (admin)
    investors/[id]/route.ts     # PATCH update           (admin)
    intros/route.ts             # POST "I can intro"     (public)
    intros/[id]/route.ts        # PATCH status           (admin)
    meetings/route.ts           # GET (admin)
components/
  ui/                           # button, input, badge, drawer, dialog, toast
  shared/nav.tsx
  admin/investor-drawer.tsx
  admin/new-investor-dialog.tsx
lib/
  sheets.ts                     # Google Sheets read/write
  notion.ts                     # Notion DB query
  auth.ts                       # cookie-based session
  types.ts                      # Investor / IntroRelationship / Connector / ActivityEntry
  cn.ts                         # tailwind class merger
  id.ts                         # opaque id generator
middleware.ts                   # gates /admin and /meetings
```

---

## Keyboard

- `⌘/Ctrl+K` — focus search in `/admin`
- `N` — new investor in `/admin`
- `Esc` — close drawer / dialog

---

## Design notes

- Black & white only. Inter. Subtle borders (`#e7e7e7`). Hover at `bg-ink-50`.
- No gradients, glassmorphism, or accent colors. Status is conveyed with stage labels and small monochrome badges.
- Kanban is a thin layer over `<select>` for stage — drag to move, click to open drawer.
- Public board only ships `id, full_name, company_project, category, relevance, tags, priority`. Internal fields stay server-side.

---

## Implementation plan / MVP scope

Shipped here:

1. Public board with localStorage identity gate
2. Private CRM (table + kanban + drawer + new-investor dialog + keyboard shortcuts)
3. Notion-backed meetings page
4. Sheets-backed schema with bootstrap migration

Easy follow-ups (deliberately not built):

- CSV bulk import (paste rows into the new dialog) — wire `appendInvestor` to a multi-row endpoint
- `/admin/connectors` page listing all connectors and their offered intros
- Per-row inline edit beyond stage (e.g. priority, tags)
- Realtime: poll `GET /api/investors` every 30s in `admin-client.tsx` and merge

The code is intentionally small — every screen is one server component + one client component. Add features by extending types in `lib/types.ts` and the corresponding sheet headers; `bootstrap()` will reconcile.
