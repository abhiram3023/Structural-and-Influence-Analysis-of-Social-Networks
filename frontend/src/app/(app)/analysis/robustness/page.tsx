"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AnalysisGate, Card, ErrorBox, PageHeader, btn } from "@/components/ui";
import { METRICS, METRIC_LABEL, Robustness, api, errMsg, fmt } from "@/lib/api";
import { useNetwork } from "@/lib/store";
import { useGraph } from "@/lib/useGraph";
import GraphView from "@/components/GraphView";

const COLORS: Record<string, string> = {
  random: "#94a3b8", degree: "#3b82f6", betweenness: "#ef4444", closeness: "#22c55e",
  eigenvector: "#a855f7", pagerank: "#f59e0b", "betweenness (adaptive)": "#7f1d1d",
};

function Chart({ r, field }: { r: Robustness; field: "giant_frac" | "efficiency" }) {
  const data = useMemo(() => {
    const xs = Object.values(r.curves)[0]?.map((p) => p.removed_frac) ?? [];
    return xs.map((x, i) => ({ x: Math.round(x * 1000) / 10, ...Object.fromEntries(Object.entries(r.curves).map(([s, pts]) => [s, pts[i]?.[field]])) }));
  }, [r, field]);
  return (
    <div className="h-80">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 20, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="x" unit="%" tick={{ fontSize: 11 }} label={{ value: "People removed", position: "bottom", fontSize: 12 }} />
          <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number) => fmt(v)} labelFormatter={(l) => `${l}% removed`} />
          <Legend verticalAlign="top" />
          {Object.keys(r.curves).map((s) => <Line key={s} dataKey={s} stroke={COLORS[s] ?? "#000"} dot={false} strokeWidth={2} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function RobustnessPage() {
  const { current, analysis } = useNetwork();
  const g = useGraph(current?.id, analysis);
  const [result, setResult] = useState<Robustness | null>(null);
  const [strategies, setStrategies] = useState<string[]>(["random", "degree", "betweenness", "pagerank"]);
  const [adaptive, setAdaptive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setResult(analysis?.robustness ?? null), [analysis]);

  const run = async () => {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      setResult((await api.post<Robustness>(`/networks/${current.id}/robustness`, { strategies, adaptive })).data);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const toggle = (s: string) => setStrategies((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  const hasEff = result && Object.values(result.curves).some((c) => c.some((p) => p.efficiency !== null));
  const aps = analysis?.communities.articulation_points ?? [];

  return (
    <>
      <PageHeader title="Network Robustness" subtitle="What happens to the network when its most important people are removed?" />
      <AnalysisGate>
        {analysis && result && (
          <div className="space-y-6">
            <Card title="Simulation settings">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                {["random", ...METRICS].map((s) => (
                  <label key={s} className="flex items-center gap-2">
                    <input type="checkbox" checked={strategies.includes(s)} onChange={() => toggle(s)} />
                    {s === "random" ? "Random" : METRIC_LABEL[s as keyof typeof METRIC_LABEL]}
                  </label>
                ))}
                <label className="flex items-center gap-2" title="Recompute betweenness after each removal step. Slower but a stronger attack.">
                  <input type="checkbox" checked={adaptive} onChange={(e) => setAdaptive(e.target.checked)} /> Adaptive betweenness
                </label>
                <button className={btn} onClick={run} disabled={busy || !strategies.length}>{busy ? "Simulating..." : "Run simulation"}</button>
              </div>
              <div className="mt-3"><ErrorBox msg={error} /></div>
            </Card>
            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
              <Card title="Largest connected group as people are removed">
                <Chart r={result} field="giant_frac" />
              </Card>
              <Card title="Damage ranking">
                <p className="mb-3 text-xs text-slate-500">Area under the curve: lower means removing those people fragments the network faster.</p>
                <ol className="space-y-2 text-sm">
                  {Object.entries(result.auc).sort((a, b) => a[1] - b[1]).map(([s, v], i) => (
                    <li key={s} className="flex justify-between">
                      <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: COLORS[s] }} />{i + 1}. {s}</span>
                      <span className="font-mono">{fmt(v)}</span>
                    </li>
                  ))}
                </ol>
                {result.auc.random !== undefined && (
                  <p className="mt-4 text-sm text-slate-700">
                    Targeting by <b>{result.most_damaging}</b> is {fmt(result.auc.random / result.auc[result.most_damaging], 1)}× more damaging than random removal.
                  </p>
                )}
              </Card>
            </div>
            {hasEff && (
              <Card title="Global efficiency (how easily information travels)">
                <Chart r={result} field="efficiency" />
              </Card>
            )}
            <Card title={`Single points of failure (${aps.length})`}>
              <p className="mb-3 text-sm text-slate-500">Removing any one of these people disconnects part of the network.</p>
              {g.nodes.length > 0 && aps.length > 0 && (
                <div className="mb-4">
                  <GraphView nodes={g.vnodes} edges={g.vedges} height={460} vulnerable={aps} showLabels="none" />
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {aps.slice(0, 100).map((id) => (
                  <Link key={id} href={`/people/${id}`} className="rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-800 hover:bg-amber-100">
                    {analysis.metrics[String(id)]?.label ?? id}
                  </Link>
                ))}
                {!aps.length && <span className="text-sm text-slate-500">None. The network has no single point of failure.</span>}
              </div>
            </Card>
          </div>
        )}
      </AnalysisGate>
    </>
  );
}
