import { auth, signIn, signOut } from "@/lib/runway/auth";
import { oauthConfigured, userSheetsClient } from "@/lib/runway/session";
import { getRunwaySummary, RunwayError, RunwaySummary } from "@/lib/runway/sheets";
import { RunwayClient, RunwayMast } from "./runway-client";
import "./runway.css";

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
      <main className="rwx">
        <div className="rw-center">
          <div className="rw-win" style={{ maxWidth: 420, width: "100%", margin: 0 }}>
            <div className="rw-titlebar"><span>LOGIN.EXE</span><span className="rw-x" aria-hidden="true">✕</span></div>
            <div className="rw-body">
              <p className="rw-note" style={{ marginTop: 0 }}>
                {session?.error === "RefreshTokenError"
                  ? "Google session expired (test-mode tokens last 7 days). Sign in again."
                  : "Sign in with a Google account that can open the master financial sheet."}
              </p>
              <form
                action={async () => {
                  "use server";
                  await signIn("google", { redirectTo: "/runway" });
                }}
              >
                <button type="submit" className="rw-go" style={{ width: "100%" }}>
                  ▶ Sign in with Google
                </button>
              </form>
            </div>
          </div>
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

  const mastRight = oauthMode ? (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/runway" });
      }}
    >
      <button type="submit" className="rw-ghost">✕ {session?.user?.email ?? "Sign out"}</button>
    </form>
  ) : (
    <span className="rw-ghost" style={{ cursor: "default" }}>SERVICE ACCOUNT</span>
  );

  return (
    <main className="rwx">
      <RunwayMast right={mastRight} tab={summary?.tab} />
      {loadError ? (
        <div className="rw-wrap" style={{ paddingTop: 26 }}>
          <div className="rw-win" style={{ maxWidth: 560 }}>
            <div className="rw-titlebar"><span>ERROR</span><span className="rw-x" aria-hidden="true">✕</span></div>
            <div className="rw-dlg-body">
              <div className="rw-dlg-icon" style={{ background: "var(--rw-blue)" }}>✕</div>
              <div className="rw-dlg-text">{loadError}</div>
            </div>
          </div>
        </div>
      ) : (
        <RunwayClient summary={summary!} />
      )}
    </main>
  );
}
