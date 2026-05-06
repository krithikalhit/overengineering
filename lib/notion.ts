import { Client } from "@notionhq/client";

export type Meeting = {
  id: string;
  title: string;
  start: string; // ISO
  end: string | null;
  type: string;
  attendees: string;
  status: string;
  notes_url: string;
};

let cached: Client | null = null;
function client(): Client {
  if (cached) return cached;
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("Missing NOTION_TOKEN");
  cached = new Client({ auth: token });
  return cached;
}

function plainText(rich: unknown): string {
  if (!Array.isArray(rich)) return "";
  return rich
    .map((r: { plain_text?: string }) => r.plain_text ?? "")
    .join("")
    .trim();
}

function pickProp<T = unknown>(props: Record<string, unknown>, names: string[]): T | undefined {
  for (const n of names) {
    if (props[n] !== undefined) return props[n] as T;
    const lc = Object.keys(props).find((k) => k.toLowerCase() === n.toLowerCase());
    if (lc) return props[lc] as T;
  }
  return undefined;
}

type NotionDateProp = { date: { start: string; end: string | null } | null };
type NotionTitleProp = { title: unknown };
type NotionRichTextProp = { rich_text: unknown };
type NotionSelectProp = { select: { name: string } | null };
type NotionStatusProp = { status: { name: string } | null };
type NotionPeopleProp = { people: { name?: string }[] };
type NotionUrlProp = { url: string | null };

export async function listMeetings(opts?: { from?: Date; to?: Date }): Promise<Meeting[]> {
  const dbId = process.env.NOTION_CALENDAR_DB_ID;
  if (!dbId) throw new Error("Missing NOTION_CALENDAR_DB_ID");

  const dateProp = process.env.NOTION_DATE_PROPERTY ?? "Date";

  const filter: Record<string, unknown> = {};
  if (opts?.from || opts?.to) {
    const and: unknown[] = [];
    if (opts?.from) and.push({ property: dateProp, date: { on_or_after: opts.from.toISOString() } });
    if (opts?.to) and.push({ property: dateProp, date: { on_or_before: opts.to.toISOString() } });
    filter.and = and;
  }

  const res = await client().databases.query({
    database_id: dbId,
    sorts: [{ property: dateProp, direction: "ascending" }],
    filter: Object.keys(filter).length ? (filter as never) : undefined,
    page_size: 100,
  });

  const out: Meeting[] = [];
  for (const page of res.results) {
    if (!("properties" in page)) continue;
    const props = page.properties as Record<string, unknown>;

    const dateP = pickProp<NotionDateProp>(props, [dateProp, "Date", "When"]);
    if (!dateP?.date?.start) continue;

    const titleP = pickProp<NotionTitleProp>(props, ["Name", "Title", "Meeting"]);
    const typeP = pickProp<NotionSelectProp>(props, ["Type", "Category"]);
    const statusP = pickProp<NotionStatusProp | NotionSelectProp>(props, ["Status"]);
    const peopleP = pickProp<NotionPeopleProp>(props, ["Attendees", "People", "With"]);
    const notesP = pickProp<NotionRichTextProp>(props, ["Notes", "Note"]);
    const urlP = pickProp<NotionUrlProp>(props, ["URL", "Link"]);

    const title = titleP ? plainText(titleP.title) : "(untitled)";
    const status =
      statusP && "status" in statusP && statusP.status
        ? statusP.status.name
        : statusP && "select" in statusP && (statusP as NotionSelectProp).select
          ? (statusP as NotionSelectProp).select!.name
          : "";

    out.push({
      id: page.id,
      title: title || "(untitled)",
      start: dateP.date.start,
      end: dateP.date.end,
      type: typeP?.select?.name ?? "",
      attendees: (peopleP?.people ?? []).map((p) => p.name ?? "").filter(Boolean).join(", "),
      status,
      notes_url: urlP?.url ?? (notesP ? plainText(notesP.rich_text) : ""),
    });
  }
  return out;
}
