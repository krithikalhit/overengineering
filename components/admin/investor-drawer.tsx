"use client";
import * as React from "react";
import { Drawer } from "@/components/ui/drawer";
import { Input, Textarea, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Investor, IntroRelationship, MeetingNote, STAGES } from "@/lib/types";
import { Meeting } from "@/lib/calendar";

export function InvestorDrawer({
  investor,
  intros,
  meetings,
  meetingNotes,
  onClose,
  onPatch,
  onPatchIntro,
  onSaveMeetingNote,
}: {
  investor: Investor | null;
  intros: IntroRelationship[];
  meetings: Meeting[];
  meetingNotes: MeetingNote[];
  onClose: () => void;
  onPatch: (id: string, patch: Partial<Investor>) => Promise<void>;
  onPatchIntro: (id: string, patch: Partial<IntroRelationship>) => Promise<void>;
  onSaveMeetingNote: (note: MeetingNote) => Promise<void>;
}) {
  const [draft, setDraft] = React.useState<Investor | null>(investor);
  React.useEffect(() => setDraft(investor), [investor]);

  // Hooks must run unconditionally — compute meeting matches even when there's
  // no active investor, then render nothing below if needed.
  const investorMeetings = React.useMemo(() => {
    if (!investor) return [];
    const email = (investor.email ?? "").trim().toLowerCase();
    const fullName = (investor.full_name ?? "").trim();
    const nameLower = fullName.toLowerCase();
    return meetings
      .filter((m) => {
        const haystack = `${m.attendees ?? ""} ${m.title ?? ""}`.toLowerCase();
        if (email && haystack.includes(email)) return true;
        if (fullName.length >= 3 && haystack.includes(nameLower)) return true;
        return false;
      })
      .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
  }, [meetings, investor]);

  const noteByEvent = React.useMemo(() => {
    const map = new Map<string, MeetingNote>();
    for (const n of meetingNotes) map.set(n.event_id, n);
    return map;
  }, [meetingNotes]);

  if (!investor || !draft) return <Drawer open={false} onClose={onClose}>{null}</Drawer>;

  const inv = investor;
  const investorIntros = intros.filter((i) => i.investor_id === inv.id);

  function field<K extends keyof Investor>(key: K, value: Investor[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  async function save() {
    if (!draft) return;
    const patch: Partial<Investor> = {};
    for (const k of Object.keys(draft) as (keyof Investor)[]) {
      if (draft[k] !== inv[k]) patch[k] = draft[k] as never;
    }
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    await onPatch(inv.id, patch);
    onClose();
  }

  return (
    <Drawer open onClose={onClose}>
      <div className="px-5 py-4 border-b sticky top-0 bg-white flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-base font-semibold truncate">{inv.full_name}</div>
          <div className="text-xs text-ink-500 truncate">
            {inv.company_project}
            {inv.category && <> · {inv.category}</>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button onClick={save}>Save</Button>
        </div>
      </div>

      <div className="p-5 space-y-6">
        <Section title="Status">
          <Row label="Stage">
            <Select
              value={draft.stage}
              onChange={(e) => field("stage", e.target.value as Investor["stage"])}
            >
              <option value="">—</option>
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </Select>
          </Row>
          <Row label="Priority">
            <Select
              value={draft.priority}
              onChange={(e) => field("priority", e.target.value as Investor["priority"])}
            >
              <option value="">—</option>
              <option value="p0">P0</option>
              <option value="p1">P1</option>
              <option value="p2">P2</option>
              <option value="p3">P3</option>
            </Select>
          </Row>
          <Row label="Status">
            <Input value={draft.status} onChange={(e) => field("status", e.target.value)} />
          </Row>
          <Row label="Conviction">
            <Input
              value={draft.conviction_score}
              onChange={(e) => field("conviction_score", e.target.value)}
              placeholder="1–10"
            />
          </Row>
        </Section>

        <Section title="Contact">
          <Row label="Email">
            <Input value={draft.email} onChange={(e) => field("email", e.target.value)} />
          </Row>
          <Row label="LinkedIn">
            <Input value={draft.linkedin} onChange={(e) => field("linkedin", e.target.value)} />
          </Row>
          <Row label="Website">
            <Input value={draft.website} onChange={(e) => field("website", e.target.value)} />
          </Row>
          <Row label="Location">
            <Input value={draft.location} onChange={(e) => field("location", e.target.value)} />
          </Row>
          <Row label="Tags">
            <Input
              value={draft.tags}
              onChange={(e) => field("tags", e.target.value)}
              placeholder="comma, separated"
            />
          </Row>
        </Section>

        <Section title="Pipeline">
          <Row label="Last contacted">
            <Input
              type="date"
              value={draft.last_contacted}
              onChange={(e) => field("last_contacted", e.target.value)}
            />
          </Row>
          <Row label="Follow up">
            <Input
              type="date"
              value={draft.follow_up_date}
              onChange={(e) => field("follow_up_date", e.target.value)}
            />
          </Row>
          <Row label="Next steps">
            <Textarea
              value={draft.next_steps}
              onChange={(e) => field("next_steps", e.target.value)}
            />
          </Row>
          <Row label="Meeting status">
            <Input
              value={draft.meeting_status}
              onChange={(e) => field("meeting_status", e.target.value)}
            />
          </Row>
          <Row label="Meeting notes">
            <Textarea
              value={draft.meeting_notes}
              onChange={(e) => field("meeting_notes", e.target.value)}
            />
          </Row>
          <Row label="Notes">
            <Textarea value={draft.notes} onChange={(e) => field("notes", e.target.value)} />
          </Row>
        </Section>

        <Section title={`Meetings (${investorMeetings.length})`}>
          {investorMeetings.length === 0 ? (
            <div className="text-xs text-ink-500">
              {inv.email
                ? "No meetings found for this investor."
                : "Add an email above to auto-match meetings."}
            </div>
          ) : (
            <div className="space-y-3">
              {investorMeetings.map((m) => (
                <MeetingNoteCard
                  key={m.id}
                  meeting={m}
                  investorId={inv.id}
                  initial={noteByEvent.get(m.id)}
                  onSave={onSaveMeetingNote}
                />
              ))}
            </div>
          )}
        </Section>

        <Section title={`Intro paths (${investorIntros.length})`}>
          {investorIntros.length === 0 ? (
            <div className="text-xs text-ink-500">No connectors yet.</div>
          ) : (
            <div className="border rounded divide-y">
              {investorIntros.map((it) => (
                <div key={it.id} className="px-3 py-2 flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{it.connector_name}</div>
                    <div className="text-xs text-ink-500 truncate">
                      {it.connector_email}
                      {it.connector_company && <> · {it.connector_company}</>}
                    </div>
                  </div>
                  {it.relationship_strength && (
                    <Badge>{it.relationship_strength}</Badge>
                  )}
                  <Select
                    value={it.intro_status}
                    onChange={(e) =>
                      onPatchIntro(it.id, {
                        intro_status: e.target.value as IntroRelationship["intro_status"],
                        ...(e.target.value === "requested"
                          ? { intro_requested_at: new Date().toISOString().slice(0, 10) }
                          : {}),
                        ...(e.target.value === "completed"
                          ? { intro_completed_at: new Date().toISOString().slice(0, 10) }
                          : {}),
                      })
                    }
                  >
                    <option value="">—</option>
                    <option value="offered">Offered</option>
                    <option value="requested">Requested</option>
                    <option value="sent">Sent</option>
                    <option value="completed">Completed</option>
                    <option value="declined">Declined</option>
                  </Select>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </Drawer>
  );
}

function MeetingNoteCard({
  meeting,
  investorId,
  initial,
  onSave,
}: {
  meeting: Meeting;
  investorId: string;
  initial: MeetingNote | undefined;
  onSave: (note: MeetingNote) => Promise<void>;
}) {
  const [granola, setGranola] = React.useState(initial?.granola_url ?? "");
  const [notes, setNotes] = React.useState(initial?.notes ?? "");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setGranola(initial?.granola_url ?? "");
    setNotes(initial?.notes ?? "");
  }, [initial?.event_id, initial?.granola_url, initial?.notes]);

  const dirty =
    (initial?.granola_url ?? "") !== granola || (initial?.notes ?? "") !== notes;

  const dt = new Date(meeting.start);
  const when = isNaN(dt.getTime())
    ? meeting.start
    : dt.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });

  async function save() {
    setBusy(true);
    try {
      await onSave({
        id: initial?.id ?? "",
        event_id: meeting.id,
        investor_id: investorId,
        event_title: meeting.title,
        event_start: meeting.start,
        granola_url: granola.trim(),
        notes,
        updated_at: "",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border rounded p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">
            {meeting.notes_url ? (
              <a
                href={meeting.notes_url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {meeting.title}
              </a>
            ) : (
              meeting.title
            )}
          </div>
          <div className="text-[11px] text-ink-500 mt-0.5">
            {when}
            {meeting.calendar && <> · {meeting.calendar}</>}
          </div>
        </div>
      </div>
      <div className="mt-2 space-y-2">
        <Input
          placeholder="Granola link (https://granola.so/…)"
          value={granola}
          onChange={(e) => setGranola(e.target.value)}
        />
        <Textarea
          placeholder="Notes…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="flex justify-end">
          <Button size="sm" disabled={!dirty || busy} onClick={save}>
            {busy ? "Saving…" : dirty ? "Save" : "Saved"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-500 mb-2">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 items-start">
      <div className="text-xs text-ink-600 pt-1.5">{label}</div>
      <div className="col-span-2">{children}</div>
    </div>
  );
}
