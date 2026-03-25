import { authMiddleware } from "../server/middleware";
import { authConfig } from "./auth.config";

/**
 * Next.js middleware — place this file at the project root as `middleware.ts`.
 */
export const middleware = authMiddleware(authConfig);

export const config = {
  matcher: ["/dashboard/:path*", "/profile/:path*", "/settings/:path*"],
};
