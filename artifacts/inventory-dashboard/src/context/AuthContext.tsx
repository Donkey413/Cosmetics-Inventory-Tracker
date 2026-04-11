import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  isAdmin: boolean;
  permissions: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
}

const AUTH_STORAGE_KEY = "vela_auth_token";
const USER_STORAGE_KEY = "vela_auth_user";
const HEARTBEAT_INTERVAL_MS = 60_000; // 1 minute

const AuthContext = createContext<AuthContextValue | null>(null);

function parseStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(AUTH_STORAGE_KEY));
  const [user, setUser] = useState<AuthUser | null>(parseStoredUser);

  // Wire up the API client's auth token getter on mount and whenever the token changes
  useEffect(() => {
    setAuthTokenGetter(() => localStorage.getItem(AUTH_STORAGE_KEY));
    return () => setAuthTokenGetter(null);
  }, []);

  // Heartbeat — keeps the session alive by pinging POST /auth/heartbeat every minute
  useEffect(() => {
    if (!token) return;

    const sendHeartbeat = () => {
      const storedToken = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!storedToken) return;
      fetch("/api/auth/heartbeat", {
        method: "POST",
        headers: { Authorization: `Bearer ${storedToken}` },
      }).catch(() => {
        // Heartbeat failures are silent — the session will simply expire naturally
      });
    };

    sendHeartbeat(); // Send immediately on login
    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [token]);

  const login = useCallback((newToken: string, newUser: AuthUser) => {
    localStorage.setItem(AUTH_STORAGE_KEY, newToken);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const hasPermission = useCallback(
    (permission: string) => {
      if (!user) return false;
      if (user.isAdmin) return true;
      return user.permissions.includes(permission);
    },
    [user],
  );

  return (
    <AuthContext.Provider
      value={{ user, token, isAuthenticated: !!token && !!user, login, logout, hasPermission }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
