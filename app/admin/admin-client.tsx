"use client";
import * as React from "react";
import { Investor, IntroRelationship, MeetingNote, STAGES } from "@/lib/types";
import { Meeting } from "@/lib/calendar";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { InvestorDrawer } from "@/components/admin/investor-drawer";
import { NewInvestorDialog } from "@/components/admin/new-investor-dialog";

type View = "table" | "kanban";

export function AdminClient(props: {
  initialInvestors: Investor[];
  initialIntros: IntroRelationship[];
  initialMeetingNotes: MeetingNote[];
  meetings: Meeting[];
}) {
  return (
    <ToastProvider>
      <Inner {...props} />
    </ToastProvider>
  );
}

function Inner({
  initialInvestors,
  initialIntros,
  initialMeetingNotes,
  meetings,
}: {
  initialInvestors: Investor[];
  initialIntros: IntroRelationship[];
  initialMeetingNotes: MeetingNote[];
  meetings: Meeting[];
}) {
  const toast = useToast();
  const [investors, setInvestors] = React.useState(initialInvestors);
  const [intros, setIntros] = React.useState(initialIntros);
  const [meetingNotes, setMeetingNotes] = React.useState(initialMeetingNotes);
  const [view, setView] = React.useState<View>("table");
  const [q, setQ] = React.useState("");
  const [stage, setStage] = React.useState<string>("all");
  const [priority, setPriority] = React.useState<string>("all");
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [newOpen, setNewOpen] = React.useState(false);

  const introsByInvestor = React.useMemo(() => {
    const map = new Map<string, IntroRelationship[]>();
    intros.forEach((i) => {
      const arr = map.get(i.investor_id) ?? [];
      arr.push(i);
      map.set(i.investor_id, arr);
    });
    return map;
  }, [intros]);

  const filtered = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    return investors.filter((i) => {
      if (stage !== "all" && i.stage !== stage) return false;
      if (priority !== "all" && i.priority !== priority) return false;
      if (!term) return true;
      return [
        i.full_name,
        i.company_project,
        i.category,
        i.tags,
        i.email,
        i.notes,
        i.next_steps,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [investors, q, stage, priority]);

  // Keyboard: cmd/ctrl+k focus search, n new
  const searchRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const editing =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (!editing && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setNewOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  async function patchInvestor(id: string, patch: Partial<Investor>) {
    setInvestors((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...patch, updated_at: new Date().toISOString() } : i)),
    );
    const res = await fetch(`/api/investors/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      toast.push("Save failed.");
      return;
    }
    toast.push("Saved.");
  }

  async function patchIntro(id: string, patch: Partial<IntroRelationship>) {
    setIntros((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    const res = await fetch(`/api/intros/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) toast.push("Intro update failed.");
  }

  async function saveMeetingNote(note: MeetingNote) {
    const res = await fetch("/api/meeting-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(note),
    });
    if (!res.ok) {
      toast.push("Save failed.");
      return;
    }
    const saved = (await res.json()) as MeetingNote;
    setMeetingNotes((prev) => {
      const idx = prev.findIndex((n) => n.event_id === saved.event_id);
      if (idx < 0) return [...prev, saved];
      const copy = [...prev];
      copy[idx] = saved;
      return copy;
    });
    toast.push("Saved.");
  }

  async function createInvestor(inv: Partial<Investor>) {
    const res = await fetch("/api/investors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inv),
    });
    if (!res.ok) {
      toast.push("Could not create.");
      return;
    }
    const created = (await res.json()) as Investor;
    setInvestors((prev) => [created, ...prev]);
    toast.push("Investor added.");
  }

  const active = investors.find((i) => i.id === activeId) ?? null;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-center gap-2 mb-4">
        <h1 className="text-xl font-semibold tracking-tight">Pipeline</h1>
        <span className="text-sm text-ink-500">{filtered.length}</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="border rounded p-0.5 flex">
            <button
              onClick={() => setView("table")}
              className={
                "h-7 px-2.5 rounded text-xs " +
                (view === "table" ? "bg-ink-950 text-white" : "text-ink-700 hover:bg-ink-50")
              }
            >
              Table
            </button>
            <button
              onClick={() => setView("kanban")}
              className={
                "h-7 px-2.5 rounded text-xs " +
                (view === "kanban" ? "bg-ink-950 text-white" : "text-ink-700 hover:bg-ink-50")
              }
            >
              Kanban
            </button>
          </div>
          <Button onClick={() => setNewOpen(true)}>+ New</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Input
          ref={searchRef}
          placeholder="Search…  (⌘K)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="all">All stages</option>
          {STAGES.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </Select>
        <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="all">All priorities</option>
          <option value="p0">P0</option>
          <option value="p1">P1</option>
          <option value="p2">P2</option>
          <option value="p3">P3</option>
        </Select>
        <div className="ml-auto text-xs text-ink-500">Press <kbd className="border rounded px-1">N</kbd> to add</div>
      </div>

      {view === "table" ? (
        <Table
          investors={filtered}
          introCount={(id) => introsByInvestor.get(id)?.length ?? 0}
          onOpen={(id) => setActiveId(id)}
          onPatch={patchInvestor}
        />
      ) : (
        <Kanban
          investors={filtered}
          onOpen={(id) => setActiveId(id)}
          onPatch={patchInvestor}
        />
      )}

      <InvestorDrawer
        investor={active}
        intros={intros}
        meetings={meetings}
        meetingNotes={meetingNotes}
        onClose={() => setActiveId(null)}
        onPatch={patchInvestor}
        onPatchIntro={patchIntro}
        onSaveMeetingNote={saveMeetingNote}
      />
      <NewInvestorDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreate={createInvestor}
      />
    </main>
  );
}

