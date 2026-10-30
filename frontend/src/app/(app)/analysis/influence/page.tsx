"use client";

import Link from "next/link";
import { memo, useMemo, useState } from "react";
import { Bar as RBar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import Heatmap from "@/components/Heatmap";
import { AnalysisGate, Card, PageHeader, input } from "@/components/ui";
import { METRICS, METRIC_HELP, METRIC_LABEL, Metric, MetricName, communityColor, fmt } from "@/lib/api";

type Point = Metric & { id: string };

/** Memoised so switching the ranking metric doesn't redraw thousands of scatter points. */
const MetricScatter = memo(function MetricScatter({ points, x, y }: { points: Point[]; x: MetricName; y: MetricName }) {
  return (
    <div className="h-96">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" dataKey={x} name={METRIC_LABEL[x]} tick={{ fontSize: 11 }} label={{ value: METRIC_LABEL[x], position: "bottom", fontSize: 12 }} />
          <YAxis type="number" dataKey={y} name={METRIC_LABEL[y]} tick={{ fontSize: 11 }} />
          <Tooltip
            content={({ payload }) => {
              const d = payload?.[0]?.payload;
              return d ? <div className="rounded border bg-surface p-2 text-xs shadow">{d.label}<br />{METRIC_LABEL[x]} {fmt(d[x])}<br />{METRIC_LABEL[y]} {fmt(d[y])}</div> : null;
            }}
          />
          <Scatter data={points} isAnimationActive={points.length < 500}>
            {points.map((r) => <Cell key={r.id} fill={communityColor(r.community)} />)}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
});
import { useNetwork } from "@/lib/store";

export default function Influence() {
  const { analysis } = useNetwork();
  const [metric, setMetric] = useState<MetricName>("pagerank");
  const [k, setK] = useState(15);
  const [x, setX] = useState<MetricName>("degree");
  const [y, setY] = useState<MetricName>("betweenness");

  const points: Point[] = useMemo(
    () => (analysis ? Object.entries(analysis.metrics).map(([id, m]) => ({ ...m, id })) : []),
    [analysis],
  );
  const ranked = useMemo(() => [...points].sort((a, b) => b[metric] - a[metric]), [points, metric]);
  const top = ranked.slice(0, k);
  const topDeg = ranked.length ? [...ranked].sort((a, b) => b.degree - a.degree)[0] : null;
  const topBtw = ranked.length ? [...ranked].sort((a, b) => b.betweenness - a.betweenness)[0] : null;

  return (
    <>
      <PageHeader title="Influence Analysis" subtitle="Different centrality measures capture different kinds of importance." />
      <AnalysisGate>
        {analysis && (
          <div className="space-y-6">
            <div className="grid gap-3 md:grid-cols-5">
              {METRICS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={`rounded-xl border p-3 text-left text-sm ${metric === m ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-surface hover:bg-slate-50"}`}
                >
                  <p className="font-semibold text-slate-800">{METRIC_LABEL[m]}</p>
                  <p className="text-xs text-slate-500">{METRIC_HELP[m]}</p>
                </button>
              ))}
            </div>

            <Card
              title={`Top ${k} by ${METRIC_LABEL[metric]}`}
              action={
                <select className={`${input} w-auto`} value={k} onChange={(e) => setK(Number(e.target.value))} aria-label="How many">
                  {[10, 15, 25, 50].map((n) => <option key={n} value={n}>Top {n}</option>)}
                </select>
              }
            >
              <div style={{ height: Math.max(240, top.length * 24) }}>
                <ResponsiveContainer>
                  <BarChart data={top} layout="vertical" margin={{ left: 20, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 11 }} interval={0} tickFormatter={(v: string) => (v.length > 22 ? v.slice(0, 21) + "…" : v)} />
                    <Tooltip formatter={(v: number) => fmt(v, 4)} />
                    <RBar dataKey={metric} radius={[0, 4, 4, 0]}>
                      {top.map((r) => <Cell key={r.id} fill={communityColor(r.community)} />)}
                    </RBar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-xs text-slate-400">Bar colour = community.</p>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="Does the most-connected person also bridge the most?">
                <p className="text-sm text-slate-700">
                  Highest degree: <b>{topDeg?.label}</b> · Highest betweenness: <b>{topBtw?.label}</b>
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  {topDeg?.id === topBtw?.id
                    ? "The same person dominates both, acting as both hub and bridge."
                    : "Different people: having many connections is not the same as linking separate groups."}
                </p>
                <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-700">Rank correlation (Spearman)</h3>
                <Heatmap data={analysis.comparison.correlation} keys={analysis.comparison.metrics} />
                <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-700">Top-{analysis.comparison.k} overlap</h3>
                <Heatmap data={analysis.comparison.overlap} keys={analysis.comparison.metrics} />
              </Card>
              <Card
                title="Compare two metrics"
                action={
                  <div className="flex gap-2">
                    {[{ v: x, s: setX }, { v: y, s: setY }].map((o, i) => (
                      <select key={i} className={`${input} w-auto`} value={o.v} onChange={(e) => o.s(e.target.value as MetricName)} aria-label={i ? "Y axis" : "X axis"}>
                        {METRICS.map((m) => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}
                      </select>
                    ))}
                  </div>
                }
              >
                <MetricScatter points={points} x={x} y={y} />
                <p className="text-xs text-slate-400">People far from the diagonal are where the two metrics disagree.</p>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="Bridge people (span several communities)">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500"><tr><th className="py-1">Person</th><th>Communities touched</th><th>Participation</th><th>Betweenness</th></tr></thead>
                  <tbody>
                    {analysis.communities.bridges.map((b) => (
                      <tr key={b.node} className="border-t border-slate-100">
                        <td className="py-1.5"><Link className="text-blue-600 hover:underline" href={`/people/${b.node}`}>{b.label}</Link></td>
                        <td>{b.communities_touched}</td><td className="font-mono text-xs">{fmt(b.participation)}</td><td className="font-mono text-xs">{fmt(b.betweenness)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <Card title="Network insights">
                <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">{analysis.insights.map((i) => <li key={i}>{i}</li>)}</ul>
              </Card>
            </div>

            <Card title="Full ranking">
              <div className="max-h-[500px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface text-left text-slate-500">
                    <tr><th className="py-2">#</th><th>Person</th>{METRICS.map((m) => <th key={m}>{METRIC_LABEL[m]}</th>)}</tr>
                  </thead>
                  <tbody>
                    {ranked.slice(0, 500).map((r, i) => (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="py-1.5 text-slate-400">{i + 1}</td>
                        <td><Link className="text-blue-600 hover:underline" href={`/people/${r.id}`}>{r.label}</Link></td>
                        {METRICS.map((m) => <td key={m} className={`font-mono text-xs ${m === metric ? "font-bold" : ""}`}>{fmt(r[m])}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </AnalysisGate>
    </>
  );
}
