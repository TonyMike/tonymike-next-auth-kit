# next-token-auth

A production-grade authentication library for Next.js. Handles access tokens, refresh tokens, session management, and route protection — so you don't have to wire it all up yourself.

Works with both the App Router and Pages Router. Fully typed with TypeScript.

---

## The Problem

Authentication in Next.js involves a lot of moving parts:

- Storing tokens securely
- Refreshing access tokens before they expire
- Keeping client and server sessions in sync
- Protecting routes on both the client and server
- Wiring up login, logout, and user fetching from scratch

Most projects end up with hundreds of lines of boilerplate before a single feature is built.

---

## The Solution

`next-token-auth` gives you a single `AuthProvider` and a set of hooks that handle the entire auth lifecycle. You configure your API endpoints once, and the library takes care of the rest:

- Tokens are stored in cookies or memory
- Access tokens are automatically refreshed before they expire
- Sessions are restored on page load from stored tokens
- Routes can be protected client-side with a hook or server-side with middleware
- Every API request made through the built-in fetch wrapper gets a `Bearer` token injected automatically

---

## Features

- `AuthProvider` — React context provider that initializes and manages auth state
- `useAuth` — login, logout, refresh, and session in one hook
- `useSession` — read-only access to the current session
- `useRequireAuth` — redirects unauthenticated users, works in App Router and Pages Router
- Token storage in cookies or in-memory
- AES-GCM encrypted session cookies (server-side)
- Automatic access token refresh on a 30-second interval (when `autoRefresh` is enabled)
- 401 → refresh → retry built into the HTTP client
- `getServerSession` — read and validate the session in server components and API routes
- `withAuth` — higher-order function to protect App Router route handlers
- `authMiddleware` — Next.js middleware factory for edge-level route protection with guest-only route support
- Flexible expiry parsing: `"15m"`, `"2h"`, `"2d"`, `"7d"`, `"1w"`, or plain seconds
- Three expiry strategies: `backend`, `config`, `hybrid`
- Fully typed with TypeScript generics for custom user shapes

---

## Installation

```bash
npm install next-token-auth
# or
yarn add next-token-auth
# or
pnpm add next-token-auth
# or
bun add next-token-auth
```

**Peer dependencies** (already installed in any Next.js project):

```
next >= 13
react >= 18
react-dom >= 18
```

---

## Quick Start

### 1. Create your config

```ts
// lib/auth.ts
import type { AuthConfig } from "next-token-auth";

interface User {
  id: string;
  email: string;
  name: string;
}

export const authConfig: AuthConfig<User> = {
  baseUrl: process.env.NEXT_PUBLIC_API_URL!,

  endpoints: {
    login: "/auth/login",
    refresh: "/auth/refresh",
    logout: "/auth/logout",
    me: "/auth/me",
  },

  routes: {
    public: ["/", "/about"],
    guestOnly: ["/login", "/register"],
    protected: ["/dashboard/*"],
    redirectAuthenticatedTo: "/dashboard",
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
    accessTokenExpiresIn: "2d",
    refreshTokenExpiresIn: "7d",
    strategy: "hybrid",
  },
};
```

### 2. Wrap your app with `AuthProvider`

```tsx
// app/layout.tsx
import { AuthProvider } from "next-token-auth/react";
import { authConfig } from "@/lib/auth";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider config={authConfig}>{children}</AuthProvider>
      </body>
    </html>
  );
}
```

### 3. Use the hooks

```tsx
"use client";

import { useAuth } from "next-token-auth/react";

export default function LoginPage() {
  const { login, isLoading } = useAuth();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await login({ email: form.get("email"), password: form.get("password") });
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="email" type="email" required />
      <input name="password" type="password" required />
      <button type="submit" disabled={isLoading}>
        {isLoading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
```

---

## Usage

### `AuthProvider`

Wrap your application once at the root. It initializes the `AuthClient`, restores any existing session from stored tokens on mount, and subscribes all child hooks to session changes.

```tsx
<AuthProvider config={authConfig}>
  {children}
</AuthProvider>
```

