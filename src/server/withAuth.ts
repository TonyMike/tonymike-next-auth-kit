import type { AuthConfig, AuthSession } from "../types";
import { getServerSession } from "./getServerSession";

type NextRequest = {
  cookies: { get(name: string): { value: string } | undefined };
  nextUrl: { pathname: string };
};

type NextResponse = {
  redirect(url: URL): NextResponse;
  next(): NextResponse;
};

type RouteHandler<User = unknown> = (
  req: NextRequest,
  session: AuthSession<User>
) => Promise<Response> | Response;

/**
 * Higher-order function that wraps a Next.js route handler with auth protection.
 * Redirects unauthenticated requests to the login page.
 *
 * @example
 * // app/api/protected/route.ts
 * export const GET = withAuth(config, async (req, session) => {
 *   return Response.json({ user: session.user });
 * });
 */
export function withAuth<User = unknown>(
  config: AuthConfig<User>,
  handler: RouteHandler<User>,
  options: { redirectTo?: string } = {}
) {
  return async (req: NextRequest): Promise<Response> => {
    const session = await getServerSession<User>(req, config);

    if (!session.isAuthenticated) {
      const redirectTo = options.redirectTo ?? "/login";
      const loginUrl = new URL(redirectTo, `https://${req.nextUrl.pathname}`);
      return Response.redirect(loginUrl);
    }

    return handler(req, session);
  };
}
