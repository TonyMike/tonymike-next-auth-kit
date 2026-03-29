"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { AuthSession, ClientAuthConfig, LoginInput } from "../types";

// ─── Context ──────────────────────────────────────────────────────────────────

interface AuthContextValue<User = unknown> {
  session: AuthSession<User>;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

interface AuthProviderProps {
  config: ClientAuthConfig;
  children: React.ReactNode;
}

export function AuthProvider({ config, children }: AuthProviderProps) {
  const [session, setSession] = useState<AuthSession>({
    user: null,
    tokens: null,
    isAuthenticated: false,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Initialize session on mount
  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setSession({
            user: data.user ?? null,
            tokens: null, // tokens are HttpOnly, never exposed to client
            isAuthenticated: data.isAuthenticated ?? false,
          });
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSession({ user: null, tokens: null, isAuthenticated: false });
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-refresh timer
  useEffect(() => {
    if (!config.autoRefresh) return;

    const interval = setInterval(async () => {
      if (session.isAuthenticated) {
        try {
          await fetch("/api/auth/refresh", { method: "POST" });
          const updated = await fetch("/api/auth/session").then((r) => r.json());
          setSession({
            user: updated.user ?? null,
            tokens: null,
            isAuthenticated: updated.isAuthenticated ?? false,
          });
        } catch {
          // Refresh failed — session will be cleared on next page load
        }
      }
    }, (config.refreshThreshold ?? 60) * 1000);

    return () => clearInterval(interval);
  }, [config.autoRefresh, config.refreshThreshold, session.isAuthenticated]);

  const login = useCallback(
    async (input: LoginInput) => {
      setIsLoading(true);
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });

        if (!res.ok) {
          const { error } = await res.json();
          throw new Error(error ?? "Login failed");
        }

        const { user } = await res.json();
        const newSession = { user, tokens: null, isAuthenticated: true };
        setSession(newSession);
        config.onLogin?.(newSession);
      } finally {
        setIsLoading(false);
      }
    },
    [config]
  );

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setSession({ user: null, tokens: null, isAuthenticated: false });
    config.onLogout?.();
  }, [config]);

  const refresh = useCallback(async () => {
    await fetch("/api/auth/refresh", { method: "POST" });
    const updated = await fetch("/api/auth/session").then((r) => r.json());
    setSession({
      user: updated.user ?? null,
      tokens: null,
      isAuthenticated: updated.isAuthenticated ?? false,
    });
  }, []);

  const value: AuthContextValue = {
    session,
    isLoading,
    login,
    logout,
    refresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Internal hook ────────────────────────────────────────────────────────────

export function useAuthContext<User = unknown>(): AuthContextValue<User> {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuthContext must be used within <AuthProvider>");
  }
  return ctx as AuthContextValue<User>;
}
