"use client";

import React, { useState } from "react";
import { useAuth } from "../react/hooks/useAuth";

/**
 * Example login page using the useAuth hook.
 */
export default function LoginPage() {
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login({ email, password });
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        required
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        required
      />
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={isLoading}>
        {isLoading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
