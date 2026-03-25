import type { AuthConfig } from "../types";

interface User {
  id: string;
  email: string;
  name: string;
}

/**
 * Shared auth configuration — import this wherever you need it.
 */
export const authConfig: AuthConfig<User> = {
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "https://api.example.com",

  endpoints: {
    login: "/auth/login",
    register: "/auth/register",
    refresh: "/auth/refresh",
    logout: "/auth/logout",
    me: "/auth/me",
  },

  routes: {
    public: ["/", "/login", "/register", "/about"],
    protected: ["/dashboard/*", "/profile/*", "/settings/*"],
  },

  token: {
    storage: "cookie",
    cookieName: "myapp.session",
    secure: true,
    sameSite: "lax",
  },

  secret: process.env.AUTH_SECRET ?? "change-me-in-production-32chars!!",

  autoRefresh: true,
  refreshThreshold: 60, // refresh 60s before expiry

  expiry: {
    // Matches backend: JWT_ACCESS_EXPIRES_IN=2d, JWT_REFRESH_EXPIRES_IN=7d
    accessTokenExpiresIn: "2d",
    refreshTokenExpiresIn: "7d",
    strategy: "hybrid", // backend first, fallback to config
  },
};
