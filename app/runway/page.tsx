import { auth, signIn, signOut } from "@/lib/runway/auth";
import { oauthConfigured, userSheetsClient } from "@/lib/runway/session";
import { getRunwaySummary, RunwayError, RunwaySummary } from "@/lib/runway/sheets";
import { Button } from "@/components/ui/button";
import { RunwayClient } from "./runway-client";

export const dynamic = "force-dynamic";

export default async function RunwayPage() {
  // OAuth mode: gate on the Google session here. Service-account mode: the
  // admin-cookie gate already ran in middleware, so there is no sign-in step.
  const oauthMode = oauthConfigured();
  const session = oauthMode ? await auth() : null;
  const needsSignIn =
    oauthMode && (!session?.accessToken || session.error === "RefreshTokenError");

  if (needsSignIn) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-sm border rounded p-6 space-y-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Runway</h1>
            <p className="text-sm text-ink-600 mt-1">
              {session?.error === "RefreshTokenError"
                ? "Your Google session expired (test-mode tokens last 7 days). Sign in again."
                : "Sign in with a Google account that can open the master financial sheet."}
            </p>
          </div>
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/runway" });
            }}
          >
            <Button type="submit" className="w-full">
              Sign in with Google
            </Button>
          </form>
        </div>
      </main>
    );
  }

  let summary: RunwaySummary | null = null;
  let loadError: string | null = null;
  try {
    const sheets = await userSheetsClient();
    if (!sheets) {
      loadError =
        "Sheets access is not configured: set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY (or the Google OAuth vars) in the environment.";
    } else {
      summary = await getRunwaySummary(sheets);
    }
  } catch (err) {
    if (err instanceof RunwayError) loadError = err.message;
    else if ((err as { status?: number }).status === 403 || (err as { status?: number }).status === 404) {
      loadError = oauthMode
        ? "Your Google account can sign in but cannot open the master sheet. Ask for access to the spreadsheet, then reload."
        : "The service account cannot open the master sheet. Share the spreadsheet with the service-account email (Editor), then reload.";
    } else {
      loadError = `Failed to read the sheet: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return (
    <main className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto max-w-4xl px-6 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Riffle" className="h-5 w-auto" />
            <span className="text-sm font-semibold tracking-tight">runway</span>
          </div>
          {oauthMode ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-ink-600">{session?.user?.email}</span>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/runway" });
                }}
              >
                <Button type="submit" variant="ghost" size="sm">
                  Sign out
                </Button>
              </form>
            </div>
          ) : (
            <span className="text-xs text-ink-500 border rounded px-2 py-0.5">
              service account
            </span>
          )}
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-6 py-8">
        {loadError ? (
          <div className="border rounded p-4 text-sm text-ink-700">{loadError}</div>
        ) : (
          <RunwayClient summary={summary!} />
        )}
      </div>
    </main>
  );
}
