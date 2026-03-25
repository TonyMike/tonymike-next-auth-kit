/**
 * Example App Router server component using getServerSession.
 *
 * app/profile/page.tsx
 */
import { redirect } from "next/navigation";
import { getServerSession } from "../server/getServerSession";
import { authConfig } from "./auth.config";

export default async function ProfilePage({
  // Next.js App Router passes the request via headers/cookies automatically
}: {
  params?: Record<string, string>;
}) {
  // In App Router, import `cookies` from "next/headers" and pass a compatible object.
  // Here we show the pattern — adapt to your Next.js version.
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();

  const session = await getServerSession(
    // Wrap cookieStore to match the expected interface
    { cookies: { get: (name: string) => cookieStore.get(name) } },
    authConfig
  );

  if (!session.isAuthenticated) {
    redirect("/login");
  }

  const user = session.user as { name?: string; email?: string };

  return (
    <main>
      <h1>Profile</h1>
      <p>Name: {user?.name}</p>
      <p>Email: {user?.email}</p>
    </main>
  );
}
