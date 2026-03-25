"use client";

import React from "react";
import { useRequireAuth } from "../react/hooks/useRequireAuth";
import { useSession } from "../react/hooks/useSession";

/**
 * Protected page — redirects to /login if not authenticated.
 */
export default function DashboardPage() {
  // Redirects unauthenticated users automatically
  useRequireAuth({ redirectTo: "/login" });

  const { user, isAuthenticated } = useSession();

  if (!isAuthenticated) return null;

  return (
    <main>
      <h1>Dashboard</h1>
      <p>Welcome, {(user as { name?: string })?.name ?? "User"}</p>
    </main>
  );
}
