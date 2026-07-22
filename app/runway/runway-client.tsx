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

type Dialog =
  | { kind: "ok"; text: string }
  | { kind: "error"; text: string }
  | null;

export function RunwayClient({ summary }: { summary: RunwaySummary }) {
  const router = useRouter();
  const [type, setType] = React.useState<AddType>("hire");
  const [category, setCategory] = React.useState("other_capex");
  const [label, setLabel] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [month, setMonth] = React.useState(summary.currentMonthYm ?? "");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [dialog, setDialog] = React.useState<Dialog>(null);

  const addType = ADD_TYPES.find((t) => t.id === type)!;
  const categoryKey = addType.fixedCategory ?? category;
  const cat = summary.categories.find((c) => c.key === categoryKey);
  const pickable = addType.pickFrom
    ? summary.categories.filter((c) => c.kind === addType.pickFrom)
    : [];
  const futureMonths = summary.currentMonthYm
    ? summary.months.slice(summary.months.findIndex((m) => m.ym === summary.currentMonthYm))
    : [];
  const recurring = cat?.kind === "recurringExpense";

  // Health bar: parse a number of months out of the sheet's formatted runway cell.
  const runwayMonths = parseFloat((summary.runway ?? "").replace(/[^\d.]/g, ""));
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    const res = await fetch("/api/runway/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryKey, label, amount: Number(amount), startMonth: month || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: "Verify failed — see error" });
      setDialog({ kind: "error", text: data.error ?? `Write failed (HTTP ${res.status}).` });
      return;
    }
    const warn = data.warnings?.length ? ` ${data.warnings.join(" ")}` : "";
    setMsg({ ok: true, text: `Wrote "${label}" → ${data.category}` });
    setDialog({
      kind: "ok",
      text: `Write verified. "${label}" → ${data.category}, row ${data.row}. ${data.amountPerMonth} × ${data.monthsWritten.length} month${data.monthsWritten.length > 1 ? "s" : ""} (${data.monthsWritten[0]}${data.monthsWritten.length > 1 ? ` → ${data.monthsWritten[data.monthsWritten.length - 1]}` : ""}).${warn}`,
    });
    setLabel("");
    setAmount("");
    router.refresh();
  }

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
          <div className="rw-win">
            <div className="rw-titlebar"><span>ADD_ITEM.EXE</span><span className="rw-x" aria-hidden="true">✕</span></div>
            <div className="rw-body">
              {summary.currentMonthYm === null ? (
                <p className="rw-note">
                  Current month not found in the sheet&apos;s month headers — writes are disabled.
                  Fix the month headers in the sheet first.
                </p>
              ) : (
                <form onSubmit={submit}>
                  <div className="rw-grid2">
                    <div className="rw-field">
                      <label htmlFor="rw-type">Type</label>
                      <select id="rw-type" value={type} onChange={(e) => setType(e.target.value as AddType)}>
                        {ADD_TYPES.map((t) => (
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="rw-field">
                      <label htmlFor="rw-cat">Category</label>
                      {addType.pickFrom ? (
                        <select id="rw-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
                          {pickable.map((c) => (
                            <option key={c.key} value={c.key}>{c.label}</option>
                          ))}
                        </select>
                      ) : (
                        <div className="fixed">{cat?.label ?? categoryKey}</div>
                      )}
                    </div>
                    <div className="rw-field">
                      <label htmlFor="rw-label">Label (column A)</label>
                      <input id="rw-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="SENIOR ENGINEER" required />
                    </div>
                    <div className="rw-field">
                      <label htmlFor="rw-amount">{recurring ? "Amount / month (INR)" : "Amount (INR)"}</label>
                      <input id="rw-amount" value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="any" placeholder="0" required />
                    </div>
                    <div className="rw-field">
                      <label htmlFor="rw-month">{recurring ? "Starting month" : "Month"}</label>
                      <select id="rw-month" value={month} onChange={(e) => setMonth(e.target.value)}>
                        {futureMonths.map((m) => (
                          <option key={m.ym} value={m.ym}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {cat && !cat.writable && (
                    <p className="rw-note">Locked: {cat.issues.join(" ")}</p>
                  )}
                  <p className="rw-note">
                    {recurring
                      ? "Fills start month → last column, inside the category's SUM."
                      : "Writes one month, inside the category's SUM."}{" "}
                    Verified after the write; mismatch = rollback.
                  </p>
                  <div className="rw-actions">
                    <button className="rw-go" type="submit" disabled={busy || (cat ? !cat.writable : false)}>
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
              <div className="ln">Guarded write: insert inside the SUM → write → verify totals → rollback on mismatch.</div>
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
