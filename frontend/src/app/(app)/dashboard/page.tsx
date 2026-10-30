"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Boxes, Link2, Sparkles, Users } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import GraphView from "@/components/GraphView";
import { AnalysisGate, Bar, Card, NoNetwork, PageHeader, Spinner, Stat } from "@/components/ui";
import { api, communityColor, fmt } from "@/lib/api";
import { useNetwork } from "@/lib/store";
import { useGraph } from "@/lib/useGraph";

interface Dash {
  networks: number;
  total_people: number;
  total_connections: number;
  recent_activity: { message: string; created_at: string }[];
}

export default function Dashboard() {
  const { current, analysis, loading } = useNetwork();
  const [dash, setDash] = useState<Dash | null>(null);
  const g = useGraph(current?.id, analysis);
  const [showWeak, setShowWeak] = useState(true);
  const weak = useMemo(() => analysis?.communities.articulation_points ?? [], [analysis]);

  useEffect(() => {
    api.get<Dash>("/dashboard").then((r) => setDash(r.data));
  }, [current?.updated_at, analysis?.id]);

  if (loading) return <Spinner />;

  const top = analysis
    ? Object.entries(analysis.metrics).sort((a, b) => b[1].pagerank - a[1].pagerank).slice(0, 6)
    : [];
  const pie = analysis?.communities.profiles.map((p) => ({ name: `Community ${p.community + 1}`, value: p.size, c: p.community })) ?? [];
  const totalPie = pie.reduce((s, p) => s + p.value, 0);

  return (
    <>
      <PageHeader
        title={current ? current.name : "Dashboard"}
        subtitle={current?.description || `${dash?.networks ?? 0} networks · ${dash?.total_people ?? 0} people in total`}
      />
      {!current ? (
        <NoNetwork />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Total people" value={current.node_count.toLocaleString()} icon={<Users className="h-5 w-5" />} />
            <Stat label="Connections" value={current.edge_count.toLocaleString()} icon={<Link2 className="h-5 w-5" />} />
            <Stat label="Communities" value={analysis?.communities.algorithms.Louvain.count ?? "—"} icon={<Boxes className="h-5 w-5" />} />
            <Stat
              label="Bridge people"
              value={analysis?.communities.articulation_points.length ?? "—"}
              hint="single points of failure"
              icon={<Sparkles className="h-5 w-5" />}
            />
          </div>

          <AnalysisGate>
            {analysis && (
              <div className="grid gap-6 lg:grid-cols-3">
                <Card
                  title="Network visualization"
                  className="lg:col-span-2"
                  action={
                    <div className="flex items-center gap-4 text-sm">
                      {weak.length > 0 && (
                        <label className="flex items-center gap-2 text-slate-600">
                          <input type="checkbox" checked={showWeak} onChange={(e) => setShowWeak(e.target.checked)} /> Highlight weak points
                        </label>
                      )}
                      <Link href="/network" className="text-blue-600 hover:underline">Open editor</Link>
                    </div>
                  }
                >
                  {g.loading && !g.nodes.length ? <Spinner /> : <GraphView nodes={g.vnodes} edges={g.vedges} height={420} vulnerable={showWeak ? weak : undefined} />}
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                    {analysis.communities.profiles.slice(0, 10).map((p) => (
                      <span key={p.community} className="flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: communityColor(p.community) }} /> Community {p.community + 1}
                      </span>
                    ))}
                    <span>· node size = PageRank</span>
                  </div>
                </Card>
                <div className="space-y-6">
                  <Card title="Top influential people" action={<Link href="/analysis/influence" className="text-sm text-blue-600 hover:underline">All</Link>}>
                    <ul className="space-y-3">
                      {top.map(([id, m]) => (
                        <li key={id}>
                          <Link href={`/people/${id}`} className="flex items-center justify-between text-sm hover:text-blue-600">
                            <span className="truncate">{m.label}</span>
                            <span className="font-mono text-xs text-slate-500">{fmt(m.pagerank)}</span>
                          </Link>
                          <Bar value={m.pagerank} max={top[0][1].pagerank} color={communityColor(m.community)} />
                        </li>
                      ))}
                    </ul>
                  </Card>
                  <Card title="Community distribution">
                    <div className="h-48">
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie data={pie} dataKey="value" nameKey="name" innerRadius={40} outerRadius={75}>
                            {pie.map((p) => <Cell key={p.c} fill={communityColor(p.c)} />)}
                          </Pie>
                          <Tooltip formatter={(v: number) => `${v} people (${((v / totalPie) * 100).toFixed(0)}%)`} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                </div>
                <Card title="Key insights" className="lg:col-span-2">
                  <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
                    {analysis.insights.map((i) => <li key={i}>{i}</li>)}
                  </ul>
                  <p className="mt-4 text-xs text-slate-400">Centrality measures structural importance, not proven real-world persuasion.</p>
                </Card>
                <Card title="Recent activity">
                  <ul className="space-y-3 text-sm">
                    {dash?.recent_activity.map((a, i) => (
                      <li key={i} className="border-l-2 border-blue-200 pl-3">
                        <p className="text-slate-700">{a.message}</p>
                        <p className="text-xs text-slate-400">{new Date(a.created_at).toLocaleString()}</p>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            )}
          </AnalysisGate>
        </div>
      )}
    </>
  );
}
