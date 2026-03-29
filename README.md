# next-token-auth

A production-grade authentication library for Next.js that handles the hard parts of auth so you can focus on building features.

Works with both App Router and Pages Router. Fully typed with TypeScript.

> **Breaking change in v1.1.0:** The secret is now server-side only for security. You'll need to split your config and add one Route Handler file. See the Quick Start below — it takes 5 minutes.

---

## Why This Exists

Authentication in Next.js is tedious. You need to:

- Store tokens securely
- Refresh access tokens before they expire
- Keep client and server sessions in sync
- Protect routes on both the client and server
- Handle login, logout, and session restoration
- Wire up API calls with Bearer tokens

Most projects spend days on auth boilerplate before shipping a single feature.

`next-token-auth` gives you all of this in a single `AuthProvider` and a few hooks. Configure your API endpoints once, and the library handles the rest.

---

## What You Get

- One `<AuthProvider>` wrapper for your entire app
- Three hooks: `useAuth()`, `useSession()`, `useRequireAuth()`
- Automatic token refresh before expiry
- HttpOnly encrypted cookies (tokens never exposed to JavaScript)
- Server-side session validation via `getServerSession()`
- Next.js middleware for edge-level route protection
- Guest-only routes (redirect authenticated users away from login pages)
- Flexible expiry formats: `"15m"`, `"2h"`, `"2d"`, `"7d"`, or plain seconds
- Full TypeScript support with generics for your custom user shape

---

## Installation

```bash
npm install next-token-auth
```

Peer dependencies (already in any Next.js project):
- `next >= 15.5.14`
- `react >= 18`
- `react-dom >= 18`

---

## Quick Start

### Step 1: Create your server config

This file contains your `secret` and backend API URL. Never import it in client components.

```ts
// lib/auth.ts
import type { AuthConfig } from "next-token-auth";

interface User {
  id: string;
  email: string;
  name: string;
}

export const authConfig: AuthConfig<User> = {
  // Your backend API base URL (no NEXT_PUBLIC_ prefix needed)
  baseUrl: process.env.API_URL!,

  // Your backend auth endpoints
  endpoints: {
    login: "/auth/login",      // POST { email, password } → returns tokens + user
    refresh: "/auth/refresh",  // POST { refreshToken } → returns new tokens
    logout: "/auth/logout",    // POST (optional)
    me: "/auth/me",            // GET → returns user profile (optional)
  },

  // Route protection rules
  routes: {
    public: ["/", "/about"],              // always accessible
    guestOnly: ["/login", "/register"],   // only when NOT logged in
    protected: ["/dashboard*", "/profile*"], // requires auth
    loginPath: "/login",                  // where to send unauthenticated users
    redirectAuthenticatedTo: "/dashboard", // where to send authenticated users who hit guestOnly routes
  },

  // Token storage settings
  token: {
    storage: "cookie",
    cookieName: "myapp.session",
    secure: true,
    sameSite: "lax",
  },

  // Encryption secret (32+ random characters)
  secret: process.env.AUTH_SECRET!,

  // Auto-refresh tokens before they expire
  autoRefresh: true,

  // Token expiry (matches your backend JWT settings)
  expiry: {
    accessTokenExpiresIn: "2d",   // can also be a number in seconds
    refreshTokenExpiresIn: "7d",
    strategy: "hybrid",            // backend first, fallback to config
  },
};
```

**Important:** Use any route names you want. The library doesn't enforce `/login` or `/dashboard` — everything is driven by your config.

---

### Step 2: Create your client config

This is safe to import anywhere, including client components. It doesn't contain secrets.

```ts
// lib/auth.client.ts
import type { ClientAuthConfig } from "next-token-auth";

export const clientAuthConfig: ClientAuthConfig = {
  token: {
    cookieName: "myapp.session",  // must match server config
  },
  autoRefresh: true,
};
```

---

### Step 3: Mount the Route Handlers

Create this file to handle login, logout, refresh, and session endpoints automatically.

**Important:** The file path must be exactly `app/api/auth/[action]/route.ts` — the `[action]` part is a Next.js dynamic route segment (keep the square brackets as-is). Do not rename it.

```ts
// app/api/auth/[action]/route.ts
import { createAuthHandlers } from "next-token-auth/server";
import { authConfig } from "@/lib/auth";

export const { GET, POST } = createAuthHandlers(authConfig);
```

