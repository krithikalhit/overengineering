// Creator program sign-up tracker (/creators). One row per posted video.
// Each video carries a UTM-tagged link; PostHog attributes pageviews + signups to it.

export const PROGRAM = {
  /** Paid-ads CPA the creator program is trying to beat. */
  cpaTargetUsd: 7.55,
  /** Landing page the tracked links point at. */
  defaultLandingUrl: "https://www.riffle.studio/",
  utmMedium: "creator",
} as const;

export type Platform = "instagram" | "youtube" | "tiktok" | "other";
export type Owner = "ivan" | "krithika" | "";

export const OWNERS: { id: Exclude<Owner, "">; label: string }[] = [
  { id: "ivan", label: "Ivan" },
  { id: "krithika", label: "Krithika" },
];

export type CreatorVideo = {
  id: string;
  url: string; // the video on the platform
  platform: Platform;
  /** "vertical" (reel / short / tiktok) or "landscape" (regular YouTube). Drives the card aspect. */
  orientation: string;
  title: string;
  thumbnail_url: string; // http(s) URL or a small data: URL
  creator_handle: string; // without @
  creator_name: string;
  creator_url: string; // profile on the platform
  followers: string; // integer as string; "" = unknown
  followers_checked_at: string; // ISO; "" if entered by hand
  price_usd: string;
  owner: Owner; // who brought the creator in
  utm_source: string;
  utm_campaign: string;
  utm_content: string;
  tracked_url: string; // the full link handed to the creator
  posted_at: string; // ISO date
  notes: string;
  created_at: string;
  updated_at: string;
};

export const VIDEO_HEADERS: (keyof CreatorVideo)[] = [
  "id",
  "url",
  "platform",
  "orientation",
  "title",
  "thumbnail_url",
  "creator_handle",
  "creator_name",
  "creator_url",
  "followers",
  "followers_checked_at",
  "price_usd",
  "owner",
  "utm_source",
  "utm_campaign",
  "utm_content",
  "tracked_url",
  "posted_at",
  "notes",
  "created_at",
  "updated_at",
];

/** What PostHog knows about one (utm_campaign, utm_content) pair. */
export type UtmStat = {
  campaign: string;
  content: string;
  pageviews: number;
  visitors: number;
  signups: number;
};

/** Stats rolled up for one video. */
export type VideoStats = {
  pageviews: number;
  visitors: number;
  signups: number;
};

export function emptyVideo(): CreatorVideo {
  const o = {} as CreatorVideo;
  for (const h of VIDEO_HEADERS) o[h] = "" as never;
  return o;
}

/** utm_campaign / utm_content are matched case-insensitively (PostHog values are lowercased). */
export function normKey(s: string): string {
  return (s ?? "").trim().toLowerCase();
}

export function statsForVideo(v: CreatorVideo, rows: UtmStat[]): VideoStats {
  const camp = normKey(v.utm_campaign);
  const cont = normKey(v.utm_content);
  const out: VideoStats = { pageviews: 0, visitors: 0, signups: 0 };
  if (!camp) return out;
  for (const r of rows) {
    if (r.campaign !== camp) continue;
    if (cont && r.content !== cont) continue;
    out.pageviews += r.pageviews;
    out.visitors += r.visitors;
    out.signups += r.signups;
  }
  return out;
}

export function slugify(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function buildTrackedUrl(base: string, utm: { source: string; campaign: string; content: string }): string {
  let u: URL;
  try {
    u = new URL(base || PROGRAM.defaultLandingUrl);
  } catch {
    u = new URL(PROGRAM.defaultLandingUrl);
  }
  if (utm.source) u.searchParams.set("utm_source", utm.source);
  u.searchParams.set("utm_medium", PROGRAM.utmMedium);
  if (utm.campaign) u.searchParams.set("utm_campaign", utm.campaign);
  if (utm.content) u.searchParams.set("utm_content", utm.content);
  return u.toString();
}

/** Pull utm_* out of a pasted tracked link. */
export function parseTrackedUrl(s: string): { source: string; campaign: string; content: string } | null {
  try {
    const u = new URL(s);
    const campaign = u.searchParams.get("utm_campaign") ?? "";
    if (!campaign) return null;
    return {
      source: u.searchParams.get("utm_source") ?? "",
      campaign,
      content: u.searchParams.get("utm_content") ?? "",
    };
  } catch {
    return null;
  }
}