function Table({
  investors,
  introCount,
  onOpen,
  onPatch,
}: {
  investors: Investor[];
  introCount: (id: string) => number;
  onOpen: (id: string) => void;
  onPatch: (id: string, patch: Partial<Investor>) => Promise<void>;
}) {
  return (
    <div className="border rounded overflow-hidden">
      <div className="grid grid-cols-12 border-b bg-ink-50 text-[11px] uppercase tracking-wide text-ink-500 px-3 h-9 items-center">
        <div className="col-span-3">Name</div>
        <div className="col-span-2">Company</div>
        <div className="col-span-2">Stage</div>
        <div className="col-span-1">Priority</div>
        <div className="col-span-2">Next steps</div>
        <div className="col-span-1">Intros</div>
        <div className="col-span-1 text-right">Updated</div>
      </div>
      {investors.length === 0 ? (
        <div className="p-8 text-center text-sm text-ink-500">Nothing here yet.</div>
      ) : (
        investors.map((i) => (
          <div
            key={i.id}
            onClick={() => onOpen(i.id)}
            className="grid grid-cols-12 px-3 h-11 items-center border-b last:border-b-0 hover:bg-ink-50 cursor-pointer text-sm"
          >
            <div className="col-span-3 truncate font-medium">{i.full_name}</div>
            <div className="col-span-2 truncate text-ink-700">{i.company_project}</div>
            <div className="col-span-2" onClick={(e) => e.stopPropagation()}>
              <Select
                value={i.stage}
                onChange={(e) => onPatch(i.id, { stage: e.target.value as Investor["stage"] })}
                className="w-full max-w-[180px]"
              >
                <option value="">—</option>
                {STAGES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </Select>
            </div>
            <div className="col-span-1">
              {i.priority ? (
                <Badge>{i.priority.toUpperCase()}</Badge>
              ) : (
                <span className="text-ink-400 text-xs">—</span>
              )}
            </div>
            <div className="col-span-2 truncate text-ink-600 text-xs">{i.next_steps}</div>
            <div className="col-span-1 text-xs text-ink-500">{introCount(i.id) || "—"}</div>
            <div className="col-span-1 text-right text-xs text-ink-400">
              {i.updated_at ? new Date(i.updated_at).toLocaleDateString() : "—"}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function Kanban({
  investors,
  onOpen,
  onPatch,
}: {
  investors: Investor[];
  onOpen: (id: string) => void;
  onPatch: (id: string, patch: Partial<Investor>) => Promise<void>;
}) {
  const cols = STAGES;
  const [dragId, setDragId] = React.useState<string | null>(null);

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {cols.map((col) => {
        const items = investors.filter((i) => i.stage === col.id);
        return (
          <div
            key={col.id}
            className="w-64 shrink-0 border rounded bg-white"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId) {
                onPatch(dragId, { stage: col.id });
                setDragId(null);
              }
            }}
          >
            <div className="px-3 h-9 border-b flex items-center justify-between">
              <div className="text-xs font-medium">{col.label}</div>
              <div className="text-[11px] text-ink-500">{items.length}</div>
            </div>
            <div className="p-2 space-y-2 min-h-[40px]">
              {items.map((i) => (
                <div
                  key={i.id}
                  draggable
                  onDragStart={() => setDragId(i.id)}
                  onClick={() => onOpen(i.id)}
                  className="border rounded p-2 hover:bg-ink-50 cursor-pointer"
                >
                  <div className="text-sm font-medium truncate">{i.full_name}</div>
                  <div className="text-xs text-ink-500 truncate">{i.company_project}</div>
                  <div className="mt-1 flex gap-1">
                    {i.priority && <Badge>{i.priority.toUpperCase()}</Badge>}
                    {i.category && <Badge>{i.category}</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