This creates four internal endpoints:
- `POST /api/auth/login` — authenticates and sets HttpOnly cookie
- `POST /api/auth/logout` — clears the session cookie
- `POST /api/auth/refresh` — refreshes the access token
- `GET /api/auth/session` — returns current user and auth status

Your `AuthProvider` calls these automatically. You never call them directly.

---

### Step 4: Wrap your app

```tsx
// app/layout.tsx
import { AuthProvider } from "next-token-auth/react";
import { clientAuthConfig } from "@/lib/auth.client";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider config={clientAuthConfig}>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
```

---

### Step 5: Build your login page

```tsx
// app/login/page.tsx
"use client";

import { useAuth } from "next-token-auth/react";
import { useState } from "react";

export default function LoginPage() {
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    try {
      await login({ email, password });
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        required
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        required
      />
      {error && <p style={{ color: "red" }}>{error}</p>}
      <button type="submit" disabled={isLoading}>
        {isLoading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
```

---

### Step 6: Protect a page

```tsx
// app/dashboard/page.tsx
"use client";

import { useRequireAuth, useSession } from "next-token-auth/react";

export default function DashboardPage() {
  // Redirects to /login if not authenticated
  useRequireAuth();

  const { user, isAuthenticated } = useSession();

  if (!isAuthenticated) return null; // while redirecting

  return (
    <main>
      <h1>Dashboard</h1>
      <p>Welcome, {user?.name}</p>
    </main>
  );
}
```

---

### Step 7: Add middleware (optional but recommended)

Protect routes at the edge for better performance and security.

```ts
// middleware.ts (project root, next to app/)
import { authMiddleware } from "next-token-auth/server";
import { authConfig } from "@/lib/auth";

export const middleware = authMiddleware(authConfig);

export const config = {
  // Run middleware on these routes
  matcher: ["/login", "/register", "/dashboard*", "/profile*"],
};
```

**Next.js 16+ users:** Rename the file to `proxy.ts` and export `proxy` instead of `middleware`:

```ts
// proxy.ts
export const proxy = authMiddleware(authConfig);
```

---

## How It Works

### The Flow

