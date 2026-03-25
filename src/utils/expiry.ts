import type { ExpiryInput, ExpiryStrategy, LoginResponse } from "../types";

const UNIT_MAP: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
};

/**
 * Parses an expiry value into seconds.
 * Accepts:
 *   - number  → treated as seconds
 *   - string  → e.g. "15m", "2h", "2d", "7d", "1w"
 *
 * @throws if the format is unrecognised
 */
export function parseExpiry(input?: ExpiryInput): number {
  if (input === undefined || input === null) {
    throw new Error("parseExpiry: no expiry value provided");
  }

  if (typeof input === "number") {
    if (input <= 0) throw new Error("parseExpiry: value must be positive");
    return input;
  }

  const trimmed = input.trim();

  // Pure numeric string
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }

  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([smhdw])$/i);
  if (!match) {
    throw new Error(
      `parseExpiry: unrecognised format "${input}". ` +
        `Expected a number or a string like "15m", "2h", "2d", "7d", "1w".`
    );
  }

  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  return Math.floor(value * UNIT_MAP[unit]);
}

/**
 * Safely parses an expiry value, returning a fallback on failure.
 */
export function safeParseExpiry(
  input?: ExpiryInput,
  fallbackSeconds = 900
): number {
  try {
    return parseExpiry(input);
  } catch {
    return fallbackSeconds;
  }
}

/**
 * Resolves the access token expiry timestamp (ms) from a login response
 * using the configured strategy.
 */
export function resolveAccessTokenExpiry(
  response: LoginResponse,
  configExpiry?: ExpiryInput,
  strategy: ExpiryStrategy = "hybrid"
): number {
  const now = Date.now();

  const fromBackend =
    response.accessTokenExpiresIn ?? response.expiresIn ?? undefined;

  if (strategy === "backend") {
    if (fromBackend === undefined) {
      throw new Error(
        'resolveAccessTokenExpiry: strategy is "backend" but API returned no expiry'
      );
    }
    return now + parseExpiry(fromBackend) * 1000;
  }

  if (strategy === "config") {
    if (configExpiry === undefined) {
      throw new Error(
        'resolveAccessTokenExpiry: strategy is "config" but no expiry configured'
      );
    }
    return now + parseExpiry(configExpiry) * 1000;
  }

  // hybrid: backend first, fallback to config
  if (fromBackend !== undefined) {
    return now + safeParseExpiry(fromBackend) * 1000;
  }
  if (configExpiry !== undefined) {
    return now + safeParseExpiry(configExpiry) * 1000;
  }

  // Last resort: 15 minutes
  return now + 900 * 1000;
}

/**
 * Resolves the refresh token expiry timestamp (ms).
 */
export function resolveRefreshTokenExpiry(
  response: LoginResponse,
  configExpiry?: ExpiryInput,
  strategy: ExpiryStrategy = "hybrid"
): number | undefined {
  const now = Date.now();
  const fromBackend = response.refreshTokenExpiresIn;

  if (strategy === "backend") {
    return fromBackend !== undefined
      ? now + parseExpiry(fromBackend) * 1000
      : undefined;
  }

  if (strategy === "config") {
    return configExpiry !== undefined
      ? now + parseExpiry(configExpiry) * 1000
      : undefined;
  }

  // hybrid
  if (fromBackend !== undefined) {
    return now + safeParseExpiry(fromBackend) * 1000;
  }
  if (configExpiry !== undefined) {
    return now + safeParseExpiry(configExpiry) * 1000;
  }

  return undefined;
}
