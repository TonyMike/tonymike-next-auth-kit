// Core
export { AuthClient } from "./core/AuthClient";
export { TokenManager } from "./core/TokenManager";
export { SessionManager } from "./core/SessionManager";
export { HttpClient } from "./core/HttpClient";

// React
export { AuthProvider } from "./react/AuthProvider";
export { useAuth } from "./react/hooks/useAuth";
export { useSession } from "./react/hooks/useSession";
export { useRequireAuth } from "./react/hooks/useRequireAuth";

// Utils
export { parseExpiry, safeParseExpiry } from "./utils/expiry";
export { encrypt, decrypt } from "./utils/crypto";

// Types
export type {
  AuthConfig,
  AuthTokens,
  AuthSession,
  LoginInput,
  LoginResponse,
  ExpiryInput,
  ExpiryStrategy,
} from "./types";

export type { UseAuthReturn } from "./react/hooks/useAuth";
export type { UseRequireAuthOptions } from "./react/hooks/useRequireAuth";