1. User submits login form → `useAuth().login()` is called
2. Client sends credentials to `POST /api/auth/login` (your Route Handler)
3. Route Handler calls your backend API, gets tokens back
4. Route Handler encrypts tokens with your `secret` and sets an HttpOnly cookie
5. Client receives `{ ok: true, user }` (no tokens — they're in the cookie)
6. `AuthProvider` updates state → `session.isAuthenticated = true`
7. On page reload, `AuthProvider` calls `GET /api/auth/session` to restore the session
8. Route Handler decrypts the cookie, validates expiry, fetches user profile, returns `{ user, isAuthenticated }`

### Why HttpOnly Cookies?

Tokens stored in HttpOnly cookies cannot be read by JavaScript, which protects against XSS attacks. The browser automatically sends the cookie with every request to your domain, so you don't need to manually attach tokens.

The downside: you can't call external APIs directly from the client with the access token. Instead, proxy through your own API routes (see "Making Authenticated API Requests" below).

### Why Split the Config?

If `secret` is in the client config, it gets bundled into your JavaScript and exposed to the browser. Splitting the config ensures the secret only exists server-side.

---

## API Reference

### `useAuth()`

The main hook for authentication operations.

```ts
const { session, login, logout, refresh, isLoading } = useAuth<User>();
```

| Property    | Type                                    | Description                                      |
|-------------|-----------------------------------------|--------------------------------------------------|
| `session`   | `AuthSession<User>`                     | Current user and auth status                     |
| `login`     | `(input: LoginInput) => Promise<void>`  | Authenticate user, sets HttpOnly cookie          |
| `logout`    | `() => Promise<void>`                   | Clears session, calls backend logout if configured |
| `refresh`   | `() => Promise<void>`                   | Manually refresh the access token                |
| `isLoading` | `boolean`                               | `true` during initialization or login            |

`LoginInput` is flexible — pass any fields your backend expects:

```ts
await login({ email, password });
await login({ username, password, rememberMe: true });
```

---

### `useSession()`

Read-only access to the current session. Use this in components that only display user data.

```ts
const { user, isAuthenticated } = useSession<User>();
```

Returns:
- `user` — your user object (or `null` if not authenticated)
- `tokens` — always `null` on the client (tokens are HttpOnly)
- `isAuthenticated` — `true` if the user is logged in

---

### `useRequireAuth(options?)`

Redirects unauthenticated users. Call it at the top of any protected client component.

```ts
useRequireAuth({ redirectTo: "/login" });
```

Options:

| Option              | Type         | Default    | Description                                      |
|---------------------|--------------|------------|--------------------------------------------------|
| `redirectTo`        | `string`     | `"/login"` | Where to send unauthenticated users              |
| `onUnauthenticated` | `() => void` | —          | Custom handler instead of redirect               |

The hook waits for `isLoading` to finish before redirecting, so you won't see a flash.

Custom redirect example:

```ts
import { useRouter } from "next/navigation";

useRequireAuth({
  onUnauthenticated: () => router.push("/login?from=/dashboard"),
});
```

---

### Making Authenticated API Requests

Since tokens are in HttpOnly cookies (inaccessible to JavaScript), you can't add `Authorization` headers from the client. Instead, proxy through your own API routes.

**Client-side:**

```ts
"use client";

export default function OrdersPage() {
  async function loadOrders() {
    // The session cookie is automatically sent with this request
    const res = await fetch("/api/orders");
    const data = await res.json();
    console.log(data);
  }

  return <button onClick={loadOrders}>Load Orders</button>;
}
```

**Server-side (your API route):**

```ts
// app/api/orders/route.ts
import { getServerSession } from "next-token-auth/server";
import { authConfig } from "@/lib/auth";
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();
  const session = await getServerSession(
    { cookies: { get: (name) => cookieStore.get(name) } },
    authConfig
  );

  if (!session.isAuthenticated) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Now call your backend with the access token
  const res = await fetch(`${authConfig.baseUrl}/orders`, {
    headers: {
      Authorization: `Bearer ${session.tokens!.accessToken}`,
    },
  });

  return Response.json(await res.json());
}
```

This keeps tokens secure — they never leave the server.

---

### `getServerSession(req, config)`

Reads and validates the session in server components and API routes.

```ts
// app/dashboard/page.tsx (server component)
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

What it does:
1. Reads the encrypted session cookie
2. Decrypts it using your `secret`
3. Validates token expiry
4. Optionally fetches the user profile from your backend
5. Returns `{ user, tokens, isAuthenticated }`

---

### `withAuth(config, handler, options?)`

Wraps App Router route handlers to require authentication.

```ts
// app/api/profile/route.ts
import { withAuth } from "next-token-auth/server";
import { authConfig } from "@/lib/auth";

export const GET = withAuth(authConfig, async (req, session) => {
  // session.user is guaranteed to exist here
  return Response.json({ user: session.user });
});
```

Unauthenticated requests are redirected to `/login` by default. Override with:

```ts
export const GET = withAuth(
  authConfig,
  async (req, session) => { /* ... */ },
  { redirectTo: "/sign-in" }
);
```

---

### `authMiddleware(config)`

Creates a Next.js middleware function for edge-level route protection.

```ts
// middleware.ts (project root, next to app/)
import { authMiddleware } from "next-token-auth/server";
import { authConfig } from "@/lib/auth";

export const middleware = authMiddleware(authConfig);

export const config = {
  matcher: ["/login", "/register", "/dashboard*", "/profile*"],
};
```

**Next.js 16+ users:** Rename the file to `proxy.ts` and change the export:

```ts
// proxy.ts
export const proxy = authMiddleware(authConfig);
```

---

## Route Protection Explained

The middleware supports three route categories:

### 1. Public routes

Always accessible, no auth check. Example: homepage, about page.

```ts
routes: {
  public: ["/", "/about", "/pricing"],
}
```

### 2. Protected routes

Require authentication. Unauthenticated users are redirected to `loginPath`.

```ts
routes: {
  protected: ["/dashboard*", "/settings*"],
  loginPath: "/login",  // where to send unauthenticated users
}
```

Wildcard matching:
- `"/dashboard*"` matches `/dashboard`, `/dashboard/`, `/dashboard/settings`
- `"/api/admin*"` matches `/api/admin`, `/api/admin/users`

### 3. Guest-only routes

Only accessible when NOT authenticated. Authenticated users are redirected away.

Use this for login and register pages so logged-in users can't access them.

```ts
routes: {
  guestOnly: ["/login", "/register"],
  redirectAuthenticatedTo: "/dashboard",  // where to send authenticated users
}
```

### Resolution order

When a request hits the middleware:

1. Check if it's a `guestOnly` route → if authenticated, redirect to `redirectAuthenticatedTo`
2. Check if it's a `public` route → always allow through
3. Check if it's a `protected` route → if not authenticated, redirect to `loginPath`

### Matcher vs routes config

The `matcher` in your middleware file controls which routes Next.js runs the middleware on at all:

```ts
export const config = {
  matcher: ["/login", "/dashboard*"],
};
```

If a route isn't in the `matcher`, the middleware never runs for it — so your `routes.protected` list won't help. Make sure the `matcher` covers all routes you want to protect or mark as guest-only.

---

## Session and Token Handling

### How tokens are stored

Tokens are stored in HttpOnly cookies, encrypted with AES-GCM. The cookie is set by the `/api/auth/login` Route Handler and read by the middleware and `getServerSession`.

JavaScript in the browser cannot read the cookie — only the server can decrypt it.

### Session restore on page load

When `AuthProvider` mounts, it calls `GET /api/auth/session`, which:

1. Reads the encrypted session cookie server-side
2. Decrypts it using your `secret`
3. Checks if the refresh token is expired
4. Fetches the user profile from your backend (if `me` endpoint is configured)
5. Returns `{ user, isAuthenticated }` to the client

The client never sees the raw tokens — only the user object and auth status.

### Automatic token refresh

When `autoRefresh: true`, the provider periodically calls `POST /api/auth/refresh` (based on `refreshThreshold`, default 60 seconds before expiry).

The Route Handler:
1. Reads the encrypted cookie
2. Checks if the refresh token is still valid
3. Calls your backend's refresh endpoint with the refresh token
4. Encrypts the new tokens and updates the HttpOnly cookie

If the refresh token is expired, the session is cleared.

---

## Backend API Requirements

Your backend needs to implement these endpoints:

### `POST /auth/login` (or whatever you set in `endpoints.login`)

Request body: whatever fields you pass to `login()` (e.g. `{ email, password }`)

**Response option 1 — user included:**

```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": {
    "id": "123",
    "email": "user@example.com",
    "name": "Jane Doe"
  },

  // Optional — used by "backend" and "hybrid" expiry strategies
  "accessTokenExpiresIn": "2d",
  "refreshTokenExpiresIn": "7d"
}
```

**Response option 2 — user fetched separately:**

If your login endpoint only returns tokens, omit the `user` field and configure the `me` endpoint. The library will automatically call it after login.

```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "accessTokenExpiresIn": "2d",
  "refreshTokenExpiresIn": "7d"
}
```

Then in your config:

```ts
endpoints: {
  login: "/auth/login",
  me: "/auth/me",  // ← library calls this to fetch user profile
}
```

### `POST /auth/refresh`

Request body:

```json
{
  "refreshToken": "eyJhbGc..."
}
```

Response: same shape as the login response (new `accessToken` + `refreshToken`).

### `GET /auth/me` (optional)

Returns the current user object. Called after login and on session restore if the `me` endpoint is configured.

Response:

```json
{
  "id": "123",
  "email": "user@example.com",
  "name": "Jane Doe"
}
```

### `POST /auth/logout` (optional)

Called on logout. Failure is silently ignored — the session cookie is always cleared locally regardless.

---

## Expiry Formats

The library accepts expiry values in multiple formats:

| Input   | Seconds   | Human-readable |
|---------|-----------|----------------|
| `900`   | 900       | 15 minutes     |
| `"15m"` | 900       | 15 minutes     |
| `"2h"`  | 7,200     | 2 hours        |
| `"2d"`  | 172,800   | 2 days         |
| `"7d"`  | 604,800   | 7 days         |
| `"1w"`  | 604,800   | 1 week         |

Supported units: `s` (seconds), `m` (minutes), `h` (hours), `d` (days), `w` (weeks)

### Expiry strategies

| Strategy  | Behavior                                                         |
|-----------|------------------------------------------------------------------|
| `backend` | Use only the expiry values returned by your API                  |
| `config`  | Use only the values set in `expiry` config                       |
| `hybrid`  | API response first; fall back to config if not present (default) |

`hybrid` is the safest choice — it works whether or not your backend returns expiry fields.

---

## Configuration Reference

### `ClientAuthConfig` (for `AuthProvider`)

```ts
interface ClientAuthConfig {
  token?: {
    cookieName?: string;  // default: "next-token-auth.session"
  };

