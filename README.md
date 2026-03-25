# next-auth-kit

Production-grade authentication library for Next.js (App Router & Pages Router).

## Features

- Access token + refresh token lifecycle management
- Works on client-side and server-side (SSR/App Router)
- React `AuthProvider` + `useAuth`, `useSession`, `useRequireAuth` hooks
- Configurable backend API endpoints
- Secure session management (AES-GCM encrypted cookies)
- Expiry formats: `"15m"`, `"2h"`, `"2d"`, `"7d"`, `"1w"` or plain seconds
- Three expiry strategies: `"backend"`, `"config"`, `"hybrid"`
- Auto-refresh with deduplication
- Next.js middleware for route protection
- Fully typed (TypeScript-first)

---

## Installation

```bash
pnpm add next-auth-kit
```

---

## Quick Start

### 1. Create your config

```ts
// lib/auth.ts
import type { AuthConfig } from "next-auth-kit";

export const authConfig: AuthConfig = {
  baseUrl: process.env.NEXT_PUBLIC_API_URL!,
  endpoints: {
    login: "/auth/login",
    refresh: "/auth/refresh",
    logout: "/auth/logout",
    me: "/auth/me",
  },
  token: {
    storage: "cookie",
    cookieName: "myapp.session",
    secure: true,
    sameSite: "lax",
  },
  secret: process.env.AUTH_SECRET!,
  autoRefresh: true,
  expiry: {
    // Matches JWT_ACCESS_EXPIRES_IN=2d, JWT_REFRESH_EXPIRES_IN=7d
    accessTokenExpiresIn: "2d",
    refreshTokenExpiresIn: "7d",
    strategy: "hybrid",
  },
};
```

### 2. Wrap your app

```tsx
// app/layout.tsx
import { AuthProvider } from "next-auth-kit/react";
import { authConfig } from "@/lib/auth";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <AuthProvider config={authConfig}>{children}</AuthProvider>
      </body>
    </html>
  );
}
```

### 3. Use hooks

```tsx
// Login
const { login, isLoading } = useAuth();
await login({ email, password });

// Session
const { user, isAuthenticated } = useSession();

// Protect a page
useRequireAuth({ redirectTo: "/login" });
```

### 4. Server-side session

```ts
// app/dashboard/page.tsx
import { getServerSession } from "next-auth-kit/server";
import { cookies } from "next/headers";

export default async function Page() {
  const cookieStore = await cookies();
  const session = await getServerSession(
    { cookies: { get: (name) => cookieStore.get(name) } },
    authConfig
  );
  if (!session.isAuthenticated) redirect("/login");
}
```

### 5. Middleware

```ts
// middleware.ts
import { authMiddleware } from "next-auth-kit/server";
import { authConfig } from "@/lib/auth";

export const middleware = authMiddleware(authConfig);

export const config = {
  matcher: ["/dashboard/:path*"],
};
```

---

## Expiry Formats

| Input   | Resolved  |
|---------|-----------|
| `900`   | 900s      |
| `"15m"` | 900s      |
| `"2h"`  | 7200s     |
| `"2d"`  | 172800s   |
| `"7d"`  | 604800s   |
| `"1w"`  | 604800s   |

## Expiry Strategies

| Strategy   | Behaviour                                      |
|------------|------------------------------------------------|
| `backend`  | Trust `expiresIn` from API response only       |
| `config`   | Use `expiry` config values only                |
| `hybrid`   | Backend first, fallback to config (default)    |

---

## API Reference

### `AuthProvider`

| Prop     | Type         | Required |
|----------|--------------|----------|
| `config` | `AuthConfig` | ✓        |

### `useAuth()`

```ts
{
  session: AuthSession;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  isLoading: boolean;
}
```

### `useSession()`

Returns `AuthSession` — read-only.

### `useRequireAuth(options?)`

| Option              | Type         | Default    |
|---------------------|--------------|------------|
| `redirectTo`        | `string`     | `"/login"` |
| `onUnauthenticated` | `() => void` | —          |

### `getServerSession(req, config)`

Returns `Promise<AuthSession>`. Reads encrypted cookie, validates expiry, refreshes if needed.

### `authMiddleware(config)`

Returns a Next.js middleware function. Protects routes defined in `config.routes.protected`.

### `parseExpiry(input)`

```ts
parseExpiry("2d")  // → 172800
parseExpiry("7d")  // → 604800
parseExpiry(3600)  // → 3600
```

---

## Security Notes

- Refresh tokens are stored in encrypted `httpOnly`-style cookies (AES-GCM)
- Access tokens can be stored in memory (safest) or cookies
- The `secret` is used for AES-GCM encryption — use a 32-char random string in production
- CSRF protection relies on `SameSite` cookie policy
