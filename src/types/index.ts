// ─── Expiry ───────────────────────────────────────────────────────────────────

export type ExpiryInput = number | string;

export type ExpiryStrategy = "backend" | "config" | "hybrid";

// ─── Tokens ───────────────────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Unix timestamp (ms) */
  accessTokenExpiresAt: number;
  /** Unix timestamp (ms) */
  refreshTokenExpiresAt?: number;
}

// ─── Session ──────────────────────────────────────────────────────────────────

export interface AuthSession<User = unknown> {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
}

// ─── Login ────────────────────────────────────────────────────────────────────

export interface LoginInput {
  [key: string]: unknown;
}

export interface LoginResponse<User = unknown> {
  user: User;
  accessToken: string;
  refreshToken: string;
  /** Seconds until access token expires (legacy field) */
  expiresIn?: number;
  accessTokenExpiresIn?: number | string;
  refreshTokenExpiresIn?: number | string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface AuthConfig<User = unknown> {
  /** Base URL of your backend API */
  baseUrl: string;

  endpoints: {
    login: string;
    register?: string;
    refresh: string;
    logout?: string;
    /** Endpoint to fetch the current user profile */
    me?: string;
  };

  routes?: {
    /** Paths that are always accessible without auth */
    public: string[];
    /** Paths that require authentication */
    protected: string[];
    /**
     * Paths only accessible when NOT authenticated (e.g. /auth/login, /auth/register).
     * Authenticated users are redirected to `redirectAuthenticatedTo`.
     */
    guestOnly?: string[];
    /**
     * Where to redirect authenticated users who visit a guestOnly route.
     * @default "/dashboard"
     */
    redirectAuthenticatedTo?: string;
    /**
     * Path to redirect unauthenticated users to when they hit a protected route.
     * @default "/login"
     */
    loginPath?: string;
  };

  token: {
    storage: "cookie" | "memory";
    cookieName?: string;
    secure?: boolean;
    sameSite?: "strict" | "lax" | "none";
  };

  /** Secret used for encrypting stored tokens */
  secret: string;

  /** Automatically refresh access token before expiry */
  autoRefresh?: boolean;

  /**
   * Seconds before expiry to trigger a proactive refresh.
   * @default 60
   */
  refreshThreshold?: number;

  expiry?: {
    accessTokenExpiresIn?: ExpiryInput;
    refreshTokenExpiresIn?: ExpiryInput;
    /**
     * - "backend"  → trust expiresIn from API response
     * - "config"   → use config values only
     * - "hybrid"   → backend first, fallback to config
     * @default "hybrid"
     */
    strategy?: ExpiryStrategy;
  };

  /** Optional custom fetch implementation */
  fetchFn?: typeof fetch;

  /** Called after a successful login */
  onLogin?: (session: AuthSession<User>) => void;
  /** Called after logout */
  onLogout?: () => void;
  /** Called when token refresh fails */
  onRefreshError?: (error: unknown) => void;
}
