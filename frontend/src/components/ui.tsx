"use client";

import Link from "next/link";
import { AlertTriangle, Loader2, Play } from "lucide-react";
import { useNetwork } from "@/lib/store";

export function Card({ title, action, children, className = "" }: {
  title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-surface p-5 shadow-sm ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="font-semibold text-slate-800">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, icon }: { label: string; value: React.ReactNode; hint?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        {icon && <span className="text-blue-500">{icon}</span>}
      </div>
      <p className="mt-1 text-sm text-slate-500">{label}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export const btn =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed";
export const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
export const btnDanger =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-surface px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50";
export const input =
  "w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export function ErrorBox({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{msg}</div>;
}

export function Spinner({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

export function NoNetwork() {
  return (
    <Card>
      <p className="text-slate-600">You don&apos;t have a network yet.</p>
      <Link href="/import" className={`${btn} mt-4`}>Import or build a network</Link>
    </Card>
  );
}

/** Shown on pages that need analysis results; offers to run or re-run it. */
export function AnalysisGate({ children }: { children: React.ReactNode }) {
  const { current, analysis, running, runAnalysis, error, stale, loading } = useNetwork();
  if (loading) return <Spinner />;
  if (!current) return <NoNetwork />;
  const runButton = (
    <button className={btn} onClick={runAnalysis} disabled={running}>
      {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
      {running ? "Analysing..." : analysis ? "Re-run analysis" : "Run analysis"}
    </button>
  );
  if (!analysis)
    return (
      <Card>
        <p className="mb-4 text-slate-600">
          <b>{current.name}</b> hasn&apos;t been analysed yet. Analysis computes centrality, communities, bridges and robustness.
        </p>
        {runButton}
        <div className="mt-4"><ErrorBox msg={error} /></div>
      </Card>
    );
  return (
    <>
      {stale && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> The network changed since the last analysis.</span>
          {runButton}
        </div>
      )}
      <ErrorBox msg={error} />
      {children}
    </>
  );
}

export function Bar({ value, max, color = "#3b82f6" }: { value: number; max: number; color?: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-slate-100">
      <div className="h-2 rounded-full" style={{ width: `${max ? Math.max(2, (value / max) * 100) : 0}%`, background: color }} />
    </div>
  );
}
