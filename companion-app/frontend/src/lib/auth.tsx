"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, setToken, getToken } from "./api";
import type { JwtClaims, UserRole } from "./types";

interface AuthUser {
  id: string;
  role: UserRole;
}

interface AuthState {
  user: AuthUser | null;
  ready: boolean; // initial token read done
  login: (email: string, password: string) => Promise<void>;
  loginWithToken: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

function decode(token: string): JwtClaims | null {
  try {
    const [, payload] = token.split(".");
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as JwtClaims;
  } catch {
    return null;
  }
}

function userFromToken(token: string | null): AuthUser | null {
  if (!token) return null;
  const claims = decode(token);
  if (!claims) return null;
  if (claims.exp && claims.exp * 1000 < Date.now()) return null; // expired
  return { id: claims.sub, role: claims.role };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const u = userFromToken(getToken());
    if (!u) setToken(null);
    setUser(u);
    setReady(true);
  }, []);

  const loginWithToken = useCallback((token: string) => {
    setToken(token);
    setUser(userFromToken(token));
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.login(email, password);
      loginWithToken(res.access_token);
    },
    [loginWithToken],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, ready, login, loginWithToken, logout }),
    [user, ready, login, loginWithToken, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
