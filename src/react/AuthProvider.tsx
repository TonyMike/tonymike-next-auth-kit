"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AuthClient } from "../core/AuthClient";
import type { AuthConfig, AuthSession, LoginInput } from "../types";

// ─── Context ──────────────────────────────────────────────────────────────────

interface AuthContextValue<User = unknown> {
  session: AuthSession<User>;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  /** The underlying AuthClient for advanced use cases */
  client: AuthClient<User>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

interface AuthProviderProps<User = unknown> {
  config: AuthConfig<User>;
  children: React.ReactNode;
}

export function AuthProvider<User = unknown>({
  config,
  children,
}: AuthProviderProps<User>) {
  const clientRef = useRef<AuthClient<User> | null>(null);

  if (!clientRef.current) {
    clientRef.current = new AuthClient<User>(config);
  }

  const client = clientRef.current;

  const [session, setSession] = useState<AuthSession<User>>({
    user: null,
    tokens: null,
    isAuthenticated: false,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Initialize session on mount
  useEffect(() => {
    let cancelled = false;

    client.initialize().then((s) => {
      if (!cancelled) {
        setSession(s);
        setIsLoading(false);
      }
    });

    // Subscribe to session changes
    const unsubscribe = client.subscribe((s) => {
      if (!cancelled) setSession(s);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [client]);

  // Auto-refresh timer
  useEffect(() => {
    if (!config.autoRefresh) return;

    const interval = setInterval(async () => {
      const tokens = client.tokenManager.getTokens();
      if (
        tokens &&
        client.tokenManager.isAccessExpired(tokens) &&
        !client.tokenManager.isRefreshExpired(tokens)
      ) {
        await client.refresh();
      }
    }, 30_000); // check every 30s

    return () => clearInterval(interval);
  }, [client, config.autoRefresh]);

  const login = useCallback(
    async (input: LoginInput) => {
      setIsLoading(true);
      try {
        const s = await client.login(input);
        setSession(s);
      } finally {
        setIsLoading(false);
      }
    },
    [client]
  );

  const logout = useCallback(async () => {
    await client.logout();
    setSession({ user: null, tokens: null, isAuthenticated: false });
  }, [client]);

  const refresh = useCallback(async () => {
    await client.refresh();
    setSession(client.getSession());
  }, [client]);

  const value: AuthContextValue<User> = {
    session,
    isLoading,
    login,
    logout,
    refresh,
    client,
  };

  return (
    <AuthContext.Provider value={value as AuthContextValue}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Internal hook ────────────────────────────────────────────────────────────

export function useAuthContext<User = unknown>(): AuthContextValue<User> {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuthContext must be used within <AuthProvider>");
  }
  return ctx as AuthContextValue<User>;
}
