import { TopNav } from "@/components/shared/nav";
import { ensureVideosSheet, listVideos } from "@/lib/creators/sheets";
import { posthogConfigured } from "@/lib/creators/posthog";
import { CreatorVideo } from "@/lib/creators/types";
import { CreatorsClient } from "./creators-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Creator-program sign-up tracker. Gated by the admin cookie in middleware (like /admin).
export default async function CreatorsPage() {
  let videos: CreatorVideo[] = [];
  let loadError: string | null = null;
  try {
    await ensureVideosSheet();
    videos = await listVideos();
  } catch (err) {
    const status = (err as { status?: number }).status;
    loadError =
      status === 403 || status === 404
        ? "The service account cannot open the CRM sheet. Share it with the service-account email (Editor), then reload."
        : `Failed to read the sheet: ${err instanceof Error ? err.message : String(err)}`;
  }
  return (
    <>
      <TopNav active="creators" showAdmin />
      {loadError ? (
        <main className="mx-auto max-w-xl px-6 py-24 text-center">
          <h1 className="text-lg font-semibold">Sheet unreachable</h1>
          <p className="mt-2 text-sm text-ink-500">{loadError}</p>
        </main>
      ) : (
        <CreatorsClient initial={videos} posthogReady={posthogConfigured()} />
      )}
    </>
  );
}
