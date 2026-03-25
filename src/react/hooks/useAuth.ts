"use client";

import type { AuthSession, LoginInput } from "../../types";
import { useAuthContext } from "../AuthProvider";

export interface UseAuthReturn<User = unknown> {
  session: AuthSession<User>;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  isLoading: boolean;
}

/**
 * Primary hook for authentication operations.
 *
 * @example
 * const { session, login, logout, isLoading } = useAuth();
 */
export function useAuth<User = unknown>(): UseAuthReturn<User> {
  const { session, login, logout, refresh, isLoading } =
    useAuthContext<User>();

  return { session, login, logout, refresh, isLoading };
}
