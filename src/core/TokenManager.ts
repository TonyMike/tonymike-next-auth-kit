import type { AuthConfig, AuthTokens } from "../types";
import { encrypt, decrypt } from "../utils/crypto";

/**
 * Manages storage, retrieval, and expiry checks for auth tokens.
 * Supports "cookie" and "memory" storage strategies.
 */
export class TokenManager {
  private memoryStore: AuthTokens | null = null;
  private readonly config: AuthConfig;

  constructor(config: AuthConfig) {
    this.config = config;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  getTokens(): AuthTokens | null {
    if (this.config.token.storage === "memory") {
      return this.memoryStore;
    }
    // Return the in-memory cache (populated by setTokens or initFromCookie)
    return this.decryptedCache;
  }

  /**
   * Must be called once on startup (before getTokens) when storage is "cookie".
   * Reads and decrypts the cookie, populating the in-memory cache.
   */
  async initFromCookie(): Promise<void> {
    if (typeof document === "undefined") return;
    if (this.config.token.storage !== "cookie") return;

    const raw = getCookieValue(this.cookieName());
    if (!raw) return;

    try {
      const json = await decrypt(decodeURIComponent(raw), this.config.secret);
      this.decryptedCache = JSON.parse(json) as AuthTokens;
    } catch {
      this.decryptedCache = null;
    }
  }

  async setTokens(tokens: AuthTokens): Promise<void> {
    if (this.config.token.storage === "memory") {
      this.memoryStore = tokens;
      return;
    }
    await this.writeToCookie(tokens);
  }

  clearTokens(): void {
    this.memoryStore = null;
    this.decryptedCache = null;
    if (this.config.token.storage === "cookie") {
      this.deleteCookie();
    }
  }

  isAccessExpired(tokens: AuthTokens): boolean {
    const threshold = (this.config.refreshThreshold ?? 60) * 1000;
    return Date.now() >= tokens.accessTokenExpiresAt - threshold;
  }

  isRefreshExpired(tokens: AuthTokens): boolean {
    if (!tokens.refreshTokenExpiresAt) return false;
    return Date.now() >= tokens.refreshTokenExpiresAt;
  }

  // ─── Cookie helpers (client-side only) ──────────────────────────────────────

  private cookieName(): string {
    return this.config.token.cookieName ?? "next-token-auth.session";
  }

  /** In-memory cache of the last successfully decrypted cookie value. */
  private decryptedCache: AuthTokens | null = null;

  private async writeToCookie(tokens: AuthTokens): Promise<void> {
    if (typeof document === "undefined") return;

    // Encrypt before writing — must match what the server reads via decrypt()
    const value = await encrypt(JSON.stringify(tokens), this.config.secret);
    const secure = this.config.token.secure !== false ? "; Secure" : "";
    const sameSite = this.config.token.sameSite ?? "lax";
    const maxAge = tokens.refreshTokenExpiresAt
      ? Math.floor((tokens.refreshTokenExpiresAt - Date.now()) / 1000)
      : 604800;

    document.cookie = [
      `${this.cookieName()}=${encodeURIComponent(value)}`,
      `Max-Age=${maxAge}`,
      `Path=/`,
      `SameSite=${sameSite}`,
      secure,
    ]
      .filter(Boolean)
      .join("; ");

    // Keep the in-memory cache in sync
    this.decryptedCache = tokens;
  }

  private deleteCookie(): void {
    if (typeof document === "undefined") return;
    document.cookie = `${this.cookieName()}=; Max-Age=0; Path=/`;
  }

  // ─── Server-side helpers ─────────────────────────────────────────────────────

  /**
   * Encrypts tokens — used internally by writeToCookie and available for
   * advanced server-side use cases.
   */
  async encryptTokens(tokens: AuthTokens): Promise<string> {
    return encrypt(JSON.stringify(tokens), this.config.secret);
  }

  /**
   * Decrypts tokens from a server-side cookie value.
   */
  async decryptTokens(ciphertext: string): Promise<AuthTokens | null> {
    try {
      const json = await decrypt(ciphertext, this.config.secret);
      return JSON.parse(json) as AuthTokens;
    } catch {
      return null;
    }
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${escapeRegex(name)}=([^;]*)`)
  );
  return match ? match[1] : null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
