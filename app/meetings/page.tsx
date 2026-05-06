import { listMeetings, Meeting } from "@/lib/notion";
import { TopNav } from "@/components/shared/nav";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function fmtDay(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export default async function MeetingsPage() {
  let meetings: Meeting[] = [];
  let error: string | null = null;
  try {
    const from = startOfDay(new Date());
    const to = new Date(from);
    to.setDate(to.getDate() + 14);
    meetings = await listMeetings({ from, to });
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load";
  }

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Group by day
  const groups = new Map<string, Meeting[]>();
  for (const m of meetings) {
    const key = fmtDay(m.start);
    const arr = groups.get(key) ?? [];
    arr.push(m);
    groups.set(key, arr);
  }

  return (
    <>
      <TopNav active="meetings" showAdmin />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Meetings</h1>
            <p className="mt-1 text-xs text-ink-500">Times in {tz}</p>
          </div>
        </div>

        {error ? (
          <div className="rounded border bg-ink-50 p-4 text-sm text-ink-600">
            Could not load meetings ({error}). Check Notion env vars.
          </div>
        ) : groups.size === 0 ? (
          <div className="text-sm text-ink-500">No upcoming meetings.</div>
        ) : (
          <div className="space-y-8">
            {[...groups.entries()].map(([day, items]) => (
              <section key={day}>
                <div className="text-[11px] uppercase tracking-wide text-ink-500 mb-2">
                  {day}
                </div>
                <div className="border rounded divide-y">
                  {items.map((m) => (
                    <div key={m.id} className="grid grid-cols-12 px-3 h-12 items-center">
                      <div className="col-span-2 text-xs text-ink-700 tabular-nums">
                        {fmtTime(m.start)}
                        {m.end && ` – ${fmtTime(m.end)}`}
                      </div>
                      <div className="col-span-6 truncate">
                        <div className="text-sm font-medium truncate">{m.title}</div>
                        {m.attendees && (
                          <div className="text-xs text-ink-500 truncate">{m.attendees}</div>
                        )}
                      </div>
                      <div className="col-span-2 text-xs text-ink-600 truncate">{m.type}</div>
                      <div className="col-span-2 text-xs text-ink-500 truncate text-right">
                        {m.status}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
