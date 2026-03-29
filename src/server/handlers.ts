import type { AuthConfig, AuthTokens, LoginResponse } from "../types";
import { encrypt, decrypt } from "../utils/crypto";
import {
  resolveAccessTokenExpiry,
  resolveRefreshTokenExpiry,
} from "../utils/expiry";

type NextRequest = {
  json(): Promise<unknown>;
  cookies: { get(name: string): { value: string } | undefined };
};

/**
 * Creates Next.js Route Handlers for login, logout, session, and refresh.
 * Mount these at `app/api/auth/[action]/route.ts`.
 *
 * All encryption happens server-side — the secret never leaves the server.
 *
 * @example
 * // app/api/auth/[action]/route.ts
 * import { createAuthHandlers } from "next-token-auth/server";
 * import { authConfig } from "@/lib/auth";
 *
 * export const { GET, POST } = createAuthHandlers(authConfig);
 */
export function createAuthHandlers<User = unknown>(config: AuthConfig<User>) {
  const cookieName = config.token.cookieName ?? "next-token-auth.session";

  return {
    POST: async (
      req: NextRequest,
      context: { params: Promise<{ action: string }> | { action: string } }
    ): Promise<Response> => {
      const { NextResponse } = await import("next/server");
      const params = await Promise.resolve(context.params);
      const action = params.action;

      // ── /api/auth/login ─────────────────────────────────────────────────────
      if (action === "login") {
        const body = await req.json();
        const fetchFn = config.fetchFn ?? fetch;

        const res = await fetchFn(`${config.baseUrl}${config.endpoints.login}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const text = await res.text();
          return NextResponse.json({ error: text }, { status: res.status });
        }

        const data = (await res.json()) as LoginResponse<User>;
        const tokens = buildTokens(data, config);

        const encrypted = await encrypt(JSON.stringify(tokens), config.secret);
        const maxAge = tokens.refreshTokenExpiresAt
          ? Math.floor((tokens.refreshTokenExpiresAt - Date.now()) / 1000)
          : 604800;

        const secure = config.token.secure !== false ? "Secure; " : "";
        const sameSite = config.token.sameSite ?? "lax";

        // Fetch user from /me endpoint if not included in login response
        let user: User | null = data.user ?? null;
        if (!user && config.endpoints.me) {
          try {
            const meRes = await fetchFn(`${config.baseUrl}${config.endpoints.me}`, {
              headers: { Authorization: `Bearer ${tokens.accessToken}` },
            });
            if (meRes.ok) user = (await meRes.json()) as User;
          } catch {
            // User fetch failed — continue without user data
          }
        }

        return NextResponse.json(
          { ok: true, user },
          {
            headers: {
              "Set-Cookie": [
                `${cookieName}=${encodeURIComponent(encrypted)}`,
                `HttpOnly`,
                `Max-Age=${maxAge}`,
                `Path=/`,
                `SameSite=${sameSite}`,
                secure,
              ]
                .filter(Boolean)
                .join("; "),
            },
          }
        );
      }

      // ── /api/auth/logout ────────────────────────────────────────────────────
      if (action === "logout") {
        if (config.endpoints.logout) {
          try {
            const fetchFn = config.fetchFn ?? fetch;
            await fetchFn(`${config.baseUrl}${config.endpoints.logout}`, {
              method: "POST",
            });
          } catch {
            // Best-effort
          }
        }

        return NextResponse.json(
          { ok: true },
          {
            headers: {
              "Set-Cookie": `${cookieName}=; Max-Age=0; Path=/`,
            },
          }
        );
      }

      // ── /api/auth/refresh ───────────────────────────────────────────────────
      if (action === "refresh") {
        const raw = req.cookies.get(cookieName)?.value;
        if (!raw) {
          return NextResponse.json({ error: "No session" }, { status: 401 });
        }

        let tokens: AuthTokens;
        try {
          const json = await decrypt(decodeURIComponent(raw), config.secret);
          tokens = JSON.parse(json) as AuthTokens;
        } catch {
          return NextResponse.json({ error: "Invalid session" }, { status: 401 });
        }

        if (tokens.refreshTokenExpiresAt && Date.now() >= tokens.refreshTokenExpiresAt) {
          return NextResponse.json({ error: "Refresh token expired" }, { status: 401 });
        }

        const fetchFn = config.fetchFn ?? fetch;
        const res = await fetchFn(`${config.baseUrl}${config.endpoints.refresh}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        });

        if (!res.ok) {
          return NextResponse.json({ error: "Refresh failed" }, { status: res.status });
        }

        const data = (await res.json()) as LoginResponse<User>;
        const newTokens = buildTokens(data, config);

        const encrypted = await encrypt(JSON.stringify(newTokens), config.secret);
        const maxAge = newTokens.refreshTokenExpiresAt
          ? Math.floor((newTokens.refreshTokenExpiresAt - Date.now()) / 1000)
          : 604800;

        const secure = config.token.secure !== false ? "Secure; " : "";
        const sameSite = config.token.sameSite ?? "lax";

        return NextResponse.json(
          { ok: true },
          {
            headers: {
              "Set-Cookie": [
                `${cookieName}=${encodeURIComponent(encrypted)}`,
                `HttpOnly`,
                `Max-Age=${maxAge}`,
                `Path=/`,
                `SameSite=${sameSite}`,
                secure,
              ]
                .filter(Boolean)
                .join("; "),
            },
          }
        );
      }

      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    },

    GET: async (
      req: NextRequest,
      context: { params: Promise<{ action: string }> | { action: string } }
    ): Promise<Response> => {
      const { NextResponse } = await import("next/server");
      const params = await Promise.resolve(context.params);
      const action = params.action;

      // ── /api/auth/session ───────────────────────────────────────────────────
      if (action === "session") {
        const raw = req.cookies.get(cookieName)?.value;
        if (!raw) {
          return NextResponse.json({ user: null, isAuthenticated: false });
        }

        let tokens: AuthTokens;
        try {
          const json = await decrypt(decodeURIComponent(raw), config.secret);
          tokens = JSON.parse(json) as AuthTokens;
        } catch {
          return NextResponse.json({ user: null, isAuthenticated: false });
        }

        const refreshExpired = tokens.refreshTokenExpiresAt
          ? Date.now() >= tokens.refreshTokenExpiresAt
          : false;

        if (refreshExpired) {
          return NextResponse.json({ user: null, isAuthenticated: false });
        }

        // Fetch user from backend
        let user: User | null = null;
        if (config.endpoints.me) {
          try {
            const fetchFn = config.fetchFn ?? fetch;
            const res = await fetchFn(`${config.baseUrl}${config.endpoints.me}`, {
              headers: { Authorization: `Bearer ${tokens.accessToken}` },
            });
            if (res.ok) user = (await res.json()) as User;
          } catch {
            // User fetch failed — still return authenticated: true if tokens are valid
          }
        }

        return NextResponse.json({ user, isAuthenticated: true });
      }

      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildTokens<User>(
  data: LoginResponse<User>,
  config: AuthConfig<User>
): AuthTokens {
  const strategy = config.expiry?.strategy ?? "hybrid";
  const configAccess = config.expiry?.accessTokenExpiresIn;
  const configRefresh = config.expiry?.refreshTokenExpiresIn;

  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    accessTokenExpiresAt: resolveAccessTokenExpiry(data, configAccess, strategy),
    refreshTokenExpiresAt: resolveRefreshTokenExpiry(data, configRefresh, strategy),
  };
}
