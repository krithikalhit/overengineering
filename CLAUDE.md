# overengineering

See README.md for the app (board / admin / meetings / runway). Notes below cover the
parts that aren't obvious from the code.

## Budget sandbox — `public/budget.html` (served at `/budget`)

A budget and runway sandbox for Riffle, a seed-stage startup. ONE self-contained HTML
file — vanilla JS, no build step, no dependencies, no framework, no npm. Open it in a
browser and it works. Keep it that way: every change goes in this one file.

It is served as a static file at `/budget` (rewrite in `next.config.ts`) and gated by the
admin cookie in `middleware.ts` because the seed data carries named salaries. Keep both
`/budget` and `/budget.html` in the matcher.

State persists to localStorage under `riffle-budget-sandbox-v2`. If
`window.claude.use("db")` exists it syncs across viewers; if not it falls back to local.
Don't remove the fallback.

### How it works

Every piece of spend is one object with a switch, not a row of twelve monthly numbers.
Flipping a switch recomputes cash, burn, runway and the out-of-cash date at once. That
instant feedback is the point — protect it.

Two entities: Riffle Inc. (US, USD) and Riffle Studio Pvt Ltd (Bangalore, INR). Lines keep
their NATIVE currency; one editable FX rate rolls up to USD. Each month the US sweeps cash
to India: `max(0, indiaSpend + buffer - indiaCash)`.

Cash out = gross + GST − TDS + other. This is the number that leaves the bank — GST is real
cash out even though reclaimable, TDS is withheld so it never leaves. Everything else
follows from this.

Month 0 is Sep 2026. It projects 180 months internally so the out-of-cash date is always
known; the chart shows 24/36/48.

Seed data is from the Aug 26 tab of the FY 26–27 payments planner (most recent complete
month). One-offs from Apr–Aug are seeded switched off and tagged `past`.

### If you change the maths, these must still hold

Verified against the file on 2026-09-16 by evaluating the model section in node.

- India monthly cash out = ₹25,04,859 (₹24,67,300 planner lines + ₹37,559 subscriptions/fees)
- US monthly cash out = $20,530 ($16,576 planner lines + $3,954 subscriptions/fees)
- Net recurring monthly burn = $46,622
- At $3.1M cash, zero at month 65 = Feb 2032
- Month 0 US spend = $47,530 (20,530 recurring + 27,000 one-time consultants)
- Steady-state sweep = $26,092
- A $100k US hire at 1.25x loaded = $10,416.67/mo

### Leave alone

- Rejected line items are off-toggles contributing zero, never negative amounts. The source
  sheet totalled $26,200 instead of $47,000 because MDLR (−20,000) and Harman (−800) were
  typed as negatives and subtracted. That bug is why this tool exists.
- Budget heads mirror the planner's own payee prefixes. Finance already thinks in those
  names.
- The loaded-cost multiplier on hires (1.25 US / 1.15 India). A $100k engineer is not
  $8,333/mo once you count payroll tax, benefits, laptop and seats.
- Lines tagged `add` sit at zero on purpose — placeholders to fill in, not real spend
  (ad spend, laptops, research, licensing).
- Dues & Subscriptions come from the FY 26–27 Payments Summary sheets, not the planner
  (the planner only ever recorded Zoho Books). US lines are Mercury CC + Mercury bank;
  India lines are IDFC card, HSBC charges and Razorpay fees. Rule for the seeded amount:
  Aug 26 charge if there was one; recurring-but-not-in-Aug = Apr–Aug run-rate; known
  annual (Carta, Google Workspace on Mercury, domains) = /12. Anthropic and Cursor are
  usage-based and swung $1.2k–2.7k and $111–288 across Apr–Aug — the Aug figure is seeded,
  the range is in the note.

### Known data caveats

- The planner's "Burn till" figures are bank-balance deltas, not sums of line items — they
  disagree by −$6,039 to +$4,728/mo. Model from line items.
- Column I ("Net Amount") isn't one unit — INR for USD rows, net INR for INR rows.
  Recompute, don't trust it.
- FX is hardcoded differently per tab (94 Apr, 95 Jun, 96 Jul/Aug). One editable rate
  replaces all.
- Aug 26 tab has #REF! in its Q:T block.
- Aug burn jumped 30% ($39,070 → $50,742) — Gaurav Rajeev starting at ₹4.17L and Ralah
  going $1,728 → $4,816.
- Consultants are seeded one-time because the allocation plan sums them flat. If Tess's
  "90 day lock-in" is a monthly retainer, that's $22,500 not $7,500.