When `autoRefresh: true` is set, the provider checks every 30 seconds whether the access token is near expiry and refreshes it silently in the background.

#### Full config reference

```ts
interface AuthConfig<User = unknown> {
  // Base URL of your backend API
  baseUrl: string;

  endpoints: {
    login: string;       // required
    refresh: string;     // required
    register?: string;
    logout?: string;
    me?: string;         // fetched after login/session restore to populate user
  };

  routes?: {
    public: string[];     // always accessible regardless of auth state
    protected: string[];  // require auth, supports wildcard: "/dashboard*"
    guestOnly?: string[]; // only accessible when NOT authenticated — any route name works
    loginPath?: string;   // where to redirect unauthenticated users (default: "/login")
    redirectAuthenticatedTo?: string; // where to send authenticated users who hit a guestOnly route (default: "/dashboard")
  };

  token: {
    storage: "cookie" | "memory";
    cookieName?: string;   // default: "next-token-auth.session"
    secure?: boolean;      // default: true
    sameSite?: "strict" | "lax" | "none"; // default: "lax"
  };

  // Used to AES-GCM encrypt session cookies server-side
  secret: string;

  // Automatically refresh the access token before it expires
  autoRefresh?: boolean;

  // Seconds before expiry to trigger a proactive refresh (default: 60)
  refreshThreshold?: number;

  expiry?: {
    accessTokenExpiresIn?: number | string;  // e.g. "2d", 3600
    refreshTokenExpiresIn?: number | string; // e.g. "7d"
    strategy?: "backend" | "config" | "hybrid"; // default: "hybrid"
  };

  // Provide a custom fetch implementation (e.g. for testing)
  fetchFn?: typeof fetch;

  // Lifecycle callbacks
  onLogin?: (session: AuthSession<User>) => void;
  onLogout?: () => void;
  onRefreshError?: (error: unknown) => void;
}
```

---

### `useAuth`

The primary hook. Gives you everything you need to build auth flows.

```ts
const { session, login, logout, refresh, isLoading } = useAuth<User>();
```

| Property    | Type                                    | Description                                      |
|-------------|-----------------------------------------|--------------------------------------------------|
| `session`   | `AuthSession<User>`                     | Current auth session                             |
| `login`     | `(input: LoginInput) => Promise<void>`  | POST to your login endpoint, stores tokens       |
| `logout`    | `() => Promise<void>`                   | Clears tokens, calls logout endpoint if set      |
| `refresh`   | `() => Promise<void>`                   | Manually trigger a token refresh                 |
| `isLoading` | `boolean`                               | `true` while initializing or during login        |

`LoginInput` is an open object (`{ [key: string]: unknown }`), so you can pass any fields your backend expects.

---

### `useSession`

Read-only access to the current session. Use this in components that only need to display user data.

```ts
const { user, tokens, isAuthenticated } = useSession<User>();
```

---

### `useRequireAuth`

Redirects unauthenticated users. Call it at the top of any protected client component.

```ts
useRequireAuth({ redirectTo: "/login" });
```

You can also pass a custom handler instead of a redirect path:

```ts
useRequireAuth({
  onUnauthenticated: () => router.push("/login?from=/dashboard"),
});
```

The hook waits for `isLoading` to be `false` before acting, so it won't flash a redirect during the initial session restore.

| Option              | Type         | Default    |
|---------------------|--------------|------------|
| `redirectTo`        | `string`     | `"/login"` |
| `onUnauthenticated` | `() => void` | —          |

---

### Making Authenticated API Requests

When you need to call your own backend endpoints that require an access token, use `client.fetch` from the `useAuth` hook. It automatically injects `Authorization: Bearer <token>` and handles 401 → refresh → retry for you.

```ts
"use client";

import { useAuth } from "next-token-auth/react";

export default function Orders() {
  const { client } = useAuth();

  async function fetchOrders() {
    const res = await client.fetch("https://api.example.com/orders");
    const data = await res.json();
    console.log(data);
  }

  return <button onClick={fetchOrders}>Load Orders</button>;
}
```

You can also read the token directly from the session if you need to pass it manually:

