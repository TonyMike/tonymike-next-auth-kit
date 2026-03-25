"use client";

import { useEffect } from "react";
import { useAuthContext } from "../AuthProvider";

export interface UseRequireAuthOptions {
  /** Path to redirect unauthenticated users to. @default "/login" */
  redirectTo?: string;
  /** Called when the user is not authenticated (use for custom redirect logic) */
  onUnauthenticated?: () => void;
}

/**
 * Redirects unauthenticated users to the login page.
 * Works with both Next.js App Router and Pages Router.
 *
 * @example
 * // App Router (client component)
 * useRequireAuth({ redirectTo: "/login" });
 *
 * @example
 * // Custom handler
 * useRequireAuth({ onUnauthenticated: () => router.push("/login") });
 */
export function useRequireAuth(options: UseRequireAuthOptions = {}): void {
  const { redirectTo = "/login", onUnauthenticated } = options;
  const { session, isLoading } = useAuthContext();

  useEffect(() => {
    if (isLoading) return;
    if (session.isAuthenticated) return;

    if (onUnauthenticated) {
      onUnauthenticated();
      return;
    }

    // Works in both App Router and Pages Router environments
    if (typeof window !== "undefined") {
      window.location.href = redirectTo;
    }
  }, [session.isAuthenticated, isLoading, redirectTo, onUnauthenticated]);
}
