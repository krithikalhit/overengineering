"use client";
import * as React from "react";
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Instagram,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
  Youtube,
} from "lucide-react";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  CreatorVideo,
  OWNERS,
  Owner,
  PROGRAM,
  Platform,
  UtmStat,
  buildTrackedUrl,
  emptyVideo,
  parseTrackedUrl,
  slugify,
  statsForVideo,
} from "@/lib/creators/types";

type Filter = "all" | Platform | "ivan" | "krithika";

type Resolved = {
  url: string;
  platform: Platform;
  orientation: "vertical" | "landscape";
  title: string;
  thumbnail_url: string;
  creator_handle: string;
  creator_name: string;
  creator_url: string;
  followers: number | null;
  thumbnail_proxyable: boolean;
  warnings: string[];
};

type Pending = { key: string; url: string; label: string };

const LAST_OWNER_KEY = "creators:lastOwner";
const STALE_FOLLOWERS_MS = 7 * 86400_000;

// ---------- helpers ----------

function fmtCount(n: number | string | null | undefined): string {
  const x = typeof n === "string" ? Number(n) : n;
  if (x == null || !Number.isFinite(x) || x <= 0) return "";
  if (x >= 1e6) return `${(x / 1e6).toFixed(x >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (x >= 1e3) return `${(x / 1e3).toFixed(x >= 1e5 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(Math.round(x));
}

function fmtMoney(n: number | string | null | undefined, digits = 0): string {
  const x = typeof n === "string" ? Number(n) : n;
  if (x == null || !Number.isFinite(x)) return "—";
  return `$${x.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function platformLabel(p: Platform): string {
  return p === "instagram" ? "Instagram" : p === "youtube" ? "YouTube" : p === "tiktok" ? "TikTok" : "Link";
}

function ownerLabel(o: Owner): string {
  return OWNERS.find((x) => x.id === o)?.label ?? "";
}

function ownerClass(o: Owner): string {
  if (o === "ivan") return "bg-amber-100 text-amber-900";
  if (o === "krithika") return "bg-violet-100 text-violet-900";
  return "bg-ink-100 text-ink-700";
}

function nextOwner(o: Owner): Owner {
  const order: Owner[] = [...OWNERS.map((x) => x.id), ""];
  return order[(order.indexOf(o) + 1) % order.length];
}

function readLastOwner(): Owner {
  try {
    const v = localStorage.getItem(LAST_OWNER_KEY);
    return OWNERS.some((o) => o.id === v) ? (v as Owner) : "";
  } catch {
    return "";
  }
}

function writeLastOwner(o: Owner) {
  try {
    if (o) localStorage.setItem(LAST_OWNER_KEY, o);
  } catch {
    /* ignore */
  }
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M16.5 3c.4 2.3 1.9 3.9 4.2 4.1v3.1c-1.6 0-3-.5-4.2-1.3v6.4c0 3.3-2.6 5.7-5.8 5.7S4.9 18.6 4.9 15.3c0-3.2 2.6-5.7 5.8-5.7.3 0 .6 0 .9.1v3.2c-.3-.1-.6-.2-.9-.2-1.4 0-2.6 1.1-2.6 2.6s1.2 2.6 2.6 2.6c1.5 0 2.7-1.1 2.7-2.6V3h3.1z" />
    </svg>
  );
}

function PlatformIcon({ p, className }: { p: Platform; className?: string }) {
  if (p === "instagram") return <Instagram className={className} />;
  if (p === "youtube") return <Youtube className={className} />;
  if (p === "tiktok") return <TikTokIcon className={className} />;
  return <Link2 className={className} />;
}

/** Shrink an image to a small JPEG data URL that fits in one sheet cell. */
async function shrinkToDataUrl(blob: Blob, maxChars = 45_000): Promise<string> {
  const bmp = await createImageBitmap(blob);
  let w = Math.min(480, bmp.width);
  let h = Math.round((bmp.height * w) / bmp.width);
  let q = 0.82;
  const canvas = document.createElement("canvas");
  for (let i = 0; i < 12; i++) {
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0, w, h);
    const out = canvas.toDataURL("image/jpeg", q);
    if (out.length <= maxChars || w < 160) return out;
    if (q > 0.5) q -= 0.12;
    else {
      w = Math.round(w * 0.8);
      h = Math.round(h * 0.8);
      q = 0.72;
    }
  }
  return canvas.toDataURL("image/jpeg", 0.5);
}

async function cacheThumb(url: string, proxyable: boolean): Promise<string> {
  // YouTube frames are stable URLs; everything else (TikTok, Instagram) expires, so keep a copy.
  if (!url) return url;
  try {
    if (/(^|\.)ytimg\.com$/i.test(new URL(url).hostname) || !proxyable) return url;
  } catch {
    return url;
  }
  try {
    const res = await fetch(`/api/creators/img?u=${encodeURIComponent(url)}`);
    if (!res.ok) return url;
    return await shrinkToDataUrl(await res.blob());
  } catch {
    return url;
  }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

function looksLikeVideoLink(s: string): boolean {
  return /instagram\.com|youtube\.com|youtu\.be|tiktok\.com/i.test(s);
}

// ---------- page ----------

export function CreatorsClient(props: { initial: CreatorVideo[]; posthogReady: boolean; instagramReady: boolean }) {
  return (
    <ToastProvider>
      <Feed {...props} />
    </ToastProvider>
  );
}

function Feed({ initial, posthogReady, instagramReady }: { initial: CreatorVideo[]; posthogReady: boolean; instagramReady: boolean }) {
  const toast = useToast();
  const [videos, setVideos] = React.useState<CreatorVideo[]>(initial);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [link, setLink] = React.useState("");
  const [pending, setPending] = React.useState<Pending[]>([]);
  const [editing, setEditing] = React.useState<CreatorVideo | null>(null);
  const [stats, setStats] = React.useState<UtmStat[]>([]);
  const [statsState, setStatsState] = React.useState<"idle" | "loading" | "ok" | "error">("idle");
  const [statsError, setStatsError] = React.useState("");
  const [fetchedAt, setFetchedAt] = React.useState<string>("");
  const [showSetup, setShowSetup] = React.useState(false);
  const videosRef = React.useRef(videos);
  videosRef.current = videos;

  const campaigns = React.useMemo(
    () => Array.from(new Set(videos.map((v) => v.utm_campaign.trim().toLowerCase()).filter(Boolean))).sort(),
    [videos],
  );
  const since = React.useMemo(() => {
    const dates = videos.map((v) => Date.parse(v.posted_at || v.created_at)).filter((n) => Number.isFinite(n));
    const min = dates.length ? Math.min(...dates) : Date.now() - 30 * 86400_000;
    return new Date(min - 86400_000).toISOString().slice(0, 10);
  }, [videos]);

  const loadStats = React.useCallback(async () => {
    if (!posthogReady || campaigns.length === 0) return;
    setStatsState((s) => (s === "ok" ? s : "loading"));
    try {
      const r = await api<{ rows: UtmStat[]; fetched_at?: string }>(
        `/api/creators/stats?campaigns=${encodeURIComponent(campaigns.join(","))}&since=${since}`,
      );
      setStats(r.rows);
      setFetchedAt(r.fetched_at ?? new Date().toISOString());
      setStatsState("ok");
      setStatsError("");
    } catch (e) {
      setStatsState("error");
      setStatsError(e instanceof Error ? e.message : "PostHog query failed");
    }
  }, [posthogReady, campaigns, since]);

  React.useEffect(() => {
    loadStats();
    const t = setInterval(loadStats, 60_000);
    return () => clearInterval(t);
  }, [loadStats]);

  function upsertLocal(v: CreatorVideo) {
    setVideos((prev) => {
      const i = prev.findIndex((x) => x.id === v.id);
      if (i < 0) return [v, ...prev];
      const next = prev.slice();
      next[i] = v;
      return next;
    });
  }

  const patch = React.useCallback(
    async (id: string, p: Partial<CreatorVideo>) => {
      const cur = videosRef.current.find((x) => x.id === id);
      if (cur) upsertLocal({ ...cur, ...p }); // optimistic
      try {
        const saved = await api<CreatorVideo>(`/api/creators/videos/${id}`, { method: "PATCH", body: JSON.stringify(p) });
        upsertLocal(saved);
        return saved;
      } catch (e) {
        if (cur) upsertLocal(cur);
        toast.push(e instanceof Error ? e.message : "Save failed");
        return null;
      }
    },
    [toast],
  );

  // Refresh follower counts that are older than a week (a few per visit, quietly).
  React.useEffect(() => {
    const stale = initial
      .filter((v) => v.creator_handle || v.creator_url)
      .filter((v) => !v.followers || (v.followers_checked_at && Date.now() - Date.parse(v.followers_checked_at) > STALE_FOLLOWERS_MS))
      .filter((v) => v.platform !== "instagram" || instagramReady)
      .slice(0, 3);
    for (const v of stale) {
      api<{ followers: number | null; checked_at: string }>(
        `/api/creators/resolve?followers=1&platform=${v.platform}&handle=${encodeURIComponent(v.creator_handle)}&profile=${encodeURIComponent(v.creator_url)}`,
      )
        .then((r) => {
          if (r.followers != null && String(r.followers) !== v.followers) {
            patch(v.id, { followers: String(r.followers), followers_checked_at: r.checked_at });
          }
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Paste → resolve → save. No dialog; the card shows up and can be edited inline. */
  async function quickAdd(raw: string) {
    const url = raw.trim();
    if (!url) return;
    if (!looksLikeVideoLink(url)) {
      toast.push("Paste an Instagram, YouTube or TikTok link");
      return;
    }
    const existingSame = videosRef.current.find((v) => v.url === url);
    if (existingSame) {
      toast.push("That video is already in the feed");
      return;
    }
    const key = `${Date.now()}-${Math.random()}`;
    setPending((p) => [{ key, url, label: "Reading link…" }, ...p]);
    setLink("");
    try {
      const r = await api<Resolved>(`/api/creators/resolve?url=${encodeURIComponent(url)}`);
      setPending((p) => p.map((x) => (x.key === key ? { ...x, label: "Saving…" } : x)));
      const handle = r.creator_handle || "";
      const prior = videosRef.current.filter((v) => handle && v.creator_handle.toLowerCase() === handle.toLowerCase());
      const thumb = await cacheThumb(r.thumbnail_url, r.thumbnail_proxyable);
      const v: CreatorVideo = {
        ...emptyVideo(),
        url: r.url,
        platform: r.platform,
        orientation: r.orientation,
        title: r.title,
        thumbnail_url: thumb,
        creator_handle: handle,
        creator_name: r.creator_name,
        creator_url: r.creator_url,
        followers: r.followers != null ? String(r.followers) : prior[0]?.followers ?? "",
        followers_checked_at: r.followers != null ? new Date().toISOString() : "",
        owner: prior[0]?.owner || readLastOwner(),
        price_usd: prior[0]?.price_usd ?? "",
        utm_source: r.platform,
        utm_campaign: handle ? slugify(handle) : "",
        utm_content: `video-${prior.length + 1}`,
        posted_at: new Date().toISOString().slice(0, 10),
      };
      v.tracked_url = buildTrackedUrl(PROGRAM.defaultLandingUrl, { source: v.utm_source, campaign: v.utm_campaign, content: v.utm_content });
      const saved = await api<CreatorVideo>("/api/creators/videos", { method: "POST", body: JSON.stringify(v) });
      upsertLocal(saved);
      if (r.warnings.length) toast.push(r.warnings[0]);
      else toast.push(handle ? `Added @${handle}` : "Added");
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Couldn't add that link");
    } finally {
      setPending((p) => p.filter((x) => x.key !== key));
    }
  }

  function submitLink(e: React.FormEvent) {
    e.preventDefault();
    // Several links at once (one per line / space separated) all go in.
    const urls = link.split(/\s+/).filter((s) => /^https?:\/\//i.test(s));
    if (urls.length === 0) return quickAdd(link);
    urls.forEach((u) => quickAdd(u));
  }

  async function remove(v: CreatorVideo) {
    if (!confirm(`Remove this video by @${v.creator_handle || "unknown"}? This deletes its row from the sheet.`)) return;
    try {
      await api(`/api/creators/videos/${v.id}`, { method: "DELETE" });
      setVideos((prev) => prev.filter((x) => x.id !== v.id));
      setEditing(null);
      toast.push("Removed");
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const visible = videos.filter((v) => {
    if (filter === "all") return true;
    if (filter === "ivan" || filter === "krithika") return v.owner === filter;
    return v.platform === filter;
  });

  const totals = React.useMemo(() => {
    let spend = 0;
    let signups = 0;
    let pageviews = 0;
    let visitors = 0;
    for (const v of visible) {
      spend += Number(v.price_usd) || 0;
      const s = statsForVideo(v, stats);
      signups += s.signups;
      pageviews += s.pageviews;
      visitors += s.visitors;
    }
    return { spend, signups, pageviews, visitors, cpa: signups > 0 ? spend / signups : null };
  }, [visible, stats]);

  const tabs: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "instagram", label: "Instagram" },
    { id: "youtube", label: "YouTube" },
    { id: "tiktok", label: "TikTok" },
  ];
  const needsSetup = !posthogReady || !instagramReady;

  return (
    <main className="min-h-screen bg-white pb-24">
      {/* Link bar */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 pt-4 pb-3">
          <form onSubmit={submitLink} className="flex items-center gap-3">
            <div className="relative flex-1">
              <Link2 className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-500" />
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                onPaste={(e) => {
                  // Pasting a link adds it straight away — no extra click.
                  const text = e.clipboardData.getData("text").trim();
                  if (text && looksLikeVideoLink(text)) {
                    e.preventDefault();
                    text.split(/\s+/).filter((s) => /^https?:\/\//i.test(s)).forEach((u) => quickAdd(u));
                  }
                }}
                placeholder="Paste an Instagram reel, YouTube or TikTok link — it's added instantly"
                className="h-12 w-full rounded-full bg-ink-100 pl-14 pr-32 text-[15px] placeholder:text-ink-500 focus:outline-none focus:ring-4 focus:ring-sky-200/70 focus:bg-white transition"
                spellCheck={false}
              />
              <button
                type="submit"
                disabled={!link.trim()}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 px-4 rounded-full bg-ink-950 text-white text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-ink-800 disabled:opacity-40 transition"
              >
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
          </form>

          <div className="mt-3 flex items-center gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <Tab key={t.id} active={filter === t.id} onClick={() => setFilter(t.id)}>
                {t.label}
              </Tab>
            ))}
            <span className="mx-2 h-5 w-px bg-ink-200 shrink-0" aria-hidden />
            {OWNERS.map((o) => (
              <Tab key={o.id} active={filter === o.id} onClick={() => setFilter(o.id)}>
                <span className={cn("inline-block h-2 w-2 rounded-full mr-1.5", o.id === "ivan" ? "bg-amber-400" : "bg-violet-400")} />
                {o.label}
              </Tab>
            ))}
            <div className="ml-auto pl-4 shrink-0 text-xs text-ink-500 inline-flex items-center gap-3">
              {posthogReady ? (
                statsState === "error" ? (
                  <span className="text-red-600" title={statsError}>PostHog error · <button className="underline" onClick={loadStats}>retry</button></span>
                ) : statsState === "loading" ? (
                  "Loading sign-ups…"
                ) : fetchedAt ? (
                  <span>
                    Sign-ups synced {new Date(fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ·{" "}
                    <button className="underline" onClick={loadStats}>refresh</button>
                  </span>
                ) : null
              ) : null}
              {needsSetup && (
                <button onClick={() => setShowSetup((s) => !s)} className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-900 px-2.5 h-6 font-medium">
                  {[!posthogReady && "PostHog", !instagramReady && "Instagram"].filter(Boolean).join(" + ")} not connected
                  <ChevronDown className={cn("h-3 w-3 transition", showSetup && "rotate-180")} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
        {needsSetup && showSetup && <SetupHints posthogReady={posthogReady} instagramReady={instagramReady} />}

        {/* Totals */}
        <div className="mt-2 mb-6 grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Stat label="Videos" value={String(visible.length)} />
          <Stat label="Spend" value={fmtMoney(totals.spend)} />
          <Stat label="Link clicks" value={totals.pageviews.toLocaleString()} sub={totals.visitors ? `${totals.visitors.toLocaleString()} people` : undefined} />
          <Stat label="Sign-ups" value={totals.signups.toLocaleString()} />
          <Stat
            label="Cost per sign-up"
            value={totals.cpa == null ? "—" : fmtMoney(totals.cpa, 2)}
            sub={`ads: ${fmtMoney(PROGRAM.cpaTargetUsd, 2)}`}
            tone={totals.cpa == null ? undefined : totals.cpa <= PROGRAM.cpaTargetUsd ? "good" : "bad"}
          />
        </div>

        {visible.length === 0 && pending.length === 0 ? (
          <div className="py-24 text-center">
            <div className="mx-auto h-16 w-16 rounded-full bg-ink-100 grid place-items-center">
              <Link2 className="h-7 w-7 text-ink-500" />
            </div>
            <p className="mt-4 text-base font-medium">No videos yet</p>
            <p className="mt-1 text-sm text-ink-500">Paste a creator&apos;s video link above. It shows up here with its sign-ups.</p>
          </div>
        ) : (
          <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-4">
            {pending.map((p) => (
              <PendingCard key={p.key} label={p.label} url={p.url} />
            ))}
            {visible.map((v) => (
              <VideoCard
                key={v.id}
                v={v}
                stats={statsForVideo(v, stats)}
                statsReady={posthogReady && statsState === "ok"}
                onEdit={() => setEditing(v)}
                onPatch={(p) => {
                  if (p.owner !== undefined) writeLastOwner(p.owner);
                  return patch(v.id, p);
                }}
                onCopy={async () => {
                  if (!v.tracked_url) return toast.push("No tracked link on this video yet");
                  await navigator.clipboard.writeText(v.tracked_url);
                  toast.push("Tracked link copied");
                }}
              />
            ))}
          </div>
        )}
      </div>

      {editing && (
        <VideoDialog
          key={editing.id}
          video={editing}
          onClose={() => setEditing(null)}
          onSaved={(v) => {
            upsertLocal(v);
            writeLastOwner(v.owner);
            setEditing(null);
            toast.push("Saved");
          }}
          onDelete={() => remove(editing)}
        />
      )}
    </main>
  );
}

function SetupHints({ posthogReady, instagramReady }: { posthogReady: boolean; instagramReady: boolean }) {
  return (
    <div className="mt-2 grid sm:grid-cols-2 gap-3 text-sm">
      {!posthogReady && (
        <div className="rounded-2xl border p-4">
          <div className="font-semibold">Connect PostHog (sign-ups + clicks)</div>
          <ol className="mt-2 list-decimal pl-4 space-y-1 text-ink-600">
            <li>PostHog → your avatar → <b>Personal API keys</b> → create one with the <code>query:read</code> scope.</li>
            <li>Add <code>POSTHOG_PERSONAL_API_KEY</code> and <code>POSTHOG_PROJECT_ID</code> (the number in the PostHog URL) to Vercel env vars and <code>.env.local</code>.</li>
            <li>Redeploy. Cards fill in with sign-ups automatically.</li>
          </ol>
        </div>
      )}
      {!instagramReady && (
        <div className="rounded-2xl border p-4">
          <div className="font-semibold">Connect Instagram (auto-fill reels)</div>
          <ol className="mt-2 list-decimal pl-4 space-y-1 text-ink-600">
            <li>Log in to instagram.com in your browser.</li>
            <li>DevTools → Application → Cookies → instagram.com → copy the <code>sessionid</code> value.</li>
            <li>Add it as <code>INSTAGRAM_SESSION_ID</code> in Vercel env vars and <code>.env.local</code>, then redeploy.</li>
          </ol>
          <p className="mt-2 text-xs text-ink-500">Reels then arrive with caption, thumbnail, handle and follower count. Logging out of Instagram invalidates it.</p>
        </div>
      )}
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative shrink-0 h-9 px-3 rounded-full text-[15px] font-semibold inline-flex items-center transition",
        active ? "text-ink-950" : "text-ink-600 hover:bg-ink-100",
      )}
    >
      {children}
      {active && <span className="absolute left-3 right-3 -bottom-0.5 h-[3px] rounded-full bg-ink-950" />}
    </button>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-2xl bg-ink-50 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-ink-500">{label}</div>
      <div className={cn("mt-0.5 text-xl font-semibold tabular-nums", tone === "good" && "text-emerald-700", tone === "bad" && "text-red-600")}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-ink-500">{sub}</div>}
    </div>
  );
}

// ---------- cards ----------

function PendingCard({ label, url }: { label: string; url: string }) {
  const vertical = !/youtube\.com\/watch|youtu\.be/i.test(url);
  return (
    <article className="mb-5 break-inside-avoid">
      <div className="relative overflow-hidden rounded-2xl bg-ink-100 animate-pulse" style={{ aspectRatio: vertical ? "9 / 16" : "16 / 9" }}>
        <div className="absolute inset-0 grid place-items-center text-xs font-medium text-ink-500">{label}</div>
      </div>
      <div className="px-1 pt-2.5">
        <div className="h-3 w-3/4 rounded bg-ink-100" />
        <div className="mt-2 h-3 w-1/2 rounded bg-ink-100" />
      </div>
    </article>
  );
}

function VideoCard({
  v,
  stats,
  statsReady,
  onEdit,
  onPatch,
  onCopy,
}: {
  v: CreatorVideo;
  stats: { pageviews: number; visitors: number; signups: number };
  statsReady: boolean;
  onEdit: () => void;
  onPatch: (p: Partial<CreatorVideo>) => Promise<CreatorVideo | null>;
  onCopy: () => void;
}) {
  const vertical = v.orientation !== "landscape";
  const price = Number(v.price_usd) || 0;
  const cpa = stats.signups > 0 && price > 0 ? price / stats.signups : null;
  const initial = (v.creator_name || v.creator_handle || "?").trim().charAt(0).toUpperCase();
  const incomplete = !v.creator_handle || !v.thumbnail_url;
  return (
    <article className="mb-5 break-inside-avoid">
      <div className="group relative">
        <a
          href={v.url}
          target="_blank"
          rel="noreferrer"
          className="block overflow-hidden rounded-2xl bg-ink-100 ring-1 ring-black/5"
          style={{ aspectRatio: vertical ? "9 / 16" : "16 / 9" }}
          title={`Open on ${platformLabel(v.platform)}`}
        >
          {v.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={v.thumbnail_url} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" loading="lazy" />
          ) : (
            <div className="h-full w-full grid place-items-center bg-gradient-to-br from-ink-100 to-ink-200">
              <PlatformIcon p={v.platform} className="h-10 w-10 text-ink-400" />
            </div>
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition duration-200" />
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between opacity-0 group-hover:opacity-100 transition">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 h-8 text-xs font-semibold text-ink-950 shadow-sm">
              <PlatformIcon p={v.platform} className="h-3.5 w-3.5" /> Open on {platformLabel(v.platform)} <ExternalLink className="h-3 w-3" />
            </span>
          </div>
        </a>
        {/* badges + actions sit beside the link so they stay valid HTML */}
        <div className="absolute top-3 left-3">
          <button
            type="button"
            onClick={() => onPatch({ owner: nextOwner(v.owner) })}
            title="Click to change who brought this creator in"
            className={cn(
              "rounded-full px-2.5 h-6 inline-flex items-center text-[11px] font-semibold shadow-sm transition",
              v.owner ? ownerClass(v.owner) : "bg-white/90 text-ink-500 opacity-0 group-hover:opacity-100",
            )}
          >
            {v.owner ? ownerLabel(v.owner) : "+ owner"}
          </button>
        </div>
        <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition">
          <IconButton title="Copy tracked link" onClick={onCopy}><Copy className="h-4 w-4" /></IconButton>
          <IconButton title="Edit details" onClick={onEdit}><Pencil className="h-4 w-4" /></IconButton>
        </div>
      </div>

      <div className="px-1 pt-2.5">
        {v.title ? (
          <p className="text-[13px] font-semibold leading-snug line-clamp-2 text-ink-950">{v.title}</p>
        ) : incomplete ? (
          <button onClick={onEdit} className="text-[13px] font-semibold text-amber-700 hover:underline text-left">
            Add details →
          </button>
        ) : null}
        <div className={cn("flex items-center gap-2", (v.title || incomplete) && "mt-1.5")}>
          <span className="h-6 w-6 shrink-0 rounded-full bg-ink-200 text-ink-700 grid place-items-center text-[11px] font-semibold">{initial}</span>
          {v.creator_url ? (
            <a href={v.creator_url} target="_blank" rel="noreferrer" className="text-[13px] text-ink-700 hover:underline truncate">
              @{v.creator_handle || v.creator_name || "creator"}
            </a>
          ) : (
            <span className="text-[13px] text-ink-700 truncate">@{v.creator_handle || v.creator_name || "creator"}</span>
          )}
          {v.followers && <span className="text-[12px] text-ink-500 shrink-0">· {fmtCount(v.followers)}</span>}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-600">
          <span className="font-semibold text-ink-950 text-[13px] tabular-nums">
            {statsReady ? stats.signups : "–"} sign-up{stats.signups === 1 ? "" : "s"}
          </span>
          <span className="tabular-nums">{statsReady ? stats.pageviews.toLocaleString() : "–"} clicks</span>
          <InlinePrice value={v.price_usd} onSave={(price_usd) => onPatch({ price_usd })} />
          {cpa != null && (
            <span className={cn("tabular-nums", cpa <= PROGRAM.cpaTargetUsd ? "text-emerald-700" : "text-red-600")}>
              {fmtMoney(cpa, 2)}/sign-up
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

/** "$150" that turns into an input on click. Enter/blur saves, Escape cancels. */
function InlinePrice({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);
  if (!editing) {
    const n = Number(value) || 0;
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        title="Click to set the price"
        className={cn("tabular-nums rounded px-1 -mx-1 hover:bg-ink-100", !n && "text-amber-700")}
      >
        {n ? fmtMoney(n) : "+ price"}
      </button>
    );
  }
  const commit = () => {
    setEditing(false);
    const clean = draft.replace(/[^\d.]/g, "");
    if (clean !== value) onSave(clean);
  };
  return (
    <span className="inline-flex items-center">
      <span className="text-ink-400 mr-0.5">$</span>
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        inputMode="decimal"
        className="w-14 h-6 rounded border px-1 text-[12px] tabular-nums focus:outline-none focus:border-ink-950"
      />
    </span>
  );
}

function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      className="h-8 w-8 rounded-full bg-white/95 text-ink-950 grid place-items-center shadow-sm hover:bg-white"
    >
      {children}
    </button>
  );
}

// ---------- edit dialog ----------

function VideoDialog(props: {
  video: CreatorVideo;
  onClose: () => void;
  onSaved: (v: CreatorVideo) => void;
  onDelete: () => void;
}) {
  const { onClose, onSaved, onDelete } = props;
  const [v, setV] = React.useState<CreatorVideo>(props.video);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [checkingFollowers, setCheckingFollowers] = React.useState(false);
  const [refetching, setRefetching] = React.useState(false);
  const [landing, setLanding] = React.useState<string>(() => {
    try {
      const u = new URL(props.video.tracked_url);
      return `${u.origin}${u.pathname}`;
    } catch {
      return PROGRAM.defaultLandingUrl;
    }
  });
  const [customLink, setCustomLink] = React.useState(() => {
    const p = parseTrackedUrl(props.video.tracked_url);
    if (!p) return false;
    return p.campaign !== props.video.utm_campaign || p.content !== props.video.utm_content || p.source !== props.video.utm_source;
  });
  const [thumbUrlInput, setThumbUrlInput] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const set = (patch: Partial<CreatorVideo>) => setV((cur) => ({ ...cur, ...patch }));

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const generated = buildTrackedUrl(landing, { source: v.utm_source, campaign: v.utm_campaign, content: v.utm_content });
  React.useEffect(() => {
    if (!customLink) set({ tracked_url: generated });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generated, customLink]);

  async function refetch() {
    setRefetching(true);
    setError("");
    try {
      const r = await api<Resolved>(`/api/creators/resolve?url=${encodeURIComponent(v.url)}`);
      const thumb = await cacheThumb(r.thumbnail_url, r.thumbnail_proxyable);
      set({
        title: r.title || v.title,
        thumbnail_url: thumb || v.thumbnail_url,
        creator_handle: r.creator_handle || v.creator_handle,
        creator_name: r.creator_name || v.creator_name,
        creator_url: r.creator_url || v.creator_url,
        followers: r.followers != null ? String(r.followers) : v.followers,
        followers_checked_at: r.followers != null ? new Date().toISOString() : v.followers_checked_at,
        utm_campaign: v.utm_campaign || (r.creator_handle ? slugify(r.creator_handle) : ""),
      });
      setWarnings(r.warnings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not re-read the link");
    } finally {
      setRefetching(false);
    }
  }

  async function refreshFollowers() {
    setCheckingFollowers(true);
    try {
      const r = await api<{ followers: number | null }>(
        `/api/creators/resolve?followers=1&platform=${v.platform}&handle=${encodeURIComponent(v.creator_handle)}&profile=${encodeURIComponent(v.creator_url)}`,
      );
      if (r.followers != null) set({ followers: String(r.followers), followers_checked_at: new Date().toISOString() });
      else setWarnings((w) => [...w.filter((x) => !x.startsWith("Couldn't read")), `Couldn't read the follower count from ${platformLabel(v.platform)}. Type it in.`]);
    } finally {
      setCheckingFollowers(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    set({ thumbnail_url: await shrinkToDataUrl(f) });
    e.target.value = "";
  }

  async function useThumbUrl() {
    const u = thumbUrlInput.trim();
    if (!u) return;
    if (!/^https:\/\//.test(u)) return setError("Thumbnail must be an https URL");
    set({ thumbnail_url: await cacheThumb(u, true) });
    setThumbUrlInput("");
  }

  function onCustomLinkChange(s: string) {
    set({ tracked_url: s });
    const p = parseTrackedUrl(s);
    if (p) set({ utm_source: p.source, utm_campaign: p.campaign, utm_content: p.content });
  }

  async function save() {
    setError("");
    if (!v.utm_campaign) return setError("utm_campaign is needed to match sign-ups in PostHog");
    setSaving(true);
    try {
      const saved = await api<CreatorVideo>(`/api/creators/videos/${v.id}`, { method: "PATCH", body: JSON.stringify(v) });
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const vertical = v.orientation !== "landscape";

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-ink-950/40" onClick={onClose} aria-hidden />
      <div className="absolute inset-0 overflow-y-auto">
        <div className="min-h-full flex items-start sm:items-center justify-center p-3 sm:p-6">
          <div className="relative w-full max-w-3xl rounded-3xl bg-white shadow-xl overflow-hidden">
            <button onClick={onClose} className="absolute top-4 right-4 h-9 w-9 rounded-full hover:bg-ink-100 grid place-items-center" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
            <div className="grid sm:grid-cols-[260px_1fr]">
              {/* Left: thumbnail */}
              <div className="p-5 sm:p-6 bg-ink-50 flex flex-col gap-3">
                <div
                  className="relative w-full overflow-hidden rounded-2xl bg-ink-200 ring-1 ring-black/5"
                  style={{ aspectRatio: vertical ? "9 / 16" : "16 / 9" }}
                >
                  {v.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.thumbnail_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 grid place-items-center text-ink-400">
                      <PlatformIcon p={v.platform} className="h-10 w-10" />
                    </div>
                  )}
                </div>
                <button type="button" onClick={refetch} disabled={refetching} className="h-9 rounded-full bg-ink-950 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-ink-800 disabled:opacity-50">
                  <RefreshCw className={cn("h-3.5 w-3.5", refetching && "animate-spin")} /> Re-read from {platformLabel(v.platform)}
                </button>
                <div className="flex gap-2">
                  <button type="button" onClick={() => fileRef.current?.click()} className="flex-1 h-9 rounded-full bg-white border text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-ink-100">
                    <Upload className="h-3.5 w-3.5" /> Upload image
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
                </div>
                <div className="flex gap-1.5">
                  <input
                    value={thumbUrlInput}
                    onChange={(e) => setThumbUrlInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), useThumbUrl())}
                    placeholder="…or paste an image URL"
                    className="min-w-0 flex-1 h-9 rounded-full bg-white border px-3 text-xs focus:outline-none focus:border-ink-950"
                  />
                  <button type="button" onClick={useThumbUrl} className="h-9 w-9 rounded-full bg-white border grid place-items-center hover:bg-ink-100" aria-label="Use image URL">
                    <Check className="h-4 w-4" />
                  </button>
                </div>
                <div className="text-[11px] text-ink-500 inline-flex items-center gap-1.5">
                  <PlatformIcon p={v.platform} className="h-3.5 w-3.5" /> {platformLabel(v.platform)} · {vertical ? "vertical" : "landscape"}
                  <button type="button" className="ml-auto underline" onClick={() => set({ orientation: vertical ? "landscape" : "vertical" })}>
                    flip
                  </button>
                </div>
              </div>

              {/* Right: fields */}
              <div className="p-5 sm:p-6 pr-14 sm:pr-14 flex flex-col gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Edit video</h2>
                  <a href={v.url} target="_blank" rel="noreferrer" className="text-xs text-ink-500 hover:underline break-all">{v.url}</a>
                </div>

                {warnings.map((w) => (
                  <p key={w} className="rounded-xl bg-amber-50 text-amber-900 text-xs px-3 py-2">{w}</p>
                ))}
                {error && <p className="rounded-xl bg-red-50 text-red-700 text-xs px-3 py-2">{error}</p>}

                <Field label="Title">
                  <input value={v.title} onChange={(e) => set({ title: e.target.value })} className={inputCls} placeholder="Caption or video title" />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Creator handle">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">@</span>
                      <input
                        value={v.creator_handle}
                        onChange={(e) => {
                          const h = e.target.value.replace(/^@/, "").trim();
                          const patch: Partial<CreatorVideo> = { creator_handle: h };
                          if (!customLink) patch.utm_campaign = slugify(h);
                          if (!v.creator_url || /instagram\.com|tiktok\.com|youtube\.com\/@/.test(v.creator_url)) {
                            patch.creator_url = profileUrlFor(v.platform, h);
                          }
                          set(patch);
                        }}
                        className={cn(inputCls, "pl-7")}
                        placeholder="handle"
                      />
                    </div>
                  </Field>
                  <Field label="Creator name">
                    <input value={v.creator_name} onChange={(e) => set({ creator_name: e.target.value })} className={inputCls} placeholder="Display name" />
                  </Field>
                </div>

                <Field label="Profile link">
                  <input value={v.creator_url} onChange={(e) => set({ creator_url: e.target.value })} className={inputCls} placeholder="https://www.instagram.com/handle/" />
                </Field>

                <div className="grid grid-cols-3 gap-3">
                  <Field label="Followers">
                    <div className="flex gap-1">
                      <input
                        value={v.followers}
                        onChange={(e) => set({ followers: e.target.value.replace(/[^\d]/g, ""), followers_checked_at: "" })}
                        className={cn(inputCls, "tabular-nums")}
                        placeholder="12400"
                        inputMode="numeric"
                      />
                      <button
                        type="button"
                        onClick={refreshFollowers}
                        disabled={checkingFollowers || (!v.creator_handle && !v.creator_url)}
                        className="h-9 w-9 shrink-0 rounded-full border grid place-items-center hover:bg-ink-100 disabled:opacity-40"
                        title="Look up the follower count"
                      >
                        <RefreshCw className={cn("h-3.5 w-3.5", checkingFollowers && "animate-spin")} />
                      </button>
                    </div>
                  </Field>
                  <Field label="Price (USD)">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">$</span>
                      <input
                        value={v.price_usd}
                        onChange={(e) => set({ price_usd: e.target.value.replace(/[^\d.]/g, "") })}
                        className={cn(inputCls, "pl-6 tabular-nums")}
                        placeholder="150"
                        inputMode="decimal"
                      />
                    </div>
                  </Field>
                  <Field label="Posted">
                    <input type="date" value={v.posted_at} onChange={(e) => set({ posted_at: e.target.value })} className={inputCls} />
                  </Field>
                </div>

                <Field label="Brought in by">
                  <div className="flex gap-2">
                    {OWNERS.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => set({ owner: v.owner === o.id ? "" : o.id })}
                        className={cn(
                          "h-9 px-4 rounded-full text-sm font-semibold border transition",
                          v.owner === o.id ? cn(ownerClass(o.id), "border-transparent") : "bg-white hover:bg-ink-100",
                        )}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </Field>

                {/* Tracked link */}
                <div className="rounded-2xl border p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Tracked link</div>
                    <label className="text-xs text-ink-600 inline-flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={customLink} onChange={(e) => setCustomLink(e.target.checked)} />
                      I have my own link
                    </label>
                  </div>
                  {customLink ? (
                    <input
                      value={v.tracked_url}
                      onChange={(e) => onCustomLinkChange(e.target.value)}
                      className={inputCls}
                      placeholder="https://www.riffle.studio/?utm_source=…&utm_campaign=…"
                    />
                  ) : (
                    <>
                      <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                        <input
                          readOnly
                          value={v.tracked_url}
                          className={cn(inputCls, "bg-ink-50 text-ink-700 text-xs")}
                          onFocus={(e) => e.currentTarget.select()}
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            await navigator.clipboard.writeText(v.tracked_url);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1500);
                          }}
                          className="h-9 px-3 rounded-full bg-ink-950 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <Field label="utm_source" small>
                          <input value={v.utm_source} onChange={(e) => set({ utm_source: slugify(e.target.value) })} className={cn(inputCls, "text-xs")} />
                        </Field>
                        <Field label="utm_campaign" small>
                          <input value={v.utm_campaign} onChange={(e) => set({ utm_campaign: slugify(e.target.value) })} className={cn(inputCls, "text-xs")} />
                        </Field>
                        <Field label="utm_content" small>
                          <input value={v.utm_content} onChange={(e) => set({ utm_content: slugify(e.target.value) })} className={cn(inputCls, "text-xs")} />
                        </Field>
                      </div>
                      <Field label="Landing page" small>
                        <input value={landing} onChange={(e) => setLanding(e.target.value)} className={cn(inputCls, "text-xs")} />
                      </Field>
                    </>
                  )}
                  <p className="text-[11px] text-ink-500">
                    Sign-ups are counted from PostHog where <code>utm_campaign</code> matches
                    {v.utm_content ? (
                      <>
                        {" "}and <code>utm_content</code> = <code>{v.utm_content}</code>
                      </>
                    ) : (
                      " (any utm_content)"
                    )}
                    . Leave utm_content blank to pool every link for this creator.
                  </p>
                </div>

                <Field label="Notes">
                  <textarea value={v.notes} onChange={(e) => set({ notes: e.target.value })} className={cn(inputCls, "h-auto min-h-[64px] py-2 resize-y")} placeholder="Deal terms, deliverables, anything to remember" />
                </Field>

                <div className="flex items-center gap-2 pt-1">
                  <button type="button" onClick={onDelete} className="h-10 px-3 rounded-full text-sm text-red-600 hover:bg-red-50 inline-flex items-center gap-1.5">
                    <Trash2 className="h-4 w-4" /> Remove
                  </button>
                  <div className="ml-auto flex gap-2">
                    <button type="button" onClick={onClose} className="h-10 px-4 rounded-full text-sm font-semibold hover:bg-ink-100">Cancel</button>
                    <button
                      type="button"
                      onClick={save}
                      disabled={saving}
                      className="h-10 px-5 rounded-full bg-[#e60023] text-white text-sm font-semibold hover:bg-[#ad081b] disabled:opacity-50"
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "h-9 w-full rounded-xl border bg-white px-3 text-sm placeholder:text-ink-400 focus:border-ink-950 focus:outline-none";

function Field({ label, children, small }: { label: string; children: React.ReactNode; small?: boolean }) {
  return (
    <label className="block">
      <span className={cn("block mb-1 text-ink-600", small ? "text-[10px] uppercase tracking-wide" : "text-xs font-medium")}>{label}</span>
      {children}
    </label>
  );
}

function profileUrlFor(platform: Platform, handle: string): string {
  const h = handle.replace(/^@/, "");
  if (!h) return "";
  if (platform === "instagram") return `https://www.instagram.com/${h}/`;
  if (platform === "tiktok") return `https://www.tiktok.com/@${h}`;
  if (platform === "youtube") return `https://www.youtube.com/@${h}`;
  return "";
}
