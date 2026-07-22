"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RunwaySummary } from "@/lib/runway/sheets";

// Each "Add" input maps to a sheet category (see the Part B spec):
// hire → people, marketing initiative → marketing, investor → capital_inflow,
// one-off → user-picked oneTimeExpense (default other_capex),
// recurring → user-picked recurringExpense.
type AddType = "hire" | "marketing" | "investor" | "oneoff" | "recurring";

const ADD_TYPES: { id: AddType; label: string; fixedCategory?: string; pickFrom?: "oneTimeExpense" | "recurringExpense" }[] = [
  { id: "hire", label: "Full-time hire", fixedCategory: "people" },
  { id: "marketing", label: "Marketing initiative", fixedCategory: "marketing" },
  { id: "investor", label: "New angel / investor", fixedCategory: "capital_inflow" },
  { id: "oneoff", label: "One-off cost", pickFrom: "oneTimeExpense" },
  { id: "recurring", label: "Recurring expense", pickFrom: "recurringExpense" },
];

const selectCls =
  "h-8 w-full rounded border bg-white px-2 text-sm text-ink-950 focus:outline-none focus:ring-1 focus:ring-ink-950";

export function RunwayClient({ summary }: { summary: RunwaySummary }) {
  const router = useRouter();
  const [type, setType] = React.useState<AddType>("hire");
  const [category, setCategory] = React.useState("other_capex");
  const [label, setLabel] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [month, setMonth] = React.useState(summary.currentMonthYm ?? "");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  const addType = ADD_TYPES.find((t) => t.id === type)!;
  const categoryKey = addType.fixedCategory ?? category;
  const cat = summary.categories.find((c) => c.key === categoryKey);
  const pickable = addType.pickFrom
    ? summary.categories.filter((c) => c.kind === addType.pickFrom)
    : [];
  const futureMonths = summary.currentMonthYm
    ? summary.months.slice(summary.months.findIndex((m) => m.ym === summary.currentMonthYm))
    : [];

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
      setMsg({ ok: false, text: data.error ?? `Failed (HTTP ${res.status})` });
      return;
    }
    const warn = data.warnings?.length ? ` (${data.warnings.join(" ")})` : "";
    setMsg({
      ok: true,
      text: `Added "${label}" to ${data.category} — ${data.monthsWritten.length} month(s) written and verified.${warn}`,
    });
    setLabel("");
    setAmount("");
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {/* Headline stats */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Runway" value={summary.runway ?? "—"} />
        <Stat label="Average burn" value={summary.averageBurn ?? "—"} />
        <Stat label="Out of cash" value={summary.outOfCash ?? "—"} />
        <Stat label="Total burn" value={summary.totalBurn ?? "—"} />
      </section>

      {/* Liquidity */}
      <section>
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-600 mb-2">Liquidity</h2>
        <div className="border rounded divide-y">
          {summary.liquidity.map((l) => (
            <div key={l.label} className="flex items-center justify-between px-3 h-9 text-sm">
              <span>{l.label}</span>
              <span className="tabular-nums">{l.value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Add */}
      <section>
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-600 mb-2">
          Add to plan{summary.currentMonth ? ` · from ${summary.currentMonth}` : ""}
        </h2>
        {summary.currentMonthYm === null ? (
          <div className="border rounded p-4 text-sm text-ink-700">
            The current month was not found in the sheet&apos;s month headers, so writes are
            disabled. Fix the month headers in the sheet first.
          </div>
        ) : (
          <form onSubmit={submit} className="border rounded p-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-xs text-ink-600">Type</span>
                <select className={selectCls} value={type} onChange={(e) => setType(e.target.value as AddType)}>
                  {ADD_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </label>
              {addType.pickFrom ? (
                <label className="block space-y-1">
                  <span className="text-xs text-ink-600">Category</span>
                  <select className={selectCls} value={category} onChange={(e) => setCategory(e.target.value)}>
                    {pickable.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="block space-y-1">
                  <span className="text-xs text-ink-600">Category</span>
                  <div className="h-8 flex items-center px-2 text-sm border rounded bg-ink-50">
                    {cat?.label ?? categoryKey}
                  </div>
                </div>
              )}
              <label className="block space-y-1">
                <span className="text-xs text-ink-600">Label (column A)</span>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder='e.g. "Senior engineer" or "Jane Doe (angel)"' required />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-ink-600">
                  {cat?.kind === "recurringExpense" ? "Amount per month" : "Amount"}
                </span>
                <Input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="any" placeholder="0" required />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-ink-600">
                  {cat?.kind === "recurringExpense" ? "Starting month" : "Month"}
                </span>
                <select className={selectCls} value={month} onChange={(e) => setMonth(e.target.value)}>
                  {futureMonths.map((m) => (
                    <option key={m.ym} value={m.ym}>{m.label}</option>
                  ))}
                </select>
              </label>
            </div>
            {cat && !cat.writable && (
              <p className="text-xs text-ink-700">
                This category can&apos;t be written right now: {cat.issues.join(" ")}
              </p>
            )}
            <p className="text-xs text-ink-500">
              {cat?.kind === "recurringExpense"
                ? "Fills every month from the starting month through the last column, inside the category's SUM."
                : "Writes a single month, inside the category's SUM."}{" "}
              The total is verified after the write; if it doesn&apos;t move by exactly this amount, the row is rolled back.
            </p>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={busy || (cat ? !cat.writable : false)}>
                {busy ? "Writing…" : "Add to sheet"}
              </Button>
              {msg && (
                <span className={"text-xs " + (msg.ok ? "text-ink-700" : "text-ink-950 font-medium")}>
                  {msg.text}
                </span>
              )}
            </div>
          </form>
        )}
      </section>

      {/* Categories */}
      <section>
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-600 mb-2">
          Categories · {summary.tab}
        </h2>
        <div className="border rounded divide-y">
          {summary.categories.map((c) => (
            <div key={c.key} className="px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span>
                  {c.label}
                  <span className="ml-2 text-xs text-ink-500">
                    {c.kind === "inflow" ? "inflow" : c.kind === "recurringExpense" ? "recurring" : "one-time"}
                  </span>
                </span>
                <span className="tabular-nums">{c.total}</span>
              </div>
              {c.issues.length > 0 && (
                <p className="text-xs text-ink-500 mt-1">{c.issues.join(" ")}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {summary.issues.length > 0 && (
        <section className="border rounded p-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-ink-600 mb-1">
            Map validation notes
          </h2>
          <ul className="text-xs text-ink-600 list-disc pl-4 space-y-0.5">
            {summary.issues.map((i, n) => (
              <li key={n}>{i}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded p-3">
      <div className="text-xs text-ink-600">{label}</div>
      <div className="text-lg font-semibold tracking-tight tabular-nums mt-1">{value}</div>
    </div>
  );
}
