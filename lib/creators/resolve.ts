import { Platform } from "./types";

// Best-effort metadata for a pasted video link: platform, title, thumbnail, creator, followers.
// YouTube + TikTok have public oEmbed endpoints. Instagram sits behind a login wall, so for
// Instagram we only parse the URL and let the user fill the rest in (or paste a thumbnail).

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type Resolved = {
  url: string;
  platform: Platform;
  orientation: "vertical" | "landscape";
  title: string;
  thumbnail_url: string;
  creator_handle: string;
  creator_name: string;
  creator_url: string;
  followers: number | null;
  /** Thumbnail host is on the proxy allowlist, so the client can cache it as a data URL. */
  thumbnail_proxyable: boolean;
  warnings: string[];
};

export type ParsedLink = {
  platform: Platform;
  orientation: "vertical" | "landscape";
  videoId: string;
  handle: string; // only TikTok URLs carry the handle
  canonical: string;
};

export function parseVideoUrl(raw: string): ParsedLink | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  const parts = u.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") {
    const id = parts[0] ?? "";
    return id
      ? { platform: "youtube", orientation: "landscape", videoId: id, handle: "", canonical: `https://www.youtube.com/watch?v=${id}` }
      : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (parts[0] === "shorts" && parts[1]) {
      return { platform: "youtube", orientation: "vertical", videoId: parts[1], handle: "", canonical: `https://www.youtube.com/shorts/${parts[1]}` };
    }
    const v = u.searchParams.get("v");
    if (v) return { platform: "youtube", orientation: "landscape", videoId: v, handle: "", canonical: `https://www.youtube.com/watch?v=${v}` };
    if ((parts[0] === "embed" || parts[0] === "v" || parts[0] === "live") && parts[1]) {
      return { platform: "youtube", orientation: "landscape", videoId: parts[1], handle: "", canonical: `https://www.youtube.com/watch?v=${parts[1]}` };
    }
    return null;
  }
  if (host === "instagram.com") {
    const i = parts.findIndex((p) => p === "reel" || p === "reels" || p === "p" || p === "tv");
    if (i >= 0 && parts[i + 1]) {
      const kind = parts[i] === "p" ? "p" : parts[i] === "tv" ? "tv" : "reel";
      const code = parts[i + 1];
      // instagram.com/<handle>/reel/<code> carries the handle
      const handle = i === 1 ? parts[0] : "";
      return { platform: "instagram", orientation: "vertical", videoId: code, handle, canonical: `https://www.instagram.com/${kind}/${code}/` };
    }
    return null;
  }
  if (host === "tiktok.com" || host === "vm.tiktok.com" || host === "vt.tiktok.com") {
    const at = parts.find((p) => p.startsWith("@"));
    const vi = parts.indexOf("video");
    if (at && vi >= 0 && parts[vi + 1]) {
      const handle = at.slice(1);
      return { platform: "tiktok", orientation: "vertical", videoId: parts[vi + 1], handle, canonical: `https://www.tiktok.com/@${handle}/video/${parts[vi + 1]}` };
    }
    // short links (vm.tiktok.com/xxx, tiktok.com/t/xxx) — resolved by following the redirect
    return { platform: "tiktok", orientation: "vertical", videoId: parts[parts.length - 1] ?? "", handle: "", canonical: u.toString() };
  }
  return null;
}

async function get(url: string, ms = 6000, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(url, {
    headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9", ...headers },
    signal: AbortSignal.timeout(ms),
    redirect: "follow",
    cache: "no-store",
  });
}

/** "30.7 million subscribers" | "1.2M" | "12,345" -> number */
export function parseCount(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.replace(/,/g, "").match(/([\d.]+)\s*(thousand|million|billion|k|m|b)?/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] ?? "").toLowerCase();
  const mult = unit.startsWith("b") ? 1e9 : unit.startsWith("m") ? 1e6 : unit.startsWith("k") || unit === "thousand" ? 1e3 : 1;
  return Math.round(n * mult);
}

export const THUMB_HOST_ALLOWLIST =
  /(^|\.)(ytimg\.com|ggpht\.com|googleusercontent\.com|tiktokcdn\.com|tiktokcdn-us\.com|tiktokcdn-eu\.com|tiktokcdn-in\.com|cdninstagram\.com|fbcdn\.net)$/i;

export function isProxyableThumb(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && THUMB_HOST_ALLOWLIST.test(u.hostname);
  } catch {
    return false;
  }
}

// ---------- followers ----------