```ts
const { session } = useAuth();

const res = await fetch("https://api.example.com/orders", {
  headers: {
    Authorization: `Bearer ${session.tokens?.accessToken}`,
  },
});
```

`client.fetch` is the recommended approach — it keeps your requests resilient to token expiry without any extra work on your end.

---

### Protecting API Routes with `withAuth`

Wrap App Router route handlers to require authentication:

```ts
// app/api/profile/route.ts
import { withAuth } from "next-token-auth/server";
import { authConfig } from "@/lib/auth";

export const GET = withAuth(authConfig, async (req, session) => {
  return Response.json({ user: session.user });
});
```

Unauthenticated requests are redirected to `/login` by default. Pass `{ redirectTo: "/your-path" }` as the third argument to override.

---

### Middleware (Edge Route Protection)

Protect entire route groups at the edge using Next.js middleware. The middleware supports three route categories:

- `public` — always accessible, no auth check
- `protected` — requires authentication, redirects to `loginPath` if not
- `guestOnly` — accessible only when NOT authenticated; authenticated users are redirected to `redirectAuthenticatedTo`

You can use any route naming convention you want — the library doesn't enforce `/login`, `/dashboard`, or any specific path. Everything is driven by your config.

```ts
// lib/auth.ts
export const authConfig: AuthConfig = {
  // ...
  routes: {
    public: ["/", "/about"],
    guestOnly: ["/sign-in", "/sign-up"],   // any names you want
    protected: ["/app*", "/account*"],
    loginPath: "/sign-in",                 // where unauthenticated users are sent
    redirectAuthenticatedTo: "/app/home",  // where authenticated users are sent from guestOnly routes
  },
};
```

```ts
// middleware.ts (project root)
import { authMiddleware } from "next-token-auth/server";
import { authConfig } from "@/lib/auth";

export const middleware = authMiddleware(authConfig);

export const config = {
  matcher: ["/sign-in", "/sign-up", "/app*", "/account*"],
};
```

Some other valid setups:

```ts
// Using /auth/* convention
routes: {
  guestOnly: ["/auth/login", "/auth/register"],
  protected: ["/dashboard*"],
  loginPath: "/auth/login",
  redirectAuthenticatedTo: "/dashboard",
}

// Using a portal pattern
routes: {
  guestOnly: ["/portal"],
  protected: ["/admin*", "/workspace*"],
  loginPath: "/portal",
  redirectAuthenticatedTo: "/admin",
}
```

Route resolution order inside the middleware:

1. `guestOnly` — if authenticated, redirect to `redirectAuthenticatedTo`
2. `public` — always allow through
3. `protected` — require valid session, redirect to `loginPath` if missing

Two things to keep in mind:

- Wildcard patterns use `*` at the end: `"/dashboard*"` matches `/dashboard`, `/dashboard/`, and `/dashboard/settings`
- The `matcher` in `export const config` controls which routes Next.js runs the middleware on at all — make sure it covers both your protected and guest-only routes
- `loginPath` defaults to `"/login"` if not set
- `redirectAuthenticatedTo` defaults to `"/dashboard"` if not set

---

## Session and Token Handling

### How tokens are stored

| Storage mode | Where                                                                 |
|--------------|-----------------------------------------------------------------------|
| `"cookie"`   | Serialized as JSON in a browser cookie with `Secure` + `SameSite`    |
| `"memory"`   | Held in a JavaScript variable — cleared on page refresh               |

Server-side (in `getServerSession` and `authMiddleware`), the cookie value is expected to be AES-GCM encrypted using your `secret`. The `TokenManager` provides `encryptTokens` / `decryptTokens` helpers for this.

### Session restore on page load

When `AuthProvider` mounts, it calls `client.initialize()`, which:

1. Reads tokens from the configured storage
2. Checks whether the access token is expired (accounting for `refreshThreshold`)
3. If the access token is near expiry but the refresh token is still valid, it silently refreshes
4. If a `me` endpoint is configured, it fetches the user profile to populate `session.user`
5. Updates React state — `isLoading` flips to `false` once complete

