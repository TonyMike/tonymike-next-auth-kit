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
    return this.readFromCookie();
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
    return this.config.token.cookieName ?? "next-auth-kit.session";
  }

  private readFromCookie(): AuthTokens | null {
    if (typeof document === "undefined") return null;

    const raw = getCookieValue(this.cookieName());
    if (!raw) return null;

    try {
      // Tokens are stored as JSON; encryption is applied server-side via
      // getServerSession. Client reads the plaintext access token from cookie.
      return JSON.parse(decodeURIComponent(raw)) as AuthTokens;
    } catch {
      return null;
    }
  }

  private async writeToCookie(tokens: AuthTokens): Promise<void> {
    if (typeof document === "undefined") return;

    const value = encodeURIComponent(JSON.stringify(tokens));
    const secure = this.config.token.secure !== false ? "; Secure" : "";
    const sameSite = this.config.token.sameSite ?? "lax";
    const maxAge = tokens.refreshTokenExpiresAt
      ? Math.floor((tokens.refreshTokenExpiresAt - Date.now()) / 1000)
      : 604800; // 7 days default

    document.cookie = [
      `${this.cookieName()}=${value}`,
      `Max-Age=${maxAge}`,
      `Path=/`,
      `SameSite=${sameSite}`,
      secure,
    ]
      .filter(Boolean)
      .join("; ");
  }

  private deleteCookie(): void {
    if (typeof document === "undefined") return;
    document.cookie = `${this.cookieName()}=; Max-Age=0; Path=/`;
  }

  // ─── Server-side helpers ─────────────────────────────────────────────────────

  /**
   * Encrypts tokens for secure server-side cookie storage.
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
