"use client";
import * as React from "react";
import { Meeting } from "@/lib/calendar";
import { Badge } from "@/components/ui/badge";

type ZoneId = "ist" | "pst" | "et" | "london" | "local";

const ZONES: { id: ZoneId; label: string; tz: string }[] = [
  { id: "local", label: "Local", tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
  { id: "ist", label: "IST", tz: "Asia/Kolkata" },
  { id: "pst", label: "PT", tz: "America/Los_Angeles" },
  { id: "et", label: "ET", tz: "America/New_York" },
  { id: "london", label: "London", tz: "Europe/London" },
];

const ZONE_KEY = "oe_meetings_zone_v1";

function fmtTime(iso: string, tz: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  }).format(d);
}

function fmtDayKey(iso: string, tz: string) {
  // Group meetings by the calendar day in the *displayed* timezone.
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: tz,
  }).format(d);
}

function fmtDayLabel(iso: string, tz: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: tz,
  }).format(d);
}

export function MeetingsClient({ meetings }: { meetings: Meeting[] }) {
  const [zoneId, setZoneId] = React.useState<ZoneId>("local");
  const [showAllZones, setShowAllZones] = React.useState(false);

  React.useEffect(() => {
    const saved = localStorage.getItem(ZONE_KEY) as ZoneId | null;
    if (saved && ZONES.some((z) => z.id === saved)) setZoneId(saved);
  }, []);

  React.useEffect(() => {
    localStorage.setItem(ZONE_KEY, zoneId);
  }, [zoneId]);

  const zone = ZONES.find((z) => z.id === zoneId) ?? ZONES[0];

  // Group by day in the chosen timezone
  const groups = new Map<string, { label: string; items: Meeting[] }>();
  for (const m of meetings) {
    const key = fmtDayKey(m.start, zone.tz);
    if (!groups.has(key)) {
      groups.set(key, { label: fmtDayLabel(m.start, zone.tz), items: [] });
    }
    groups.get(key)!.items.push(m);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-1 border rounded p-0.5">
          {ZONES.map((z) => (
            <button
              key={z.id}
              onClick={() => setZoneId(z.id)}
              className={
                "h-7 px-2.5 rounded text-xs " +
                (zoneId === z.id
                  ? "bg-ink-950 text-white"
                  : "text-ink-700 hover:bg-ink-50")
              }
            >
              {z.label}
            </button>
          ))}
        </div>
        <label className="text-xs text-ink-600 inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={showAllZones}
            onChange={(e) => setShowAllZones(e.target.checked)}
            className="accent-ink-950"
          />
          Show all timezones
        </label>
      </div>

      {groups.size === 0 ? (
        <div className="text-sm text-ink-500">No upcoming external meetings.</div>
      ) : (
        <div className="space-y-8">
          {[...groups.values()].map((g) => (
            <section key={g.label}>
              <div className="text-[11px] uppercase tracking-wide text-ink-500 mb-2">
                {g.label}
              </div>
              <div className="border rounded divide-y">
                {g.items.map((m) => (
                  <MeetingRow
                    key={m.id}
                    meeting={m}
                    zone={zone}
                    showAllZones={showAllZones}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function MeetingRow({
  meeting: m,
  zone,
  showAllZones,
}: {
  meeting: Meeting;
  zone: { id: ZoneId; label: string; tz: string };
  showAllZones: boolean;
}) {
  const otherZones = ZONES.filter((z) => z.id !== zone.id && z.id !== "local");
  return (
    <div className="px-3 py-2.5">
      <div className="grid grid-cols-12 items-start gap-2">
        <div className="col-span-2 text-xs text-ink-700 tabular-nums">
          {fmtTime(m.start, zone.tz)}
          {m.end && ` – ${fmtTime(m.end, zone.tz)}`}
        </div>
        <div className="col-span-7 min-w-0">
          <div className="text-sm font-medium truncate">
            {m.notes_url ? (
              <a
                href={m.notes_url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {m.title}
              </a>
            ) : (
              m.title
            )}
          </div>
          {m.attendees && (
            <div className="text-xs text-ink-500 truncate">{m.attendees}</div>
          )}
        </div>
        <div className="col-span-2 flex flex-wrap gap-1 justify-end">
          {m.calendar.split(",").map((c) => (
            <Badge key={c.trim()}>{c.trim()}</Badge>
          ))}
        </div>
        <div className="col-span-1 text-right text-xs text-ink-500 truncate">
          {m.type}
        </div>
      </div>
      {showAllZones && (
        <div className="mt-1.5 ml-[16.6667%] flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink-500 tabular-nums">
          {otherZones.map((z) => (
            <span key={z.id}>
              <span className="text-ink-400">{z.label}</span> {fmtTime(m.start, z.tz)}
              {m.end && `–${fmtTime(m.end, z.tz)}`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