  routes?: {
    loginPath?: string;   // default: "/login"
    redirectAuthenticatedTo?: string; // default: "/dashboard"
  };

  autoRefresh?: boolean;  // default: false
  refreshThreshold?: number; // seconds before expiry to refresh (default: 60)

  onLogin?: (session: AuthSession) => void;
  onLogout?: () => void;
}
```

### `AuthConfig` (for server-side functions)

```ts
interface AuthConfig<User = unknown> {
  baseUrl: string;  // Your backend API base URL

  endpoints: {
    login: string;       // required
    refresh: string;     // required
    register?: string;
    logout?: string;
    me?: string;
  };

  routes?: {
    public: string[];     // always accessible
    protected: string[];  // require auth
    guestOnly?: string[]; // only when NOT authenticated
    loginPath?: string;   // default: "/login"
    redirectAuthenticatedTo?: string; // default: "/dashboard"
  };

  token: {
    storage: "cookie" | "memory";
    cookieName?: string;
    secure?: boolean;      // default: true
    sameSite?: "strict" | "lax" | "none"; // default: "lax"
  };

  secret: string;  // AES-GCM encryption key

  autoRefresh?: boolean;
  refreshThreshold?: number;

  expiry?: {
    accessTokenExpiresIn?: number | string;
    refreshTokenExpiresIn?: number | string;
    strategy?: "backend" | "config" | "hybrid";
  };