export async function fetchYoutubeSubscribers(channelUrl: string): Promise<number | null> {
  try {
    const res = await get(channelUrl, 7000, { cookie: "CONSENT=YES+1" });
    const html = await res.text();
    const m =
      html.match(/"subscriberCountText":\{"accessibility":\{"accessibilityData":\{"label":"([^"]+)"/) ??
      html.match(/"subscriberCountText":\{"simpleText":"([^"]+)"/) ??
      html.match(/([\d.,]+[KMB]?) subscribers/);
    return parseCount(m?.[1]);
  } catch {
    return null;
  }
}

export async function fetchTiktokFollowers(handle: string): Promise<number | null> {
  try {
    const res = await get(`https://www.tiktok.com/@${encodeURIComponent(handle)}`, 7000);
    const html = await res.text();
    const m = html.match(/"followerCount":(\d+)/);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

export async function fetchInstagramFollowers(handle: string): Promise<number | null> {
  // Instagram serves a login wall to anything that isn't a logged-in browser, so this
  // almost always returns null and the follower count is typed in by hand. The sanctioned
  // route is the Instagram Graph API (business_discovery) via a Meta developer app.
  try {
    const res = await get(`https://www.instagram.com/${encodeURIComponent(handle)}/`, 7000);
    const html = await res.text();
    const m = html.match(/content="([\d.,]+[KM]?) Followers/i);
    return parseCount(m?.[1]);
  } catch {
    return null;
  }
}

export async function fetchFollowers(platform: Platform, handle: string, profileUrl: string): Promise<number | null> {
  if (platform === "youtube") return profileUrl ? fetchYoutubeSubscribers(profileUrl) : null;
  if (platform === "tiktok") return handle ? fetchTiktokFollowers(handle) : null;
  if (platform === "instagram") return handle ? fetchInstagramFollowers(handle) : null;
  return null;
}

// ---------- video metadata ----------

type OEmbed = {
  title?: string;
  author_name?: string;
  author_url?: string;
  author_unique_id?: string;
  thumbnail_url?: string;
};

async function oembed(endpoint: string): Promise<OEmbed | null> {
  try {
    const res = await get(endpoint, 7000);
    if (!res.ok) return null;
    return (await res.json()) as OEmbed;
  } catch {
    return null;
  }
}

export async function resolveVideo(raw: string, opts: { followers?: boolean } = {}): Promise<Resolved | null> {
  const parsed = parseVideoUrl(raw);
  if (!parsed) return null;
  const out: Resolved = {
    url: parsed.canonical,
    platform: parsed.platform,
    orientation: parsed.orientation,
    title: "",
    thumbnail_url: "",
    creator_handle: parsed.handle,
    creator_name: "",
    creator_url: parsed.handle ? profileUrl(parsed.platform, parsed.handle) : "",
    followers: null,
    thumbnail_proxyable: false,
    warnings: [],
  };

  if (parsed.platform === "youtube") {
    const o = await oembed(`https://www.youtube.com/oembed?url=${encodeURIComponent(parsed.canonical)}&format=json`);
    if (o) {
      out.title = o.title ?? "";
      out.creator_name = o.author_name ?? "";
      out.creator_url = o.author_url ?? "";
      const h = o.author_url?.match(/youtube\.com\/@([^/?]+)/)?.[1];
      if (h) out.creator_handle = decodeURIComponent(h);
      // Shorts get a vertical "oar2" frame when YouTube has rendered one; else the standard frame.
      const base = `https://i.ytimg.com/vi/${parsed.videoId}`;
      out.thumbnail_url = o.thumbnail_url || `${base}/hqdefault.jpg`;
      if (parsed.orientation === "vertical") {
        const ok = await get(`${base}/oar2.jpg`, 4000).then((r) => r.ok).catch(() => false);
        if (ok) out.thumbnail_url = `${base}/oar2.jpg`;
      } else {
        const ok = await get(`${base}/maxresdefault.jpg`, 4000).then((r) => r.ok).catch(() => false);
        if (ok) out.thumbnail_url = `${base}/maxresdefault.jpg`;
      }
    } else {
      out.warnings.push("YouTube didn't return details for this link (private or removed?).");
      out.thumbnail_url = `https://i.ytimg.com/vi/${parsed.videoId}/hqdefault.jpg`;
    }
  } else if (parsed.platform === "tiktok") {
    const o = await oembed(`https://www.tiktok.com/oembed?url=${encodeURIComponent(parsed.canonical)}`);
    if (o) {
      out.title = o.title ?? "";
      out.creator_name = o.author_name ?? "";
      if (o.author_unique_id) out.creator_handle = o.author_unique_id;
      out.creator_url = o.author_url || (out.creator_handle ? profileUrl("tiktok", out.creator_handle) : "");
      out.thumbnail_url = o.thumbnail_url ?? "";
      if (out.creator_handle) out.url = `https://www.tiktok.com/@${out.creator_handle}/video/${parsed.videoId}`;
    } else {
      out.warnings.push("TikTok didn't return details for this link. Fill the creator and thumbnail in by hand.");
    }
  } else if (parsed.platform === "instagram") {
    // Instagram hides reels behind a login wall. Try the public embed page (rarely works),
    // otherwise the user adds the thumbnail and handle on the card.
    try {
      const res = await get(`${parsed.canonical}embed/captioned/`, 6000);
      const html = await res.text();
      const img = html.match(/class="EmbeddedMediaImage"[^>]*src="([^"]+)"/)?.[1];
      const user = html.match(/class="UsernameText"[^>]*>([^<]+)</)?.[1];
      if (img) out.thumbnail_url = img.replace(/&amp;/g, "&");
      if (user && !out.creator_handle) out.creator_handle = user.trim().replace(/^@/, "");
    } catch {
      /* fall through */
    }
    if (!out.thumbnail_url) out.warnings.push("Instagram hides reel details behind a login. Add the thumbnail and handle on the card.");
    if (out.creator_handle) out.creator_url = profileUrl("instagram", out.creator_handle);
  }

  out.thumbnail_proxyable = isProxyableThumb(out.thumbnail_url);
  if (opts.followers !== false && (out.creator_handle || out.creator_url)) {
    out.followers = await fetchFollowers(out.platform, out.creator_handle, out.creator_url);
  }
  return out;
}

export function profileUrl(platform: Platform, handle: string): string {
  const h = handle.replace(/^@/, "");
  if (!h) return "";
  if (platform === "instagram") return `https://www.instagram.com/${h}/`;
  if (platform === "tiktok") return `https://www.tiktok.com/@${h}`;
  if (platform === "youtube") return `https://www.youtube.com/@${h}`;
  return "";
}