### Automatic refresh

When `autoRefresh: true`, the provider runs a check every 30 seconds. If the access token is within `refreshThreshold` seconds of expiry (default: 60s) and the refresh token is still valid, it calls the refresh endpoint automatically.

The HTTP client also handles 401 responses: it attempts a token refresh and retries the original request once. Multiple concurrent 401s share a single refresh request (deduplicated via a shared promise).

### Refresh flow

```
Request → 401 → refresh endpoint → new tokens stored → original request retried
```

If the refresh token is expired, the user is logged out and the session is cleared.

---

## Server-Side Session (`getServerSession`)

Use this in App Router server components and API routes to read the session without going through the client:

```ts
// app/dashboard/page.tsx
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getServerSession } from "next-token-auth/server";
import { authConfig } from "@/lib/auth";

export default async function DashboardPage() {
  const cookieStore = await cookies();

  const session = await getServerSession(
    { cookies: { get: (name) => cookieStore.get(name) } },
    authConfig
  );

  if (!session.isAuthenticated) {
    redirect("/login");
  }

  return <h1>Welcome, {session.user.name}</h1>;
}
```

`getServerSession` decrypts the session cookie, validates expiry, and attempts a server-side token refresh if the access token is near expiry but the refresh token is still valid.

---

## Backend Requirements

Your API needs to implement the following contract:

### `POST /auth/login`

Request body: whatever fields you pass to `login()` (e.g. `{ email, password }`)

Response:

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": { "id": "1", "email": "user@example.com", "name": "Jane" },

  // Optional — used by "backend" and "hybrid" expiry strategies
  "accessTokenExpiresIn": "2d",
  "refreshTokenExpiresIn": "7d",

  // Legacy field, also accepted
  "expiresIn": 172800
}
```

### `POST /auth/refresh`

Request body:

```json
{ "refreshToken": "eyJ..." }
```

Response: same shape as the login response (new `accessToken` + `refreshToken`).

### `GET /auth/me` _(optional)_

Returns the current user object. Called after login and on session restore if the `me` endpoint is configured.

### `POST /auth/logout` _(optional)_

Called on logout. Failure is silently ignored — tokens are always cleared locally regardless.

---

## Expiry Formats

The `parseExpiry` utility accepts:

| Input   | Seconds   |
|---------|-----------|
| `900`   | 900       |
| `"15m"` | 900       |
| `"2h"`  | 7 200     |
| `"2d"`  | 172 800   |
| `"7d"`  | 604 800   |
| `"1w"`  | 604 800   |

### Expiry strategies

| Strategy  | Behaviour                                                        |
|-----------|------------------------------------------------------------------|
| `backend` | Use only the expiry values returned by the API                   |
| `config`  | Use only the values set in `expiry` config                       |
| `hybrid`  | API response first; fall back to config if not present (default) |

`hybrid` is the safest choice — it works whether or not your backend returns expiry fields.

---

## TypeScript Types

```ts
interface AuthSession<User = unknown> {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;   // Unix timestamp in ms
  refreshTokenExpiresAt?: number; // Unix timestamp in ms
}

interface LoginResponse<User = unknown> {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  accessTokenExpiresIn?: number | string;
  refreshTokenExpiresIn?: number | string;
}

type ExpiryInput = number | string;
type ExpiryStrategy = "backend" | "config" | "hybrid";
```

All types are exported from the root `next-token-auth` import.

---

## Who This Is For

- Developers building Next.js apps who want auth that just works
- Teams that need a consistent auth pattern across multiple projects
- Anyone tired of writing the same token refresh logic over and over
- SaaS and MVP builders who want to ship features, not auth plumbing

---

## Security Notes

- Session cookies use `Secure` and `SameSite` flags by default
- Server-side cookies are AES-GCM encrypted using your `secret`
- Use a random 32-character string for `secret` in production — never commit it
- The `"memory"` storage mode keeps tokens out of cookies entirely, at the cost of losing the session on page refresh
- Refresh tokens are never exposed to JavaScript when using server-side encrypted cookies

---

## License

MIT
