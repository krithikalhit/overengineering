import { google, sheets_v4 } from "googleapis";
import { JWT } from "google-auth-library";
import { auth } from "./auth";
import { isAuthed } from "@/lib/auth";
import { runwaySheetsClient } from "./sheets";

/**
 * Two access modes, decided by which env vars exist:
 *
 * - OAuth mode (GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET set): Sheets calls run
 *   with the signed-in user's Google token. Sheet permissions are the access
 *   control — a user who cannot open the master sheet gets 403s, not data.
 *
 * - Service-account mode (fallback): Sheets calls run as the CRM's service
 *   account (share the master sheet with GOOGLE_SERVICE_ACCOUNT_EMAIL as
 *   Editor). Because the service account can always edit the sheet, /runway is
 *   gated behind the admin-password cookie instead (see middleware.ts).
 */
export function oauthConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function serviceAccountClient(): sheets_v4.Sheets | null {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) return null;
  const jwt = new JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth: jwt });
}

/** Sheets client for the current requester, or null if they must authenticate. */
export async function userSheetsClient(): Promise<sheets_v4.Sheets | null> {
  if (oauthConfigured()) {
    const session = await auth();
    if (!session?.accessToken || session.error === "RefreshTokenError") return null;
    return runwaySheetsClient(session.accessToken);
  }
  if (!(await isAuthed())) return null;
  return serviceAccountClient();
}
