"use client";

import type { AuthSession } from "../../types";
import { useAuthContext } from "../AuthProvider";

/**
 * Returns the current auth session without exposing login/logout actions.
 *
 * @example
 * const { user, isAuthenticated } = useSession();
 */
export function useSession<User = unknown>(): AuthSession<User> {
  return useAuthContext<User>().session;
}
