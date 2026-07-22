import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Google OAuth for the Runway feature. Separate from the password gate in lib/auth.ts:
// Sheets calls run with the signed-in user's token, so only people who can already
// open the master financial sheet can read or write anything through the app.

const SCOPE = "openid email profile https://www.googleapis.com/auth/spreadsheets";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    error?: "RefreshTokenError";
  }
}

interface GoogleToken {
  access_token?: string;
  expires_at?: number; // epoch seconds
  refresh_token?: string;
  error?: "RefreshTokenError";
}

async function refreshAccessToken(token: GoogleToken): Promise<GoogleToken> {
  if (!token.refresh_token) return { ...token, error: "RefreshTokenError" };
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
        refresh_token: token.refresh_token,
      }),
    });
    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
      error?: string;
    };
    if (!res.ok || !data.access_token) throw new Error(data.error ?? `HTTP ${res.status}`);
    return {
      ...token,
      access_token: data.access_token,
      expires_at: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
      // Google only re-sends refresh_token sometimes; keep the old one otherwise.
      refresh_token: data.refresh_token ?? token.refresh_token,
      error: undefined,
    };
  } catch {
    // In Testing mode the refresh token expires after 7 days — surface as a re-login.
    return { ...token, error: "RefreshTokenError" };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // access_type=offline + prompt=consent are required to get a usable refresh token.
      authorization: {
        params: { scope: SCOPE, access_type: "offline", prompt: "consent" },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      const t = token as GoogleToken & typeof token;
      if (account) {
        // Fresh sign-in: persist the Google tokens on the JWT.
        t.access_token = account.access_token;
        t.expires_at = account.expires_at;
        t.refresh_token = account.refresh_token ?? t.refresh_token;
        t.error = undefined;
        return t;
      }
      // Still valid (with a 60s safety margin)?
      if (t.expires_at && Date.now() < t.expires_at * 1000 - 60_000) return t;
      return { ...t, ...(await refreshAccessToken(t)) };
    },
    async session({ session, token }) {
      const t = token as GoogleToken;
      session.accessToken = t.access_token;
      session.error = t.error;
      return session;
    },
  },
});
