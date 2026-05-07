import { listMeetings, Meeting } from "@/lib/calendar";
import { TopNav } from "@/components/shared/nav";
import { MeetingsClient } from "./meetings-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
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

  return (
    <>
      <TopNav active="meetings" showAdmin />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Meetings</h1>
          <p className="mt-1 text-xs text-ink-500">
            External meetings across the team for the next 14 days.
          </p>
        </div>

        {error ? (
          <div className="rounded border bg-ink-50 p-4 text-sm text-ink-600">
            Could not load meetings ({error}). Check that the Google Calendar API
            is enabled and each calendar is shared with the service account.
          </div>
        ) : (
          <MeetingsClient meetings={meetings} />
        )}
      </main>
    </>
  );
}
