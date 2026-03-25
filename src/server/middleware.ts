import type { AuthConfig } from "../types";
import { decrypt } from "../utils/crypto";
import type { AuthTokens } from "../types";

/**
 * Next.js middleware factory for route protection.
 *
 * @example
 * // middleware.ts (project root)
 * import { authMiddleware } from "next-auth-kit/server";
 * import { config as authConfig } from "./lib/auth";
 *
 * export const middleware = authMiddleware(authConfig);
 *
 * export const config = {
 *   matcher: ["/dashboard/:path*", "/profile/:path*"],
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

    // Allow public routes
    const publicRoutes = authConfig.routes?.public ?? [];
    if (isPublicRoute(pathname, publicRoutes)) {
      return NextResponse.next();
    }

    // Check if route requires protection
    const protectedRoutes = authConfig.routes?.protected ?? [];
    const requiresAuth =
      protectedRoutes.length === 0 || isProtectedRoute(pathname, protectedRoutes);

    if (!requiresAuth) {
      return NextResponse.next();
    }

    // Validate session cookie
    const cookieName = authConfig.token.cookieName ?? "next-auth-kit.session";
    const cookieValue = request.cookies.get(cookieName)?.value;

    if (!cookieValue) {
      return redirectToLogin(request, NextResponse);
    }

    try {
      const json = await decrypt(cookieValue, authConfig.secret);
      const tokens = JSON.parse(json) as AuthTokens;

      const now = Date.now();
      const refreshExpired = tokens.refreshTokenExpiresAt
        ? now >= tokens.refreshTokenExpiresAt
        : false;

      if (refreshExpired) {
        return redirectToLogin(request, NextResponse);
      }

      return NextResponse.next();
    } catch {
      return redirectToLogin(request, NextResponse);
    }
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  const loginUrl = new URL("/login", request.nextUrl.origin);
  return NextResponse.redirect(loginUrl);
}
