import type { AuthConfig, AuthSession, AuthTokens } from "../types";
import { decrypt } from "../utils/crypto";

/**
 * Reads the session from the cookie store inside a Server Component or layout.
 * Use this in app/layout.tsx to pre-seed AuthProvider and avoid the auth flash.
 *
 * @example
 * // app/layout.tsx
 * import { getLayoutSession } from "next-token-auth/server";
 * import { authConfig } from "@/lib/auth";
 *
 * export default async function RootLayout({ children }) {
 *   const session = await getLayoutSession(authConfig);
 *   return (
 *     <AuthProvider config={clientConfig} initialSession={session}>
 *       {children}
 *     </AuthProvider>
 *   );
 * }
 */
export async function getLayoutSession<User = unknown>(
  config: AuthConfig<User>
): Promise<AuthSession<User>> {
  const empty: AuthSession<User> = {
    user: null,
    tokens: null,
    isAuthenticated: false,
  };

  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const cookieName = config.token.cookieName ?? "next-token-auth.session";
    const raw = cookieStore.get(cookieName)?.value;

    if (!raw) return empty;

    // Decrypt the cookie using the server-side secret
    let tokens: AuthTokens;
    try {
      const json = await decrypt(decodeURIComponent(raw), config.secret);
      tokens = JSON.parse(json) as AuthTokens;
    } catch {
      return empty;
    }

    // Reject if refresh token has expired
    if (tokens.refreshTokenExpiresAt && Date.now() >= tokens.refreshTokenExpiresAt) {
      return empty;
    }

    // Fetch user info using the access token
    let user: User | null = null;
    if (config.endpoints.me) {
      try {
        const fetchFn = config.fetchFn ?? fetch;
        const res = await fetchFn(`${config.baseUrl}${config.endpoints.me}`, {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        if (res.ok) user = (await res.json()) as User;
      } catch {
        // User fetch failed, but token exists — still authenticated
      }
    }

    // Return session without exposing raw tokens to the client
    return { user, tokens: null, isAuthenticated: true };
  } catch {
    return empty;
  }
}
