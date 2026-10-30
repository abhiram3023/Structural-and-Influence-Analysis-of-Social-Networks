"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Analysis, Network, User, api, errMsg, getToken, setToken } from "./api";

// ---------- auth ----------
interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  setUser: (u: User) => void;
}
const AuthContext = createContext<AuthCtx>(null as unknown as AuthCtx);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .get<User>("/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const r = await api.post("/auth/login", { email, password });
    setToken(r.data.access_token);
    setUser(r.data.user);
  };
  const register = async (email: string, password: string, name: string) => {
    const r = await api.post("/auth/register", { email, password, name });
    setToken(r.data.access_token);
    setUser(r.data.user);
  };
  const logout = () => {
    setToken(null);
    setUser(null);
    try {
      localStorage.removeItem("sna_network");
    } catch {}
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, setUser }}>{children}</AuthContext.Provider>
  );
}

// ---------- current network + latest analysis ----------
interface NetCtx {
  networks: Network[];
  current: Network | null;
  analysis: Analysis | null;
  loading: boolean;
  running: boolean;
  error: string | null;
  stale: boolean;
  select: (id: number) => void;
  refresh: () => Promise<void>;
  runAnalysis: () => Promise<void>;
  reloadAnalysis: () => Promise<void>;
}
const NetworkContext = createContext<NetCtx>(null as unknown as NetCtx);
export const useNetwork = () => useContext(NetworkContext);

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [networks, setNetworks] = useState<Network[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const r = await api.get<Network[]>("/networks");
    setNetworks(r.data);
    setCurrentId((prev) => {
      let saved: number | null = prev;
      if (saved === null) {
        try {
          saved = Number(localStorage.getItem("sna_network")) || null;
        } catch {}
      }
      if (saved !== null && r.data.some((n) => n.id === saved)) return saved;
      return r.data[0]?.id ?? null;
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh().catch((e) => {
      setError(errMsg(e));
      setLoading(false);
    });
  }, [refresh]);

  const reloadAnalysis = useCallback(async () => {
    if (currentId === null) return;
    const r = await api.get<Analysis | null>(`/networks/${currentId}/analysis/latest`);
    setAnalysis(r.data);
  }, [currentId]);

  useEffect(() => {
    setAnalysis(null);
    if (currentId === null) return;
    try {
      localStorage.setItem("sna_network", String(currentId));
    } catch {}
    reloadAnalysis();
  }, [currentId, reloadAnalysis]);

  const current = networks.find((n) => n.id === currentId) ?? null;

  const runAnalysis = async () => {
    if (!current) return;
    setRunning(true);
    setError(null);
    try {
      const r = await api.post<Analysis>(`/networks/${current.id}/analyze`);
      setAnalysis(r.data);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setRunning(false);
    }
  };

  const stale = !!(analysis && current && new Date(current.updated_at) > new Date(analysis.created_at));

  return (
    <NetworkContext.Provider
      value={{ networks, current, analysis, loading, running, error, stale, select: setCurrentId, refresh, runAnalysis, reloadAnalysis }}
    >
      {children}
    </NetworkContext.Provider>
  );
}
