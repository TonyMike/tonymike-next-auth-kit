import type { AuthConfig, AuthSession, AuthTokens } from "../types";
import type { HttpClient } from "./HttpClient";
import type { TokenManager } from "./TokenManager";

/**
 * Derives and caches the current AuthSession from stored tokens.
 * Fetches the user profile from the /me endpoint when available.
 */
export class SessionManager<User = unknown> {
  private session: AuthSession<User> = {
    user: null,
    tokens: null,
    isAuthenticated: false,
  };

  private readonly config: AuthConfig<User>;
  private readonly tokenManager: TokenManager;
  private readonly httpClient: HttpClient;

  constructor(
    config: AuthConfig<User>,
    tokenManager: TokenManager,
    httpClient: HttpClient
  ) {
    this.config = config;
    this.tokenManager = tokenManager;
    this.httpClient = httpClient;
  }

  getSession(): AuthSession<User> {
    return this.session;
  }

  setSession(session: AuthSession<User>): void {
    this.session = session;
  }

  /**
   * Builds a session from stored tokens, optionally fetching the user profile.
   */
  async loadSession(): Promise<AuthSession<User>> {
    const tokens = this.tokenManager.getTokens();

    if (!tokens) {
      this.session = { user: null, tokens: null, isAuthenticated: false };
      return this.session;
    }

    // If access token is expired and refresh is also expired, clear everything
    if (
      this.tokenManager.isAccessExpired(tokens) &&
      this.tokenManager.isRefreshExpired(tokens)
    ) {
      this.tokenManager.clearTokens();
      this.session = { user: null, tokens: null, isAuthenticated: false };
      return this.session;
    }

    const user = await this.fetchUser(tokens);
    this.session = {
      user,
      tokens,
      isAuthenticated: true,
    };

    return this.session;
  }

  /**
   * Updates the session after a successful token refresh.
   */
  async refreshSession(tokens: AuthTokens): Promise<void> {
    const user = this.session.user ?? (await this.fetchUser(tokens));
    this.session = { user, tokens, isAuthenticated: true };
  }

  clearSession(): void {
    this.session = { user: null, tokens: null, isAuthenticated: false };
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private async fetchUser(tokens: AuthTokens): Promise<User | null> {
    const meEndpoint = this.config.endpoints.me;
    if (!meEndpoint) return null;

    try {
      const res = await this.httpClient.fetch(this.httpClient.url(meEndpoint));
      if (!res.ok) return null;
      return (await res.json()) as User;
    } catch {
      return null;
    }
  }
}
