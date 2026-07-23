"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import type { RunwaySummary } from "@/lib/runway/sheets";
import { PixelHeart, PixelText } from "./pixel";

// Each "Add" input maps to a sheet category:
// hire → people, marketing initiative → marketing, investor → capital_inflow,
// one-off → user-picked oneTimeExpense, recurring → user-picked recurringExpense.
type AddType = "hire" | "marketing" | "investor" | "oneoff" | "recurring";

const ADD_TYPES: {
  id: AddType;
  label: string;
  fixedCategory?: string;
  pickFrom?: "oneTimeExpense" | "recurringExpense";
}[] = [
  { id: "hire", label: "Full-time hire", fixedCategory: "people" },
  { id: "marketing", label: "Marketing initiative", fixedCategory: "marketing" },
  { id: "investor", label: "New angel / investor", fixedCategory: "capital_inflow" },
  { id: "oneoff", label: "One-off cost", pickFrom: "oneTimeExpense" },
  { id: "recurring", label: "Recurring expense", pickFrom: "recurringExpense" },
];

const BAR_MAX = 24;

type Dialog = { kind: "ok"; text: string } | { kind: "error"; text: string } | null;

/* ---------- shared item-form state ---------- */

function useItemState(summary: RunwaySummary) {
  const [type, setType] = React.useState<AddType>("hire");
  const [category, setCategory] = React.useState("other_capex");
  const [label, setLabel] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [month, setMonth] = React.useState(summary.currentMonthYm ?? "");
  const addType = ADD_TYPES.find((t) => t.id === type)!;
  const categoryKey = addType.fixedCategory ?? category;
  const cat = summary.categories.find((c) => c.key === categoryKey);
  const pickable = addType.pickFrom
    ? summary.categories.filter((c) => c.kind === addType.pickFrom)
    : [];
  return {
    type, setType, category, setCategory, label, setLabel,
    amount, setAmount, month, setMonth,
    addType, categoryKey, cat, pickable,
    recurring: cat?.kind === "recurringExpense",
  };
}
type ItemState = ReturnType<typeof useItemState>;

