import { google, calendar_v3 } from "googleapis";
import { JWT } from "google-auth-library";

export type Meeting = {
  id: string;
  title: string;
  start: string; // ISO
  end: string | null;
  type: string;
  attendees: string;
  status: string;
  notes_url: string;
  calendar: string; // short label of which calendar this came from
};

let cached: calendar_v3.Calendar | null = null;

function client(): calendar_v3.Calendar {
  if (cached) return cached;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY");
  }
  const auth = new JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  });
  cached = google.calendar({ version: "v3", auth });
  return cached;
}

function calendarIds(): string[] {
  const raw = process.env.GOOGLE_CALENDAR_ID ?? "primary";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function shortLabel(id: string): string {
  const at = id.indexOf("@");
  if (at < 0) return id;
  return id.slice(0, at);
}

function internalDomain(): string | null {
  const explicit = process.env.INTERNAL_DOMAIN;
  if (explicit) return explicit.toLowerCase();
  const ids = calendarIds();
  for (const id of ids) {
    const at = id.indexOf("@");
    if (at >= 0) return id.slice(at + 1).toLowerCase();
  }
  return null;
}

function isExternal(emails: string[], internal: string | null): boolean {
  if (!internal) return emails.length > 0; // unknown internal domain → trust attendee count
  return emails.some((e) => {
    const at = e.toLowerCase().lastIndexOf("@");
    if (at < 0) return false;
    return e.slice(at + 1).toLowerCase() !== internal;
  });
}

const DEFAULT_EXCLUDE_KEYWORDS = [
  "standup",
  "epd",
  "team sync",
  "internal sync",
  "state of affairs",
  "viable",
  "carta",
  "la marzocco",
  "opendaw",
  "open daw",
  "rippling",
  "pay check",
  "paycheck",
];

function excludeKeywords(): string[] {
  const env = process.env.MEETINGS_EXCLUDE_KEYWORDS;
  if (!env) return DEFAULT_EXCLUDE_KEYWORDS;
  return env
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isExcludedByTitle(title: string, keywords: string[]): boolean {
  const t = title.toLowerCase();
  return keywords.some((k) => t.includes(k));
}

export async function listMeetings(opts?: { from?: Date; to?: Date }): Promise<Meeting[]> {
  const timeMin = (opts?.from ?? new Date()).toISOString();
  const to = opts?.to ?? (() => {
    const d = new Date(opts?.from ?? new Date());
    d.setDate(d.getDate() + 14);
    return d;
  })();
  const timeMax = to.toISOString();

  const ids = calendarIds();
  const internal = internalDomain();
  const keywords = excludeKeywords();

  const results = await Promise.allSettled(
    ids.map((id) =>
      client().events.list({
        calendarId: id,
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 250,
      }),
    ),
  );

  const seenUid = new Map<string, Meeting>(); // iCalUID → meeting (with merged calendar list)
  const ordered: Meeting[] = [];

  for (let i = 0; i < ids.length; i++) {
    const r = results[i];
    if (r.status !== "fulfilled") {
      console.error(`[calendar] failed for ${ids[i]}:`, (r.reason as Error)?.message);
      continue;
    }
    const calLabel = shortLabel(ids[i]);
    const items = r.value.data.items ?? [];
    for (const ev of items) {
      if (ev.status === "cancelled") continue;
      const start = ev.start?.dateTime ?? ev.start?.date;
      if (!start) continue;
      const end = ev.end?.dateTime ?? ev.end?.date ?? null;

      const title = ev.summary ?? "(untitled)";
      if (isExcludedByTitle(title, keywords)) continue;

      const realAttendees = (ev.attendees ?? []).filter(
        (a) => !a.self && !a.resource,
      );
      const attendeeEmails = realAttendees.map((a) => a.email ?? "").filter(Boolean);
      if (!isExternal(attendeeEmails, internal)) continue;

      const attendees = realAttendees
        .map((a) => a.displayName || a.email || "")
        .filter(Boolean)
        .join(", ");

      let type = "";
      if (ev.hangoutLink || ev.conferenceData) type = "video";
      else if (ev.location) type = "in-person";

      let notesUrl = "";
      if (ev.hangoutLink) notesUrl = ev.hangoutLink;
      else if (ev.htmlLink) notesUrl = ev.htmlLink;

      const uid = ev.iCalUID ?? `${calLabel}:${ev.id}`;
      const existing = seenUid.get(uid);
      if (existing) {
        // Same event in two calendars (e.g. Anurag and Deo both invited).
        // Merge calendar labels so the UI shows everyone whose calendar has it.
        const labels = new Set(existing.calendar.split(",").map((s) => s.trim()));
        labels.add(calLabel);
        existing.calendar = [...labels].join(", ");
        continue;
      }

      const meeting: Meeting = {
        id: ev.id ?? cryptoRandom(),
        title,
        start,
        end,
        type,
        attendees,
        status: ev.status ?? "",
        notes_url: notesUrl,
        calendar: calLabel,
      };
      seenUid.set(uid, meeting);
      ordered.push(meeting);
    }
  }

  ordered.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return ordered;
}

function cryptoRandom() {
  return Math.random().toString(36).slice(2);
}
