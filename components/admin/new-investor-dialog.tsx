"use client";
import * as React from "react";
import { Dialog } from "@/components/ui/drawer";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Investor } from "@/lib/types";

export function NewInvestorDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (inv: Partial<Investor>) => Promise<void>;
}) {
  const [draft, setDraft] = React.useState<Partial<Investor>>({});
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) setDraft({});
  }, [open]);

  function f<K extends keyof Investor>(k: K, v: Investor[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.full_name?.trim()) return;
    setBusy(true);
    try {
      await onCreate(draft);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <form onSubmit={submit} className="p-5">
        <div className="text-sm font-semibold">New investor</div>
        <div className="mt-4 space-y-2">
          <Input
            placeholder="Full name"
            autoFocus
            value={draft.full_name ?? ""}
            onChange={(e) => f("full_name", e.target.value)}
          />
          <Input
            placeholder="Company / project"
            value={draft.company_project ?? ""}
            onChange={(e) => f("company_project", e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Category"
              value={draft.category ?? ""}
              onChange={(e) => f("category", e.target.value)}
            />
            <Select
              value={draft.priority ?? ""}
              onChange={(e) => f("priority", e.target.value as Investor["priority"])}
            >
              <option value="">Priority…</option>
              <option value="p0">P0</option>
              <option value="p1">P1</option>
              <option value="p2">P2</option>
              <option value="p3">P3</option>
            </Select>
          </div>
          <Input
            placeholder="Email"
            type="email"
            value={draft.email ?? ""}
            onChange={(e) => f("email", e.target.value)}
          />
          <Input
            placeholder="Relevance / why"
            value={draft.relevance ?? ""}
            onChange={(e) => f("relevance", e.target.value)}
          />
          <Input
            placeholder="Node (entry path)"
            value={draft.node ?? ""}
            onChange={(e) => f("node", e.target.value)}
          />
          <Input
            placeholder="Tags (comma separated)"
            value={draft.tags ?? ""}
            onChange={(e) => f("tags", e.target.value)}
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Adding…" : "Add"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
