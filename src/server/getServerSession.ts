import type { AuthConfig, AuthSession, AuthTokens, LoginResponse } from "../types";
import { decrypt } from "../utils/crypto";
import {
  resolveAccessTokenExpiry,
  resolveRefreshTokenExpiry,
} from "../utils/expiry";

type NextRequest = {
  cookies: {
    get(name: string): { value: string } | undefined;
  };
};

/**
 * Retrieves and validates the auth session on the server side.
 * Reads the encrypted session cookie, validates token expiry,
 * and refreshes if needed.
 *
 * Compatible with Next.js App Router (NextRequest) and Pages Router (IncomingMessage).
 *
 * @example
 * // app/dashboard/page.tsx
 * import { getServerSession } from "next-token-auth/server";
 *
 * export default async function Page({ request }) {
 *   const session = await getServerSession(request, config);
 *   if (!session.isAuthenticated) redirect("/login");
 * }
 */
export async function getServerSession<User = unknown>(
  req: NextRequest,
  config: AuthConfig<User>
): Promise<AuthSession<User>> {
  const cookieName = config.token.cookieName ?? "next-token-auth.session";
  const cookieValue = req.cookies.get(cookieName)?.value;

  if (!cookieValue) {
    return { user: null, tokens: null, isAuthenticated: false };
  }

  let tokens: AuthTokens | null = null;

  try {
    const json = await decrypt(cookieValue, config.secret);
    tokens = JSON.parse(json) as AuthTokens;
  } catch {
    return { user: null, tokens: null, isAuthenticated: false };
  }

  const now = Date.now();
  const threshold = (config.refreshThreshold ?? 60) * 1000;
  const accessExpired = now >= tokens.accessTokenExpiresAt - threshold;
  const refreshExpired = tokens.refreshTokenExpiresAt
    ? now >= tokens.refreshTokenExpiresAt
    : false;

  // Both expired → clear session
  if (accessExpired && refreshExpired) {
    return { user: null, tokens: null, isAuthenticated: false };
  }

  // Access expired but refresh valid → attempt server-side refresh
  if (accessExpired && !refreshExpired) {
    const refreshed = await serverRefresh<User>(tokens, config);
    if (!refreshed) {
      return { user: null, tokens: null, isAuthenticated: false };
    }
    tokens = refreshed;
  }

  const user = await fetchUser<User>(tokens.accessToken, config);

  return {
    user,
    tokens,
    isAuthenticated: true,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function serverRefresh<User>(
  tokens: AuthTokens,
  config: AuthConfig<User>
): Promise<AuthTokens | null> {
  try {
    const fetchFn = config.fetchFn ?? fetch;
    const baseUrl = config.baseUrl.replace(/\/$/, "");
    const refreshPath = config.endpoints.refresh.replace(/^\//, "");

    const res = await fetchFn(`${baseUrl}/${refreshPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as LoginResponse<User>;
    const strategy = config.expiry?.strategy ?? "hybrid";

    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      accessTokenExpiresAt: resolveAccessTokenExpiry(
        data,
        config.expiry?.accessTokenExpiresIn,
        strategy
      ),
      refreshTokenExpiresAt: resolveRefreshTokenExpiry(
        data,
        config.expiry?.refreshTokenExpiresIn,
        strategy
      ),
    };
  } catch {
    return null;
  }
}

async function fetchUser<User>(
  accessToken: string,
  config: AuthConfig<User>
): Promise<User | null> {
  if (!config.endpoints.me) return null;

  try {
    const fetchFn = config.fetchFn ?? fetch;
    const baseUrl = config.baseUrl.replace(/\/$/, "");
    const mePath = config.endpoints.me.replace(/^\//, "");

    const res = await fetchFn(`${baseUrl}/${mePath}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) return null;
    return (await res.json()) as User;
  } catch {
    return null;
  }
}
