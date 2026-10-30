"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Bar as RBar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import GraphView from "@/components/GraphView";
import { AnalysisGate, Card, PageHeader, Spinner } from "@/components/ui";
import { communityColor, fmt } from "@/lib/api";
import { useNetwork } from "@/lib/store";
import { useTheme } from "@/lib/theme";
import { useGraph } from "@/lib/useGraph";

export default function Communities() {
  const { current, analysis } = useNetwork();
  const g = useGraph(current?.id, analysis);
  const [focus, setFocus] = useState<number | null>(null);
  const muted = useTheme().theme === "dark" ? "#334155" : "#e2e8f0";

  const members = useMemo(() => {
    if (!analysis || focus === null) return [];
    return Object.entries(analysis.metrics)
      .filter(([, m]) => m.community === focus)
      .sort((a, b) => b[1].pagerank - a[1].pagerank);
  }, [analysis, focus]);

  // fade everything outside the focused community
  const vnodes = useMemo(
    () => (focus === null || !analysis ? g.vnodes : g.vnodes.map((n) => (analysis.metrics[String(n.id)]?.community === focus ? n : { ...n, color: muted }))),
    [g.vnodes, focus, analysis, muted],
  );

  return (
    <>
      <PageHeader title="Community Analysis" subtitle="Groups of people more strongly connected to each other than to the rest of the network (Louvain)." />
      <AnalysisGate>
        {analysis && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              {Object.entries(analysis.communities.algorithms).map(([name, a]) => (
                <div key={name} className="rounded-xl border border-slate-200 bg-surface p-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-800">{name}</p>
                  <p className="mt-1 text-2xl font-bold">{a.count} <span className="text-sm font-normal text-slate-500">communities</span></p>
                  <p className="text-sm text-slate-500">Modularity {fmt(a.modularity)}</p>
                </div>
              ))}
            </div>
            <p className="-mt-3 text-xs text-slate-400">Modularity measures how much denser communities are internally than expected by chance (higher is better; above 0.3 indicates clear structure).</p>

            <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
              <Card title="Community map" action={focus !== null && <button className="text-sm text-blue-600" onClick={() => setFocus(null)}>Show all</button>}>
                {g.loading && !g.nodes.length ? <Spinner /> : g.nodes.length > 3000 ? <p className="text-sm text-slate-500">Too large to draw.</p> : (
                  <GraphView nodes={vnodes} edges={g.vedges} height={520} onSelect={(id) => id != null && setFocus(analysis.metrics[String(id)]?.community ?? null)} />
                )}
                <p className="mt-2 text-xs text-slate-400">Click a person to focus on their community.</p>
              </Card>
              <Card title="Community sizes">
                <div className="h-72">
                  <ResponsiveContainer>
                    <BarChart data={analysis.communities.profiles.map((p) => ({ name: `C${p.community + 1}`, size: p.size, c: p.community }))}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <RBar dataKey="size" onClick={(d: { payload?: { c: number } }) => setFocus(d.payload?.c ?? null)} cursor="pointer">
                        {analysis.communities.profiles.map((p) => <Cell key={p.community} fill={communityColor(p.community)} opacity={focus === null || focus === p.community ? 1 : 0.3} />)}
                      </RBar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {focus !== null && (
                  <div className="mt-4">
                    <p className="mb-2 text-sm font-semibold">Community {focus + 1} members ({members.length})</p>
                    <ul className="max-h-60 space-y-1 overflow-auto text-sm">
                      {members.slice(0, 200).map(([id, m]) => (
                        <li key={id} className="flex justify-between">
                          <Link className="text-blue-600 hover:underline" href={`/people/${id}`}>{m.label}</Link>
                          <span className="font-mono text-xs text-slate-500">PR {fmt(m.pagerank)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            </div>

            <Card title="Group statistics">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="py-2">Community</th><th>Size</th><th>Internal links</th><th>External links</th>
                      <th title="Share of possible internal links that exist">Internal density</th>
                      <th title="Share of links leaving the group (lower = more self-contained)">Conductance</th>
                      <th>Avg clustering</th><th>Hub</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.communities.profiles.map((p) => (
                      <tr key={p.community} className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${focus === p.community ? "bg-blue-50" : ""}`} onClick={() => setFocus(p.community)}>
                        <td className="py-2"><span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: communityColor(p.community) }} />{p.community + 1}</span></td>
                        <td>{p.size}</td><td>{p.internal_edges}</td><td>{p.external_edges}</td>
                        <td className="font-mono text-xs">{fmt(p.internal_density)}</td><td className="font-mono text-xs">{fmt(p.conductance)}</td>
                        <td className="font-mono text-xs">{fmt(p.avg_clustering)}</td>
                        <td><Link className="text-blue-600 hover:underline" href={`/people/${p.hub}`} onClick={(e) => e.stopPropagation()}>{p.hub_label}</Link></td>
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
