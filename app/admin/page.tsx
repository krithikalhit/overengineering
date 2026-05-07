import { listInvestors, listIntros, listMeetingNotes } from "@/lib/sheets";
import { listMeetings, Meeting } from "@/lib/calendar";
import { TopNav } from "@/components/shared/nav";
import { AdminClient } from "./admin-client";
import { MeetingNote } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPage() {
  const [investors, intros, meetingNotes, meetings] = await Promise.all([
    listInvestors(),
    listIntros(),
    listMeetingNotes().catch((): MeetingNote[] => []),
    fetchMeetingsForLookup().catch((): Meeting[] => []),
  ]);
  return (
    <>
      <TopNav active="admin" showAdmin />
      <AdminClient
        initialInvestors={investors}
        initialIntros={intros}
        initialMeetingNotes={meetingNotes}
        meetings={meetings}
      />
    </>
  );
}

async function fetchMeetingsForLookup(): Promise<Meeting[]> {
  // Window: past 60 days .. future 90 days, so the drawer can show recent + upcoming.
  const from = new Date();
  from.setDate(from.getDate() - 60);
  const to = new Date();
  to.setDate(to.getDate() + 90);
  return listMeetings({ from, to });
}
