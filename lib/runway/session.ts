import { auth } from "./auth";
import { runwaySheetsClient } from "./sheets";
import type { sheets_v4 } from "googleapis";

/**
 * Sheets client bound to the signed-in user's Google token, or null if they
 * need to (re-)authenticate. Sheet-level permissions are the access control:
 * a user who cannot open the master sheet gets 403s from Google, not data.
 */
export async function userSheetsClient(): Promise<sheets_v4.Sheets | null> {
  const session = await auth();
  if (!session?.accessToken || session.error === "RefreshTokenError") return null;
  return runwaySheetsClient(session.accessToken);
}
