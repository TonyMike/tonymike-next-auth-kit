# next-token-auth

A production-grade authentication library for Next.js. Handles access tokens, refresh tokens, session management, and route protection — so you don't have to wire it all up yourself.

Works with both the App Router and Pages Router. Fully typed with TypeScript.

> **Breaking change in v1.1.0:** The secret is now server-side only. You must split your config into `AuthConfig` (server) and `ClientAuthConfig` (client), and mount `createAuthHandlers` at `app/api/auth/[action]/route.ts`. See the Quick Start below.

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

### 1. Create your server config

```ts
// lib/auth.ts (SERVER-SIDE ONLY — never import in client components)
import type { AuthConfig } from "next-token-auth";

interface User {
  id: string;
  email: string;
  name: string;
}

export const authConfig: AuthConfig<User> = {
  baseUrl: process.env.API_URL!,  // No NEXT_PUBLIC_ prefix needed

  endpoints: {
    login: "/auth/login",
    refresh: "/auth/refresh",
    logout: "/auth/logout",
    me: "/auth/me",
  },

  routes: {
    public: ["/", "/about"],
    guestOnly: ["/login", "/register"],
    protected: ["/dashboard*"],
    loginPath: "/login",
    redirectAuthenticatedTo: "/dashboard",
  },

  token: {
    storage: "cookie",
    cookieName: "myapp.session",
    secure: true,
    sameSite: "lax",
  },

  secret: process.env.AUTH_SECRET!,  // SERVER-SIDE ONLY

  autoRefresh: true,

  expiry: {
    accessTokenExpiresIn: "2d",
    refreshTokenExpiresIn: "7d",
    strategy: "hybrid",
  },
};
```

### 2. Create your client config

```ts
// lib/auth.client.ts (safe to import anywhere, including client components)
import type { ClientAuthConfig } from "next-token-auth";

export const clientAuthConfig: ClientAuthConfig = {
  token: {
    cookieName: "myapp.session",
  },
  autoRefresh: true,
};
```

### 3. Mount the Route Handlers

```ts
// app/api/auth/[action]/route.ts
import { createAuthHandlers } from "next-token-auth/server";
import { authConfig } from "@/lib/auth";

export const { GET, POST } = createAuthHandlers(authConfig);
```

This creates four endpoints automatically:
- `POST /api/auth/login` — authenticates and sets HttpOnly cookie
- `POST /api/auth/logout` — clears the session cookie
- `POST /api/auth/refresh` — refreshes the access token
- `GET /api/auth/session` — returns current user and auth status

### 4. Wrap your app with `AuthProvider`

```tsx
// app/layout.tsx
import { AuthProvider } from "next-token-auth/react";
import { clientAuthConfig } from "@/lib/auth.client";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider config={clientAuthConfig}>{children}</AuthProvider>
      </body>
    </html>
  );
}
```

### 5. Use the hooks

```tsx
"use client";

import { useAuth } from "next-token-auth/react";

export default function LoginPage() {
  const { login, isLoading } = useAuth();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await login({ email: form.get("email"), password: form.get("password") });
    window.location.href = "/dashboard";
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

Wrap your application once at the root. It calls `/api/auth/session` on mount to restore the session from the HttpOnly cookie, then subscribes to session changes.

```tsx
<AuthProvider config={clientAuthConfig}>
  {children}
</AuthProvider>
```

When `autoRefresh: true` is set, the provider calls `/api/auth/refresh` periodically based on `refreshThreshold`.

#### Client config reference (`ClientAuthConfig`)

This is what you pass to `AuthProvider` — it does NOT contain `secret` or `baseUrl`.

```ts
interface ClientAuthConfig {
  token?: {
    cookieName?: string;   // default: "next-token-auth.session"
  };

  routes?: {
    loginPath?: string;   // where to redirect unauthenticated users (default: "/login")
    redirectAuthenticatedTo?: string; // where to redirect authenticated users on guestOnly routes (default: "/dashboard")
  };

  autoRefresh?: boolean;  // automatically refresh tokens before expiry

  refreshThreshold?: number; // seconds before expiry to trigger refresh (default: 60)

  // Lifecycle callbacks
  onLogin?: (session: AuthSession) => void;
  onLogout?: () => void;
}
```

#### Server config reference (`AuthConfig`)

This is used in `createAuthHandlers`, `authMiddleware`, `getServerSession`, and `withAuth`. Never import this in a client component.

```ts
interface AuthConfig<User = unknown> {
  baseUrl: string;  // Backend API base URL (no NEXT_PUBLIC_ needed)

  endpoints: {
    login: string;       // required
    refresh: string;     // required
    register?: string;
    logout?: string;
    me?: string;         // fetched to populate session.user
  };

  routes?: {
    public: string[];     // always accessible
    protected: string[];  // require auth, supports wildcard: "/dashboard*"
    guestOnly?: string[]; // only accessible when NOT authenticated
    loginPath?: string;   // where to redirect unauthenticated users (default: "/login")
    redirectAuthenticatedTo?: string; // where to redirect authenticated users on guestOnly routes (default: "/dashboard")
  };

  token: {
    storage: "cookie" | "memory";
    cookieName?: string;
    secure?: boolean;      // default: true
    sameSite?: "strict" | "lax" | "none"; // default: "lax"
  };

  secret: string;  // AES-GCM encryption key — SERVER-SIDE ONLY

