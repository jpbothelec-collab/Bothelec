import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api, setUnauthorizedHandler, TOKEN_KEY } from "./api";
import { APP_VARIANT } from "./config";
import { getPushToken, registerForPush } from "./push";
import { storage } from "./storage";
import type { User } from "./types";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (fields: Record<string, string>) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const clear = useCallback(async () => {
    await storage.remove(TOKEN_KEY);
    setUser(null);
  }, []);

  const start = useCallback(async (token: string, u: User) => {
    await storage.set(TOKEN_KEY, token);
    setUser(u);
    registerForPush().catch(() => {});
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => void clear());
    (async () => {
      try {
        if (await storage.get(TOKEN_KEY)) {
          setUser(await api.me());
          registerForPush().catch(() => {});
        }
      } catch {
        // Offline or token revoked: the 401 handler clears it; otherwise stay logged out for now.
      } finally {
        setLoading(false);
      }
    })();
    return () => setUnauthorizedHandler(null);
  }, [clear]);

  const value = useMemo<AuthState>(() => ({
    user,
    loading,
    setUser,
    login: async (username, password) => {
      const r = await api.login(username.trim(), password, APP_VARIANT);
      await start(r.token, r.user);
    },
    signup: async (fields) => {
      const r = await api.signup(APP_VARIANT, fields);
      await start(r.token, r.user);
    },
    logout: async () => {
      try {
        await api.logout(getPushToken());
      } catch {
        // Logging out locally is what matters.
      }
      await clear();
    },
    refresh: async () => setUser(await api.me()),
  }), [user, loading, start, clear]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
