"use client";

import { createContext, useContext, useCallback } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import type { Session } from "next-auth";
const API_BASE = "/backend-api";

interface AuthContextType {
  user: Session["user"] | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<Session["user"] | null>;
  register: (data: { email: string; password: string; firstName: string; lastName: string; phone?: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status, update } = useSession();
  const user = session?.user ?? null;
  const loading = status === "loading";

  const login = useCallback(async (email: string, password: string) => {
    const result = await signIn("credentials", { email, password, redirect: false });
    if (result?.error) throw new Error("Invalid credentials");
    const newSession = await update();
    return newSession?.user || null;
  }, [update]);

  const register = useCallback(async (data: { email: string; password: string; firstName: string; lastName: string; phone?: string }) => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Registration failed");
    }
    await signIn("credentials", { email: data.email, password: data.password, redirect: false });
    const newSession = await update();
  }, [update]);

  const logout = useCallback(() => {
    signOut({ callbackUrl: "/" });
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
