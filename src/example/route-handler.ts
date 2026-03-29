/**
 * Example Route Handler setup.
 *
 * Place this at: app/api/auth/[action]/route.ts
 */
import { createAuthHandlers } from "../server/handlers";
import { authConfig } from "./auth.config";

export const { GET, POST } = createAuthHandlers(authConfig);
