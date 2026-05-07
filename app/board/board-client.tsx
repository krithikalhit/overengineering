"use client";
import * as React from "react";
import { PublicInvestor } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/drawer";
import { ToastProvider, useToast } from "@/components/ui/toast";

type Identity = { name: string; email: string; company?: string };
const ID_KEY = "oe_identity_v1";
const OFFERED_KEY = "oe_offered_v1";

function loadIdentity(): Identity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ID_KEY);
    return raw ? (JSON.parse(raw) as Identity) : null;
  } catch {
    return null;
  }
}

function saveIdentity(id: Identity) {
  localStorage.setItem(ID_KEY, JSON.stringify(id));
}

function loadOffered(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(OFFERED_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function saveOffered(s: Set<string>) {
  localStorage.setItem(OFFERED_KEY, JSON.stringify([...s]));
}

export function BoardClient({ investors }: { investors: PublicInvestor[] }) {
  return (
    <ToastProvider>
      <BoardInner investors={investors} />
    </ToastProvider>
  );
}

function BoardInner({ investors }: { investors: PublicInvestor[] }) {
  const toast = useToast();
  const [identity, setIdentity] = React.useState<Identity | null>(null);
  const [offered, setOffered] = React.useState<Set<string>>(new Set());
  const [needsIdentity, setNeedsIdentity] = React.useState(false);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [category, setCategory] = React.useState<string>("all");
  const [relevance, setRelevance] = React.useState<string>("all");

  // Read ?relevance= and ?category= from URL on mount; sync changes back to URL.
  React.useEffect(() => {
    setIdentity(loadIdentity());
    setOffered(loadOffered());
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const r = params.get("relevance");
    const c = params.get("category");
    if (r) setRelevance(r);
    if (c) setCategory(c);
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (relevance === "all") params.delete("relevance");
    else params.set("relevance", relevance);
    if (category === "all") params.delete("category");
    else params.set("category", category);
    const qs = params.toString();
    const next = qs ? `?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", next);
  }, [relevance, category]);

  const categories = React.useMemo(() => {
    const s = new Set<string>();
    investors.forEach((i) => i.category && s.add(i.category));
    return ["all", ...[...s].sort()];
  }, [investors]);

  const RELEVANCE_OPTIONS = ["all", "High", "Medium", "Low"];

  const filtered = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    return investors.filter((i) => {
      if (category !== "all" && i.category !== category) return false;
      if (
        relevance !== "all" &&
        (i.relevance ?? "").toLowerCase() !== relevance.toLowerCase()
      )
        return false;
      if (!term) return true;
      return [i.full_name, i.company_project, i.category, i.tags, i.relevance]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [investors, q, category, relevance]);

  async function offerIntro(investorId: string) {
    if (!identity) {
      setPendingId(investorId);
      setNeedsIdentity(true);
      return;
    }
    const res = await fetch("/api/intros", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ investor_id: investorId, connector: identity }),
    });
    if (!res.ok) {
      toast.push("Could not record intro. Try again.");
      return;
    }
    const next = new Set(offered);
    next.add(investorId);
    setOffered(next);
    saveOffered(next);
    toast.push("Thanks — we'll be in touch.");
  }

  return (
    <>
      <SuggestSection
        identity={identity}
        onNeedIdentity={() => setNeedsIdentity(true)}
      />

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Input
          placeholder="Search investors..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <div className="ml-auto text-xs text-ink-500">
          {identity ? (
            <span>
              Signed in as <span className="text-ink-900">{identity.name}</span>{" "}
              <button
                className="underline hover:no-underline"
                onClick={() => setNeedsIdentity(true)}
              >
                change
              </button>
            </span>
          ) : (
            <span>Not signed in</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <FilterChips
          label="Relevance"
          values={RELEVANCE_OPTIONS}
          active={relevance}
          onChange={setRelevance}
        />
        <div className="hidden sm:block w-px h-5 bg-ink-200" />
        <FilterChips
          label="Category"
          values={categories}
          active={category}
          onChange={setCategory}
        />
      </div>

      <div className="border rounded overflow-hidden">
        <div className="grid grid-cols-12 border-b bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500 px-4 h-9 items-center">
          <div className="col-span-4">Name</div>
          <div className="col-span-4">Company / Project</div>
          <div className="col-span-2">Category</div>
          <div className="col-span-1">Relevance</div>
          <div className="col-span-1 text-right">&nbsp;</div>
        </div>
        {filtered.length === 0 ? (
          <div className="p-8 text-sm text-ink-500 text-center">No matches.</div>
        ) : (
          filtered.map((i) => {
            const did = offered.has(i.id);
            return (
              <div
                key={i.id}
                className="grid grid-cols-12 px-4 h-12 items-center border-b last:border-b-0 hover:bg-ink-50"
              >
                <div className="col-span-4 text-sm font-medium truncate">
                  {i.full_name}
                </div>
                <div className="col-span-4 text-sm text-ink-700 truncate">
                  {i.company_project}
                </div>
                <div className="col-span-2">
                  {i.category && <Badge>{i.category}</Badge>}
                </div>
                <div className="col-span-1">
                  {i.relevance && <Badge>{i.relevance}</Badge>}
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button
                    size="sm"
                    variant={did ? "subtle" : "default"}
                    disabled={did}
                    onClick={() => offerIntro(i.id)}
                  >
                    {did ? "Offered" : "I can intro"}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <IdentityDialog
        open={needsIdentity}
        initial={identity}
        onClose={() => {
          setNeedsIdentity(false);
          setPendingId(null);
        }}
        onSave={(id) => {
          saveIdentity(id);
          setIdentity(id);
          setNeedsIdentity(false);
          if (pendingId) {
            const target = pendingId;
            setPendingId(null);
            void offerIntro(target);
          }
        }}
      />
    </>
  );
}

function SuggestSection({
  identity,
  onNeedIdentity,
}: {
  identity: Identity | null;
  onNeedIdentity: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  function reset() {
    setName("");
    setCompany("");
    setEmail("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (!identity) {
      onNeedIdentity();
      return;
    }
    setBusy(true);
    const res = await fetch("/api/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        suggester: identity,
        person: {
          name: name.trim(),
          company: company.trim() || undefined,
          email: email.trim() || undefined,
        },
      }),
    });
    setBusy(false);
    if (!res.ok) {
      toast.push("Could not save. Try again.");
      return;
    }
    toast.push("Thanks — got it.");
    reset();
    setOpen(false);
  }

  return (
    <div className="mb-8 border rounded">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 h-12 hover:bg-ink-50"
      >
        <div className="text-sm font-medium text-left">
          Is there someone you think we should meet?
        </div>
        <span className="text-xs text-ink-500">{open ? "Close" : "Add"}</span>
      </button>
      {open && (
        <form onSubmit={submit} className="border-t p-4 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Input
              placeholder="Name *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <Input
              placeholder="Company (optional)"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>
          <Input
            placeholder="Email (optional)"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? "Sending…" : "Submit"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function FilterChips({
  label,
  values,
  active,
  onChange,
}: {
  label: string;
  values: string[];
  active: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] uppercase tracking-wide text-ink-500">{label}</span>
      <div className="flex flex-wrap gap-1">
        {values.map((v) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={
              "px-2 h-7 rounded border text-xs " +
              (active === v
                ? "bg-ink-950 text-white border-ink-950"
                : "bg-white text-ink-700 hover:bg-ink-50")
            }
          >
            {v === "all" ? "All" : v}
          </button>
        ))}
      </div>
    </div>
  );
}

function IdentityDialog({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: Identity | null;
  onClose: () => void;
  onSave: (id: Identity) => void;
}) {
  const [name, setName] = React.useState(initial?.name ?? "");
  const [email, setEmail] = React.useState(initial?.email ?? "");
  const [company, setCompany] = React.useState(initial?.company ?? "");

  React.useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setEmail(initial?.email ?? "");
      setCompany(initial?.company ?? "");
    }
  }, [open, initial]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    onSave({ name: name.trim(), email: email.trim(), company: company.trim() || undefined });
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <form onSubmit={submit} className="p-5">
        <div className="text-sm font-semibold">Who are you?</div>
        <p className="mt-1 text-xs text-ink-500">
          We&rsquo;ll save this so you don&rsquo;t have to enter it again.
        </p>
        <div className="mt-4 space-y-2">
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <Input
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            placeholder="Company (optional)"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Dialog>
  );
}
