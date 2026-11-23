import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { isProxyableThumb } from "@/lib/creators/resolve";

// Proxies a thumbnail from a known video CDN so the browser can draw it on a canvas
// (CORS) and keep a small copy — TikTok thumbnail URLs expire within hours.
export async function GET(req: NextRequest) {
  if (!(await isAuthed())) return new NextResponse("unauth", { status: 401 });
  const u = req.nextUrl.searchParams.get("u") ?? "";
  if (!isProxyableThumb(u)) return new NextResponse("host not allowed", { status: 400 });
  const res = await fetch(u, {
    headers: { "user-agent": "Mozilla/5.0", referer: new URL(u).origin + "/" },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!res || !res.ok) return new NextResponse("upstream failed", { status: 502 });
  const type = res.headers.get("content-type") ?? "image/jpeg";
  if (!type.startsWith("image/")) return new NextResponse("not an image", { status: 502 });
  const buf = await res.arrayBuffer();
  if (buf.byteLength > 6_000_000) return new NextResponse("too large", { status: 413 });
  return new NextResponse(buf, {
    headers: { "content-type": type, "cache-control": "private, max-age=3600" },
  });
}