function ItemFields({ idp, summary, s }: { idp: string; summary: RunwaySummary; s: ItemState }) {
  const futureMonths = summary.currentMonthYm
    ? summary.months.slice(summary.months.findIndex((m) => m.ym === summary.currentMonthYm))
    : [];
  return (
    <div className="rw-grid2">
      <div className="rw-field">
        <label htmlFor={`${idp}-type`}>Type</label>
        <select id={`${idp}-type`} value={s.type} onChange={(e) => s.setType(e.target.value as AddType)}>
          {ADD_TYPES.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>
      <div className="rw-field">
        <label htmlFor={`${idp}-cat`}>Category</label>
        {s.addType.pickFrom ? (
          <select id={`${idp}-cat`} value={s.category} onChange={(e) => s.setCategory(e.target.value)}>
            {s.pickable.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        ) : (
          <div className="fixed">{s.cat?.label ?? s.categoryKey}</div>
        )}
      </div>
      <div className="rw-field">
        <label htmlFor={`${idp}-label`}>Label (column A)</label>
        <input id={`${idp}-label`} value={s.label} onChange={(e) => s.setLabel(e.target.value)} placeholder="SENIOR ENGINEER" />
      </div>
      <div className="rw-field">
        <label htmlFor={`${idp}-amount`}>
          {s.recurring ? `Amount / month (${summary.currency})` : `Amount (${summary.currency})`}
        </label>
        <input id={`${idp}-amount`} value={s.amount} onChange={(e) => s.setAmount(e.target.value)} type="number" step="any" min="0" placeholder="0" />
      </div>
      <div className="rw-field">
        <label htmlFor={`${idp}-month`}>{s.recurring ? "Starting month" : "Month"}</label>
        <select id={`${idp}-month`} value={s.month} onChange={(e) => s.setMonth(e.target.value)}>
          {futureMonths.map((m) => (
            <option key={m.ym} value={m.ym}>{m.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

/* ---------- simulator math (linear model at current avg burn) ---------- */

function project(summary: RunwaySummary, s: ItemState): {
  base: number; after: number; burnAfter: number | null;
} | null {
  const liq = summary.liquidityTotalNum;
  const burn = summary.averageBurnNum !== null ? Math.abs(summary.averageBurnNum) : null;
  const amt = Number(s.amount);
  if (liq === null || burn === null || burn <= 0) return null;
  if (!Number.isFinite(amt) || amt <= 0) return null;
  const base = liq / burn;
  const startIdx = summary.months.findIndex((m) => m.ym === s.month);
  const curIdx = summary.months.findIndex((m) => m.ym === summary.currentMonthYm);
  const off = startIdx >= 0 && curIdx >= 0 ? Math.max(0, startIdx - curIdx) : 0;
  let after = base;
  let burnAfter: number | null = null;
  const kind = s.cat?.kind;
  if (kind === "recurringExpense") {
    // Costs `amt`/mo from month `off` on: cash lasts r where liq = burn*r + amt*(r-off).
    after = base <= off ? base : (liq + amt * off) / (burn + amt);
    burnAfter = burn + amt;
  } else if (kind === "oneTimeExpense") {
    after = off >= base ? base : Math.max(0, (liq - amt) / burn);
  } else if (kind === "inflow") {
    after = off >= base ? base : (liq + amt) / burn; // only helps if it arrives before cash-out
  }
  return { base, after, burnAfter };
}

function monthAt(summary: RunwaySummary, monthsFromNow: number): string {
  const curIdx = summary.months.findIndex((m) => m.ym === summary.currentMonthYm);
  if (curIdx < 0) return "—";
  const i = curIdx + Math.floor(monthsFromNow);
  return i < summary.months.length ? summary.months[i].label : `after ${summary.months[summary.months.length - 1].label}`;
}

function fmtMoney(cur: "USD" | "INR", n: number): string {
  return cur === "USD"
    ? (n < 0 ? "-$" : "$") + Math.round(Math.abs(n)).toLocaleString("en-US")
    : (n < 0 ? "-₹" : "₹") + Math.round(Math.abs(n)).toLocaleString("en-IN");
}

/* ---------- main ---------- */

export function RunwayClient({ summary }: { summary: RunwaySummary }) {
  const router = useRouter();
  const addS = useItemState(summary);
  const simS = useItemState(summary);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [dialog, setDialog] = React.useState<Dialog>(null);

  const runwayMonths = summary.runwayMonths ?? NaN;
  const fill = Number.isFinite(runwayMonths)
    ? Math.max(0, Math.min(BAR_MAX, Math.round(runwayMonths)))
    : 0;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDialog(null);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  async function writeItem(s: ItemState, source: string) {
    if (!s.label.trim() || !(Number(s.amount) > 0)) {
      setDialog({ kind: "error", text: `${source}: need a label and an amount above zero before writing.` });
      return;
    }
    setMsg(null);
    setBusy(true);
    const res = await fetch("/api/runway/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryKey: s.categoryKey,
        label: s.label,
        amount: Number(s.amount),
        startMonth: s.month || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: "Verify failed — see error" });
      setDialog({ kind: "error", text: data.error ?? `Write failed (HTTP ${res.status}).` });
      return;
    }
    const warn = data.warnings?.length ? ` ${data.warnings.join(" ")}` : "";
    const wrote = data.fxRate
      ? `$${Number(data.amountPerMonth).toLocaleString("en-US")} (₹${Number(data.amountWrittenPerMonth).toLocaleString("en-IN")} written at ₹${data.fxRate}/$)`
      : `₹${Number(data.amountWrittenPerMonth ?? data.amountPerMonth).toLocaleString("en-IN")}`;
    setMsg({ ok: true, text: `Wrote "${s.label}" → ${data.category}` });
    setDialog({
      kind: "ok",
      text: `Write verified. "${s.label}" → ${data.category}, row ${data.row}. ${wrote} × ${data.monthsWritten.length} month${data.monthsWritten.length > 1 ? "s" : ""} (${data.monthsWritten[0]}${data.monthsWritten.length > 1 ? ` → ${data.monthsWritten[data.monthsWritten.length - 1]}` : ""}).${warn}`,
    });
    s.setLabel("");
    s.setAmount("");
    router.refresh();
  }

  const proj = project(summary, simS);
  const afterFill = proj ? Math.max(0, Math.min(BAR_MAX, Math.round(proj.after))) : fill;
  const cur = summary.currency;

  return (
    <div className="rw-wrap">
      <div className="rw-cols">
        {/* ===== left ===== */}
        <div>
          <div className="rw-win">
            <div className="rw-titlebar"><span>STATUS.EXE</span><span className="rw-x" aria-hidden="true">✕</span></div>
            <div className="rw-body">
              <div className="rw-stats">
                <div className="rw-stat">
                  <div className="k">Runway</div>
                  <div className="v">{summary.runway ?? "—"}</div>
                  <div className="d">months of cash</div>
                </div>
                <div className="rw-stat">
                  <div className="k">Avg burn</div>
                  <div className="v blue">{summary.averageBurn ?? "—"}</div>
                  <div className="d">per month</div>
                </div>
                <div className="rw-stat">
                  <div className="k">Total burn</div>
                  <div className="v">{summary.totalBurn ?? "—"}</div>
                  <div className="d">all time</div>
                </div>
                <div className="rw-stat gameover">
                  <div className="k">Game over at</div>
                  <div className="v">{summary.outOfCash ?? "—"}</div>
                  <div className="d">out of cash · current plan</div>
                </div>
              </div>
              <div className="rw-health">
                <div className="rw-health-row">
                  <PixelHeart scale={3} />
                  <div className="rw-bar" role="img" aria-label={`Runway health: ${fill} of ${BAR_MAX} months`}>
                    {Array.from({ length: BAR_MAX }, (_, i) => (
                      <i key={i} className={i < fill ? (i === fill - 1 ? "tip" : "fill") : ""} />
                    ))}
                  </div>
                </div>
                <div className="cap">
                  {Number.isFinite(runwayMonths) ? `${fill}/${BAR_MAX} months` : "runway unreadable"} · current month {summary.currentMonth ?? "—"}
                </div>
              </div>
            </div>
          </div>

          <div className="rw-win">
            <div className="rw-titlebar"><span>LIQUIDITY.DAT</span><span className="rw-x" aria-hidden="true">✕</span></div>
            <div className="rw-body">
              <div className="rw-lst">
                {summary.liquidity.map((l) => (
                  <div className="rw-lrow" key={l.label}>
                    <span className="nm">{l.label}</span>
                    <span>{l.value}</span>
                  </div>
                ))}
                {summary.liquidityTotalNum !== null && (
                  <div className="rw-lrow total">
                    <span>TOTAL</span>
                    <span>{fmtMoney(cur, summary.liquidityTotalNum)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rw-win">
            <div className="rw-titlebar"><span>CATEGORIES.DAT</span><span className="rw-x" aria-hidden="true">✕</span></div>
            <div className="rw-body">
              <div className="rw-lst">
                {summary.categories.map((c) => (
                  <div className="rw-lrow" key={c.key} style={{ display: "block" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span className="nm">
                        {c.label}
                        <span className={"rw-tag" + (c.kind === "inflow" ? " blue" : "")}>
                          {c.kind === "inflow" ? "inflow" : c.kind === "recurringExpense" ? "recur" : "1-time"}
                        </span>
                      </span>
                      <span>{c.total}</span>
                    </div>
                    {c.issues.length > 0 && <div className="rw-issue">{c.issues.join(" ")}</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ===== right ===== */}
        <div>
          {/* ---- simulator: nothing is written until COMMIT ---- */}
          <div className="rw-win">
            <div className="rw-titlebar"><span>SIMULATOR.EXE</span><span className="rw-x" aria-hidden="true">✕</span></div>
            <div className="rw-body">
              {summary.currentMonthYm === null || summary.liquidityTotalNum === null || summary.averageBurnNum === null ? (
                <p className="rw-note" style={{ margin: 0 }}>
                  Simulator needs the current month, liquidity and average burn from the sheet — one of them is unreadable.
                </p>
              ) : (
                <>
                  <ItemFields idp="sim" summary={summary} s={simS} />
                  <div className="rw-sim" aria-live="polite">
                    {proj ? (
                      <>
                        <div className="rw-lst" style={{ marginTop: 12 }}>
                          <div className="rw-lrow">
                            <span className="nm">RUNWAY</span>
                            <span>
                              {proj.base.toFixed(1)} → <b>{proj.after.toFixed(1)} MO</b>
                              <span className={"rw-delta" + (proj.after < proj.base ? " bad" : "")}>
                                {" "}{proj.after >= proj.base ? "+" : ""}{(proj.after - proj.base).toFixed(1)}
                              </span>
                            </span>
                          </div>
                          <div className="rw-lrow">
                            <span className="nm">GAME OVER</span>
                            <span>{monthAt(summary, proj.base)} → <b>{monthAt(summary, proj.after)}</b></span>
                          </div>
                          {proj.burnAfter !== null && (
                            <div className="rw-lrow">
                              <span className="nm">AVG BURN</span>
                              <span>{fmtMoney(cur, Math.abs(summary.averageBurnNum))} → <b>{fmtMoney(cur, proj.burnAfter)}</b>/MO</span>
                            </div>
                          )}
                        </div>
                        <div className="rw-health" style={{ marginTop: 12 }}>
                          <div className="rw-health-row">
                            <PixelHeart scale={2} />
                            <div className="rw-bar" role="img" aria-label={`Simulated runway: ${afterFill} of ${BAR_MAX} months`}>
                              {Array.from({ length: BAR_MAX }, (_, i) => {
                                let cls = "";
                                if (i < Math.min(afterFill, fill)) cls = "fill";
                                else if (i < fill) cls = "lost"; // segments this item burns
                                else if (i < afterFill) cls = "gain"; // segments an inflow adds
                                return <i key={i} className={cls} />;
                              })}
                            </div>
                          </div>
                          <div className="cap">
                            simulated: {afterFill}/{BAR_MAX} months · linear model at current avg burn — the sheet is untouched
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="rw-note">Enter an amount to see the impact. Nothing is written until you commit.</p>
                    )}
                  </div>
                  <div className="rw-actions">
                    <button
                      className="rw-go"
                      type="button"
                      disabled={busy || !proj || (simS.cat ? !simS.cat.writable : false)}
                      onClick={() => writeItem(simS, "SIMULATOR")}
                    >
                      {busy ? "Writing…" : "▶ Commit to sheet"}
                    </button>
                    {simS.cat && !simS.cat.writable && (
                      <span className="rw-msg err">Locked: {simS.cat.issues.join(" ")}</span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ---- direct add ---- */}
          <div className="rw-win">
            <div className="rw-titlebar"><span>ADD_ITEM.EXE</span><span className="rw-x" aria-hidden="true">✕</span></div>
            <div className="rw-body">
              {summary.currentMonthYm === null ? (
                <p className="rw-note" style={{ margin: 0 }}>
                  Current month not found in the sheet&apos;s month headers — writes are disabled.
                </p>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    writeItem(addS, "ADD_ITEM");
                  }}
                >
                  <ItemFields idp="add" summary={summary} s={addS} />
                  {addS.cat && !addS.cat.writable && (
                    <p className="rw-note">Locked: {addS.cat.issues.join(" ")}</p>
                  )}
                  <p className="rw-note">
                    {addS.recurring
                      ? "Fills start month → last column, inside the category's SUM."
                      : "Writes one month, inside the category's SUM."}{" "}
                    Verified after the write; mismatch = rollback.
                  </p>
                  <div className="rw-actions">
                    <button className="rw-go" type="submit" disabled={busy || (addS.cat ? !addS.cat.writable : false)}>
                      {busy ? "Writing…" : "▶ Write to sheet"}
                    </button>
                    {msg && <span className={"rw-msg" + (msg.ok ? "" : " err")}>{msg.text}</span>}
                  </div>
                </form>
              )}
            </div>
          </div>

          <div className="rw-win rw-console">
            <div className="rw-titlebar"><span>WRITE.LOG</span><span className="rw-x" aria-hidden="true">✕</span></div>
            <div className="rw-body">
              <div className="ln">Simulator: linear model, in-memory only. Commit/write: insert inside the SUM → verify → rollback on mismatch.</div>
              <div className="ln">Columns left of {summary.currentMonth ?? "the current month"} are actuals — never written.</div>
              <div className="ln">Tab: {summary.tab} <span className="st">LIVE</span></div>
            </div>
          </div>

          {summary.issues.length > 0 && (
            <div className="rw-win">
              <div className="rw-titlebar"><span>NOTES.TXT</span><span className="rw-x" aria-hidden="true">✕</span></div>
              <div className="rw-body">
                {summary.issues.map((i, n) => (
                  <p className="rw-note" key={n} style={{ margin: "0 0 6px" }}>{i}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {dialog && (
        <div className="rw-overlay" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) setDialog(null); }}>
          <div className={"rw-dialog" + (dialog.kind === "error" ? " error" : "")}>
            <div className="rw-titlebar">
              <span>{dialog.kind === "error" ? "ERROR" : "WRITE OK"}</span>
              <button className="rw-x" type="button" onClick={() => setDialog(null)} aria-label="Close dialog">✕</button>
            </div>
            <div className="rw-dlg-body">
              <div className="rw-dlg-icon">{dialog.kind === "error" ? "✕" : "✓"}</div>
              <div className="rw-dlg-text">{dialog.text}</div>
            </div>
            <div className="rw-dlg-actions">
              <button className="rw-dlg-btn" type="button" onClick={() => setDialog(null)} autoFocus>OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function RunwayMast({ right, tab }: { right?: React.ReactNode; tab?: string }) {
  return (
    <>
      <div className="rw-mast">
        <div>
          <PixelText text="RUNWAY.EXE" scale={6} color="#ffffff" />
          <div className="rw-sub" style={{ marginTop: 10 }}>
            burn tracker <b>LIVE</b>{tab ? <> · {tab}</> : null}
          </div>
        </div>
        {right}
      </div>
      <div className="rw-wrap"><div className="rw-dither" /></div>
    </>
  );
}
