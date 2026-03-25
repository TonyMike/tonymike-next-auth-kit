import type { AuthConfig } from "../types";
import type { TokenManager } from "./TokenManager";

type RefreshFn = () => Promise<boolean>;

/**
 * Authenticated HTTP client that:
 * - Injects Authorization: Bearer <accessToken>
 * - Auto-refreshes on 401 and retries the original request once
 */
export class HttpClient {
  private readonly config: AuthConfig;
  private readonly tokenManager: TokenManager;
  private refreshFn: RefreshFn | null = null;
  private refreshPromise: Promise<boolean> | null = null;

  constructor(config: AuthConfig, tokenManager: TokenManager) {
    this.config = config;
    this.tokenManager = tokenManager;
  }

  /** Register the refresh callback (set by AuthClient to avoid circular deps) */
  setRefreshFn(fn: RefreshFn): void {
    this.refreshFn = fn;
  }

  /**
   * Authenticated fetch wrapper.
   * Automatically injects the Bearer token and handles 401 → refresh → retry.
   */
  async fetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const tokens = this.tokenManager.getTokens();

    const headers = new Headers(init.headers);
    if (tokens?.accessToken) {
      headers.set("Authorization", `Bearer ${tokens.accessToken}`);
    }

    const response = await this.doFetch(input, { ...init, headers });

    if (response.status === 401 && this.refreshFn) {
      const refreshed = await this.deduplicatedRefresh();
      if (refreshed) {
        // Retry with new token
        const newTokens = this.tokenManager.getTokens();
        if (newTokens?.accessToken) {
          headers.set("Authorization", `Bearer ${newTokens.accessToken}`);
        }
        return this.doFetch(input, { ...init, headers });
      }
    }

    return response;
  }

  /**
   * Raw fetch using the configured fetchFn or global fetch.
   */
  async doFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const fetchFn = this.config.fetchFn ?? fetch;
    return fetchFn(input as RequestInfo, init);
  }

  /**
   * Builds a full URL from a path relative to baseUrl.
   */
  url(path: string): string {
    return `${this.config.baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  /**
   * Ensures only one refresh request is in-flight at a time.
   */
  private async deduplicatedRefresh(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = this.refreshFn!().finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }
}
