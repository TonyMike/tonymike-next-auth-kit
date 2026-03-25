"use client";

import React from "react";
import { AuthProvider } from "../react/AuthProvider";
import { authConfig } from "./auth.config";

/**
 * App Router root layout — wrap your app with AuthProvider.
 *
 * app/layout.tsx
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider config={authConfig}>{children}</AuthProvider>
      </body>
    </html>
  );
}
