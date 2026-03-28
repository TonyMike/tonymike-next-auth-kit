import type {
  AuthConfig,
  AuthSession,
  AuthTokens,
  LoginInput,
  LoginResponse,
} from "../types";
import { resolveAccessTokenExpiry, resolveRefreshTokenExpiry } from "../utils/expiry";
import { HttpClient } from "./HttpClient";
import { SessionManager } from "./SessionManager";
import { TokenManager } from "./TokenManager";

/**
 * Central orchestrator for authentication operations.
 * Coordinates TokenManager, SessionManager, and HttpClient.
 */
export class AuthClient<User = unknown> {
  readonly tokenManager: TokenManager;
  readonly sessionManager: SessionManager<User>;
  readonly httpClient: HttpClient;

  private readonly config: AuthConfig<User>;
  private sessionListeners: Array<(session: AuthSession<User>) => void> = [];

  constructor(config: AuthConfig<User>) {
    this.config = config;
    this.tokenManager = new TokenManager(config as AuthConfig<unknown>);
    this.httpClient = new HttpClient(config as AuthConfig<unknown>, this.tokenManager);
    this.sessionManager = new SessionManager(
      config,
      this.tokenManager,
      this.httpClient
    );

    // Wire up the refresh callback
    this.httpClient.setRefreshFn(() => this.refresh());
  }

  // ─── Auth Operations ────────────────────────────────────────────────────────

  /**
   * Authenticates the user and stores tokens.
   */
  async login(input: LoginInput): Promise<AuthSession<User>> {
    const res = await this.httpClient.doFetch(
      this.httpClient.url(this.config.endpoints.login),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }
    );

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Login failed (${res.status}): ${error}`);
    }

    const data = (await res.json()) as LoginResponse<User>;
    const tokens = this.buildTokens(data);

    await this.tokenManager.setTokens(tokens);
    await this.sessionManager.loadSession();

    const session = this.sessionManager.getSession();
    this.config.onLogin?.(session);
    this.notifyListeners(session);

    return session;
  }

  /**
   * Logs out the user, clears tokens, and optionally calls the backend.
   */
  async logout(): Promise<void> {
    const logoutEndpoint = this.config.endpoints.logout;

    if (logoutEndpoint) {
      try {
        await this.httpClient.fetch(this.httpClient.url(logoutEndpoint), {
          method: "POST",
        });
      } catch {
        // Best-effort logout
      }
    }

    this.tokenManager.clearTokens();
    this.sessionManager.clearSession();
    this.config.onLogout?.();
    this.notifyListeners(this.sessionManager.getSession());
  }

  /**
   * Refreshes the access token using the stored refresh token.
   * Returns true on success, false on failure.
   */
  async refresh(): Promise<boolean> {
    const tokens = this.tokenManager.getTokens();

    if (!tokens) return false;
    if (this.tokenManager.isRefreshExpired(tokens)) {
      await this.logout();
      return false;
    }

    try {
      const res = await this.httpClient.doFetch(
        this.httpClient.url(this.config.endpoints.refresh),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        }
      );

      if (!res.ok) {
        await this.logout();
        return false;
      }

      const data = (await res.json()) as LoginResponse<User>;
      const newTokens = this.buildTokens(data);

      await this.tokenManager.setTokens(newTokens);
      await this.sessionManager.refreshSession(newTokens);
      this.notifyListeners(this.sessionManager.getSession());

      return true;
    } catch (err) {
      this.config.onRefreshError?.(err);
      return false;
    }
  }

  /**
   * Loads the session from stored tokens (call on app mount).
   */
  async initialize(): Promise<AuthSession<User>> {
    // Decrypt the cookie into the in-memory cache before any session reads
    await this.tokenManager.initFromCookie();

    const session = await this.sessionManager.loadSession();

    // Proactively refresh if access token is near expiry
    if (
      session.isAuthenticated &&
      session.tokens &&
      this.tokenManager.isAccessExpired(session.tokens) &&
      !this.tokenManager.isRefreshExpired(session.tokens)
    ) {
      await this.refresh();
    }

    return this.sessionManager.getSession();
  }

  getSession(): AuthSession<User> {
    return this.sessionManager.getSession();
  }

  /**
   * Returns the authenticated fetch wrapper.
   */
  get fetch(): HttpClient["fetch"] {
    return this.httpClient.fetch.bind(this.httpClient);
  }

  // ─── Subscription ────────────────────────────────────────────────────────────

  subscribe(listener: (session: AuthSession<User>) => void): () => void {
    this.sessionListeners.push(listener);
    return () => {
      this.sessionListeners = this.sessionListeners.filter((l) => l !== listener);
    };
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private buildTokens(data: LoginResponse<User>): AuthTokens {
    const strategy = this.config.expiry?.strategy ?? "hybrid";
    const configAccess = this.config.expiry?.accessTokenExpiresIn;
    const configRefresh = this.config.expiry?.refreshTokenExpiresIn;

    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      accessTokenExpiresAt: resolveAccessTokenExpiry(data, configAccess, strategy),
      refreshTokenExpiresAt: resolveRefreshTokenExpiry(data, configRefresh, strategy),
    };
  }

  private notifyListeners(session: AuthSession<User>): void {
    for (const listener of this.sessionListeners) {
      listener(session);
    }
  }
}
