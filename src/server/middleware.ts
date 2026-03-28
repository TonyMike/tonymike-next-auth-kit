import type { AuthConfig } from "../types";
import { decrypt } from "../utils/crypto";
import type { AuthTokens } from "../types";

/**
 * Next.js middleware factory for route protection.
 *
 * @example
 * // middleware.ts (project root)
 * import { authMiddleware } from "next-token-auth/server";
 * import { authConfig } from "./lib/auth";
 *
 * export const middleware = authMiddleware(authConfig);
 *
 * export const config = {
 *   matcher: ["/auth/login", "/auth/register", "/dashboard*", "/profile*"],
 * };
 */
export function authMiddleware<User = unknown>(authConfig: AuthConfig<User>) {
  return async function middleware(request: {
    cookies: { get(name: string): { value: string } | undefined };
    nextUrl: { pathname: string; origin: string };
    url: string;
  }): Promise<Response> {
    const { NextResponse } = await import("next/server");

    const pathname = request.nextUrl.pathname;
    const cookieName = authConfig.token.cookieName ?? "next-token-auth.session";
    const cookieValue = request.cookies.get(cookieName)?.value;

    const isAuthenticated = await checkSession(cookieValue, authConfig.secret);

    // ── Guest-only routes ────────────────────────────────────────────────────
    // Accessible only when NOT authenticated.
    // Authenticated users are redirected to redirectAuthenticatedTo.
    const guestOnlyRoutes = authConfig.routes?.guestOnly ?? [];
    if (isGuestOnlyRoute(pathname, guestOnlyRoutes)) {
      if (isAuthenticated) {
        const redirectTo = authConfig.routes?.redirectAuthenticatedTo ?? "/dashboard";
        return NextResponse.redirect(new URL(redirectTo, request.nextUrl.origin));
      }
      return NextResponse.next();
    }

    // ── Public routes ────────────────────────────────────────────────────────
    const publicRoutes = authConfig.routes?.public ?? [];
    if (matchesAny(pathname, publicRoutes)) {
      return NextResponse.next();
    }

    // ── Protected routes ─────────────────────────────────────────────────────
    const protectedRoutes = authConfig.routes?.protected ?? [];
    const requiresAuth =
      protectedRoutes.length === 0 || matchesAny(pathname, protectedRoutes);

    if (!requiresAuth) {
      return NextResponse.next();
    }

    if (!isAuthenticated) {
      // Use the configured login endpoint path, falling back to "/login"
      const loginPath = authConfig.routes?.loginPath ?? "/login";
      return NextResponse.redirect(new URL(loginPath, request.nextUrl.origin));
    }

    return NextResponse.next();
  };
}

// ─── Session check ────────────────────────────────────────────────────────────

async function checkSession(
  cookieValue: string | undefined,
  secret: string
): Promise<boolean> {
  if (!cookieValue) return false;

  try {
    const json = await decrypt(cookieValue, secret);
    const tokens = JSON.parse(json) as AuthTokens;
    const now = Date.now();
    const refreshExpired = tokens.refreshTokenExpiresAt
      ? now >= tokens.refreshTokenExpiresAt
      : false;
    return !refreshExpired;
  } catch {
    return false;
  }
}

// ─── Route matchers ───────────────────────────────────────────────────────────

function isGuestOnlyRoute(pathname: string, routes: string[]): boolean {
  return matchesAny(pathname, routes);
}

/**
 * Matches a pathname against a list of patterns.
 * Supports wildcards: "/dashboard*" matches "/dashboard", "/dashboard/", "/dashboard/settings"
 */
function matchesAny(pathname: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchRoute(pathname, pattern));
}

function matchRoute(pathname: string, pattern: string): boolean {
  if (pattern.endsWith("*")) {
    const base = pattern.slice(0, -1); // e.g. "/dashboard"
    // matches "/dashboard", "/dashboard/", "/dashboard/anything"
    return pathname === base || pathname.startsWith(base + "/") || pathname.startsWith(base);
  }
  return pathname === pattern;
}