  fetchFn?: typeof fetch;  // custom fetch for testing

  onLogin?: (session: AuthSession<User>) => void;
  onLogout?: () => void;
  onRefreshError?: (error: unknown) => void;
}
```

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
  refreshTokenExpiresAt?: number;
}

interface LoginResponse<User = unknown> {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  accessTokenExpiresIn?: number | string;
  refreshTokenExpiresIn?: number | string;
}
```

All types are exported from `next-token-auth`.

---

## Common Patterns

### Custom user type

```ts
interface MyUser {
  id: string;
  email: string;
  role: "admin" | "user";
}

const { session } = useAuth<MyUser>();
console.log(session.user?.role);
```

### Logout with redirect

```ts
const { logout } = useAuth();

async function handleLogout() {
  await logout();
  window.location.href = "/";
}
```

### Conditional rendering based on auth

```ts
const { isAuthenticated } = useSession();

return (
  <nav>
    {isAuthenticated ? (
      <a href="/dashboard">Dashboard</a>
    ) : (
      <a href="/login">Sign in</a>
    )}
  </nav>
);
```

### Server-side redirect in a server component

```ts
import { redirect } from "next/navigation";
import { getServerSession } from "next-token-auth/server";

export default async function AdminPage() {
  const session = await getServerSession(req, authConfig);

  if (!session.isAuthenticated) {
    redirect("/login");
  }

  if (session.user.role !== "admin") {
    redirect("/dashboard");
  }

  return <h1>Admin Panel</h1>;
}
```

---

## Troubleshooting

### "Cannot find module 'next-token-auth/server'"

Run `npm run build` (or `pnpm build`) to generate the `dist/` folder. The package uses subpath exports (`/server`, `/react`) which require a build step.

### Middleware always redirects to login

Check three things:

1. The `matcher` in your `middleware.ts` includes the route you're testing
2. The route is listed in `routes.protected` or not listed in `routes.public`
3. You're actually logged in — check the Application tab in DevTools for the session cookie

### "secret is undefined"

Make sure `AUTH_SECRET` is set in your `.env.local` file and you're importing `authConfig` (not `clientAuthConfig`) in your Route Handler and middleware.

### Session is lost on page reload

The session should persist via the HttpOnly cookie. If it's not:

1. Check that `cookieName` matches in both `authConfig` and `clientAuthConfig`
2. Verify the cookie exists in DevTools → Application → Cookies
3. Make sure `app/api/auth/[action]/route.ts` exists and exports `createAuthHandlers(authConfig)`

---

## Who This Is For

- Developers building Next.js apps who want auth that just works
- Teams that need a consistent auth pattern across multiple projects
- Anyone tired of writing the same token refresh logic over and over
- SaaS and MVP builders who want to ship features, not auth plumbing

---

## Security

- Tokens are stored in HttpOnly cookies — JavaScript cannot read them
- Cookies are AES-GCM encrypted server-side using your `secret`
- The `secret` never leaves the server — it's only used in Route Handlers, middleware, and `getServerSession`
- `AuthProvider` receives `ClientAuthConfig` which does not contain `secret` or `baseUrl`
- Cookies use `Secure` and `SameSite` flags by default for CSRF protection
- Use a random 32-character string for `secret` in production — never commit it

---

## License

MIT
