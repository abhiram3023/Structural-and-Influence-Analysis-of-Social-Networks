import axios, { AxiosError } from "axios";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const TOKEN_KEY = "sna_token";

export const api = axios.create({ baseURL: `${API_URL}/api` });

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

api.interceptors.request.use((cfg) => {
  const t = getToken();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err: AxiosError) => {
    if (err.response?.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      setToken(null);
      window.location.href = "/login";
    }
    return Promise.reject(err);
  },
);

export function errMsg(e: unknown): string {
  const d = (e as AxiosError<{ detail?: unknown }>)?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x: { msg?: string }) => x.msg).join("; ");
  if ((e as AxiosError)?.code === "ERR_NETWORK") return `Cannot reach the API at ${API_URL}. Is the backend running?`;
  return (e as Error)?.message || "Something went wrong";
}

// ---------- types ----------
export interface User {
  id: number;
  email: string;
  name: string;
  preferences: Record<string, unknown>;
  created_at: string;
}
export interface Network {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  node_count: number;
  edge_count: number;
}
export interface GNode {
  id: number;
  label: string;
  attributes: Record<string, unknown>;
}
export interface GEdge {
  id: number;
  source_id: number;
  target_id: number;
  weight: number;
}
export interface Metric {
  label: string;
  community: number;
  degree_count: number;
  degree: number;
  betweenness: number;
  closeness: number;
  eigenvector: number;
  pagerank: number;
  clustering: number;
  is_articulation_point: boolean;
  [k: string]: unknown;
}
export interface CommunityProfile {
  community: number;
  size: number;
  internal_edges: number;
  external_edges: number;
  internal_density: number;
  conductance: number;
  avg_clustering: number;
  hub: number;
  hub_label: string;
}
export interface Bridge {
  node: number;
  label: string;
  community: number;
  degree: number;
  communities_touched: number;
  participation: number;
  betweenness: number;
}
export interface RobustnessPoint {
  removed_frac: number;
  giant_frac: number;
  efficiency: number | null;
}
export interface Robustness {
  curves: Record<string, RobustnessPoint[]>;
  auc: Record<string, number>;
  most_damaging: string;
}
export interface Analysis {
  id: number;
  network_id: number;
  created_at: string;
  summary: Record<string, number | null>;
  metrics: Record<string, Metric>;
  communities: {
    algorithms: Record<string, { count: number; modularity: number }>;
    partition: Record<string, number>;
    profiles: CommunityProfile[];
    bridges: Bridge[];
    articulation_points: number[];
  };
  comparison: {
    metrics: string[];
    correlation: Record<string, Record<string, number>>;
    overlap: Record<string, Record<string, number>>;
    k: number;
  };
  robustness: Robustness;
  insights: string[];
}

export const METRICS = ["degree", "betweenness", "closeness", "eigenvector", "pagerank"] as const;
export type MetricName = (typeof METRICS)[number];
export const METRIC_LABEL: Record<MetricName, string> = {
  degree: "Degree",
  betweenness: "Betweenness",
  closeness: "Closeness",
  eigenvector: "Eigenvector",
  pagerank: "PageRank",
};
export const METRIC_HELP: Record<MetricName, string> = {
  degree: "Most direct connections",
  betweenness: "Bridges between different parts of the network",
  closeness: "Reaches everyone in the fewest steps",
  eigenvector: "Connected to other well-connected people",
  pagerank: "Influence flowing from important connections",
};

export const COMMUNITY_COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ef4444", "#14b8a6", "#ec4899", "#84cc16",
  "#6366f1", "#f97316", "#06b6d4", "#64748b",
];
export const communityColor = (c: number | undefined) =>
  c === undefined || c === null ? "#94a3b8" : COMMUNITY_COLORS[c % COMMUNITY_COLORS.length];

export const fmt = (v: number | null | undefined, d = 3) =>
  v === null || v === undefined ? "—" : Number.isInteger(v) ? v.toLocaleString() : v.toFixed(d);
