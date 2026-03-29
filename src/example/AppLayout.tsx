"use client";

import React from "react";
import { AuthProvider } from "../react/AuthProvider";

/**
 * App Router root layout — wrap your app with AuthProvider.
 *
 * app/layout.tsx
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider
          config={{
            token: { cookieName: "myapp.session" },
            autoRefresh: true,
          }}
        >
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