  autoRefresh?: boolean;
  refreshThreshold?: number;

  expiry?: {
    accessTokenExpiresIn?: number | string;  // e.g. "2d", 3600
    refreshTokenExpiresIn?: number | string; // e.g. "7d"
    strategy?: "backend" | "config" | "hybrid"; // default: "hybrid"
  };

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
| `session`   | `AuthSession<User>`                     | Current auth session (user + isAuthenticated)    |
| `login`     | `(input: LoginInput) => Promise<void>`  | POST to `/api/auth/login`, sets HttpOnly cookie  |
| `logout`    | `() => Promise<void>`                   | POST to `/api/auth/logout`, clears cookie        |
| `refresh`   | `() => Promise<void>`                   | POST to `/api/auth/refresh`, updates cookie      |
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

Since tokens are stored in HttpOnly cookies (inaccessible to JavaScript), you cannot manually add `Authorization` headers from the client. Instead, your backend API routes should read the session cookie and extract the access token server-side.

For client-side requests to your own API:

```ts
"use client";

export default function Orders() {
  async function fetchOrders() {
    // The session cookie is automatically sent with this request
    const res = await fetch("/api/orders");
    const data = await res.json();
    console.log(data);
  }

  return <button onClick={fetchOrders}>Load Orders</button>;
}
```

Then in your API route, read the session:

```ts
// app/api/orders/route.ts
import { getServerSession } from "next-token-auth/server";
import { authConfig } from "@/lib/auth";
import { cookies } from "next/headers";

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const session = await getServerSession(
    { cookies: { get: (name) => cookieStore.get(name) } },
    authConfig
  );

  if (!session.isAuthenticated) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use session.tokens.accessToken to call your backend
  const res = await fetch(`${authConfig.baseUrl}/orders`, {
    headers: { Authorization: `Bearer ${session.tokens!.accessToken}` },
  });

  return Response.json(await res.json());
}
```

This keeps tokens secure — they never leave the server.

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
// middleware.ts (Next.js 13–15) or proxy.ts (Next.js 16+)
import { authMiddleware } from "next-token-auth/server";
import { authConfig } from "@/lib/auth";

// Next.js 13–15
export const middleware = authMiddleware(authConfig);

// Next.js 16+
export const proxy = authMiddleware(authConfig);

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

Tokens are always stored in HttpOnly cookies (encrypted with AES-GCM). The `storage: "memory"` option is deprecated — HttpOnly cookies are more secure because JavaScript in the browser cannot access them.

The cookie is set by the `/api/auth/login` Route Handler (created via `createAuthHandlers`) and read by the middleware and `getServerSession`.

### Session restore on page load

When `AuthProvider` mounts, it calls `GET /api/auth/session`, which:

1. Reads the encrypted session cookie server-side
2. Decrypts it using your `secret`
3. Checks whether the refresh token is expired
4. If a `me` endpoint is configured, fetches the user profile
5. Returns `{ user, isAuthenticated }` to the client

The client never sees the raw tokens — only the user object and auth status.

### Automatic refresh

When `autoRefresh: true`, the provider calls `POST /api/auth/refresh` periodically (based on `refreshThreshold`, default 60 seconds before expiry). The Route Handler:

1. Reads the encrypted cookie
2. Checks if the refresh token is still valid
3. Calls your backend's refresh endpoint with the refresh token
4. Encrypts the new tokens and updates the HttpOnly cookie

### Refresh flow

```
Client detects expiry → POST /api/auth/refresh → backend refresh endpoint → new encrypted cookie set
```

If the refresh token is expired, the session is cleared.

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
  tokens: AuthTokens | null;  // always null on client-side (HttpOnly)
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

// Server-side config (used in createAuthHandlers, middleware, getServerSession)
interface AuthConfig<User = unknown> {
  baseUrl: string;
  secret: string;  // SERVER-SIDE ONLY
  endpoints: { login: string; refresh: string; logout?: string; me?: string };
  token: { storage: "cookie" | "memory"; cookieName?: string; secure?: boolean; sameSite?: string };
  routes?: { public: string[]; protected: string[]; guestOnly?: string[]; loginPath?: string; redirectAuthenticatedTo?: string };
  expiry?: { accessTokenExpiresIn?: number | string; refreshTokenExpiresIn?: number | string; strategy?: "backend" | "config" | "hybrid" };
  autoRefresh?: boolean;
  refreshThreshold?: number;
}

// Client-side config (used in AuthProvider)
interface ClientAuthConfig {
  token?: { cookieName?: string };
  routes?: { loginPath?: string; redirectAuthenticatedTo?: string };
  autoRefresh?: boolean;
  refreshThreshold?: number;
  onLogin?: (session: AuthSession) => void;
  onLogout?: () => void;
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

- All tokens are stored in HttpOnly cookies — JavaScript in the browser cannot read them
- Session cookies are AES-GCM encrypted server-side using your `secret`
- The `secret` never leaves the server — it's only used in Route Handlers, middleware, and `getServerSession`
- `AuthProvider` receives `ClientAuthConfig` which does not contain `secret` or `baseUrl`
- Use a random 32-character string for `secret` in production — never commit it
- Cookies use `Secure` and `SameSite` flags by default for CSRF protection
- The `"memory"` storage mode is no longer recommended — HttpOnly cookies are more secure

---

## License

MIT
