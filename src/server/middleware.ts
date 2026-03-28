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
 *   matcher: ["/dashboard/:path*", "/login", "/register"],
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

    // Resolve whether the session is valid
    const isAuthenticated = await checkSession(cookieValue, authConfig.secret);

    // ── Guest-only routes (e.g. /login, /register) ──────────────────────────
    // Accessible only when NOT authenticated. Redirect authenticated users away.
    const guestOnlyRoutes = authConfig.routes?.guestOnly ?? [];
    if (isGuestOnlyRoute(pathname, guestOnlyRoutes)) {
      if (isAuthenticated) {
        const redirectTo = authConfig.routes?.redirectAuthenticatedTo ?? "/dashboard";
        return NextResponse.redirect(new URL(redirectTo, request.nextUrl.origin));
      }
      return NextResponse.next();
    }

    // ── Public routes ────────────────────────────────────────────────────────
    // Always accessible regardless of auth state.
    const publicRoutes = authConfig.routes?.public ?? [];
    if (isPublicRoute(pathname, publicRoutes)) {
      return NextResponse.next();
    }

    // ── Protected routes ─────────────────────────────────────────────────────
    const protectedRoutes = authConfig.routes?.protected ?? [];
    const requiresAuth =
      protectedRoutes.length === 0 || isProtectedRoute(pathname, protectedRoutes);

    if (!requiresAuth) {
      return NextResponse.next();
    }

    if (!isAuthenticated) {
      return redirectToLogin(request, NextResponse);
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
  return routes.some((route) => matchRoute(pathname, route));
}

function isPublicRoute(pathname: string, publicRoutes: string[]): boolean {
  return publicRoutes.some((route) => matchRoute(pathname, route));
}

function isProtectedRoute(pathname: string, protectedRoutes: string[]): boolean {
  return protectedRoutes.some((route) => matchRoute(pathname, route));
}

function matchRoute(pathname: string, pattern: string): boolean {
  if (pattern.endsWith("*")) {
    return pathname.startsWith(pattern.slice(0, -1));
  }
  return pathname === pattern;
}

function redirectToLogin(
  request: { nextUrl: { origin: string } },
  NextResponse: { redirect(url: URL): Response }
): Response {
  return NextResponse.redirect(new URL("/login", request.nextUrl.origin));
}
