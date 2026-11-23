import { UtmStat } from "./types";

// Pageviews + signups per (utm_campaign, utm_content), read from PostHog with a personal
// API key (query:read scope). `user_signed_up` carries event-level utm_* when the visitor
// landed with them; signups that only have person-level $initial_utm_* are added separately
// so nothing is double counted.

const SIGNUP_EVENT = "user_signed_up";

function cfg() {
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  const project = process.env.POSTHOG_PROJECT_ID;
  const host = (process.env.POSTHOG_HOST || "https://us.posthog.com").replace(/\/$/, "");
  if (!key || !project) return null;
  return { key, project, host };
}

export function posthogConfigured(): boolean {
  return cfg() !== null;
}

async function hogql(query: string): Promise<unknown[][]> {
  const c = cfg();
  if (!c) throw new Error("PostHog not configured (POSTHOG_PERSONAL_API_KEY, POSTHOG_PROJECT_ID)");
  const res = await fetch(`${c.host}/api/projects/${c.project}/query/`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${c.key}` },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    signal: AbortSignal.timeout(25_000),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PostHog ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { results?: unknown[][] };
  return json.results ?? [];
}

function sqlDate(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * @param since  earliest timestamp to scan (the oldest video's posted/created date, minus a day).
 * @param campaigns  utm_campaign values to look at (lowercased). Empty = nothing to query.
 */
export async function fetchUtmStats(since: Date, campaigns: string[]): Promise<UtmStat[]> {
  const list = Array.from(new Set(campaigns.map((c) => c.trim().toLowerCase()).filter(Boolean)));
  if (list.length === 0) return [];
  const inList = list.map((c) => `'${c.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`).join(", ");
  const from = sqlDate(since);

  const eventLevel = `
    SELECT
      lower(coalesce(toString(properties.utm_campaign), '')) AS campaign,
      lower(coalesce(toString(properties.utm_content), '')) AS content,
      countIf(event = '$pageview') AS pageviews,
      uniqIf(person_id, event = '$pageview') AS visitors,
      uniqIf(person_id, event = '${SIGNUP_EVENT}') AS signups
    FROM events
    WHERE timestamp >= toDateTime('${from}')
      AND event IN ('$pageview', '${SIGNUP_EVENT}')
      AND lower(coalesce(toString(properties.utm_campaign), '')) IN (${inList})
    GROUP BY campaign, content
    LIMIT 500`;

  const personLevel = `
    SELECT
      lower(coalesce(toString(person.properties.$initial_utm_campaign), '')) AS campaign,
      lower(coalesce(toString(person.properties.$initial_utm_content), '')) AS content,
      uniq(person_id) AS signups
    FROM events
    WHERE timestamp >= toDateTime('${from}')
      AND event = '${SIGNUP_EVENT}'
      AND empty(coalesce(toString(properties.utm_campaign), ''))
      AND lower(coalesce(toString(person.properties.$initial_utm_campaign), '')) IN (${inList})
    GROUP BY campaign, content
    LIMIT 500`;

  const [a, b] = await Promise.all([hogql(eventLevel), hogql(personLevel)]);
  const map = new Map<string, UtmStat>();
  const keyOf = (c: string, k: string) => `${c}\u0000${k}`;
  for (const row of a) {
    const [campaign, content, pageviews, visitors, signups] = row as [string, string, number, number, number];
    map.set(keyOf(campaign, content), {
      campaign,
      content,
      pageviews: Number(pageviews) || 0,
      visitors: Number(visitors) || 0,
      signups: Number(signups) || 0,
    });
  }
  for (const row of b) {
    const [campaign, content, signups] = row as [string, string, number];
    const k = keyOf(campaign, content);
    const cur = map.get(k) ?? { campaign, content, pageviews: 0, visitors: 0, signups: 0 };
    cur.signups += Number(signups) || 0;
    map.set(k, cur);
  }
  return Array.from(map.values());
}
