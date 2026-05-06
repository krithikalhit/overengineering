import { listInvestors } from "@/lib/sheets";
import { PublicInvestor } from "@/lib/types";
import { BoardClient } from "./board-client";
import { TopNav } from "@/components/shared/nav";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BoardPage() {
  let investors: PublicInvestor[] = [];
  let error: string | null = null;
  try {
    const all = await listInvestors();
    investors = all
      .filter((i) => i.full_name.trim() !== "")
      .map((i) => ({
        id: i.id,
        full_name: i.full_name,
        company_project: i.company_project,
        category: i.category,
        relevance: i.relevance,
        tags: i.tags,
        priority: i.priority,
      }));
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load";
  }

  return (
    <>
      <TopNav active="board" />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Investor intro board</h1>
          <p className="mt-1 text-sm text-ink-500 max-w-2xl">
            If you can intro us to anyone below, click &ldquo;I can intro&rdquo; — we&rsquo;ll
            handle the rest. Thanks for the help.
          </p>
        </div>
        {error ? (
          <div className="rounded border bg-ink-50 p-4 text-sm text-ink-600">
            Could not load investors right now ({error}). Try again shortly.
          </div>
        ) : (
          <BoardClient investors={investors} />
        )}
      </main>
    </>
  );
}
