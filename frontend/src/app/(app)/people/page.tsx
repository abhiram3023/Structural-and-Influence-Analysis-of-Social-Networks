"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, Suspense, useEffect, useMemo, useState } from "react";
import { Card, NoNetwork, PageHeader, Spinner, input } from "@/components/ui";
import { METRICS, METRIC_LABEL, MetricName, communityColor, fmt } from "@/lib/api";
import { useNetwork } from "@/lib/store";
import { useGraph } from "@/lib/useGraph";

const PAGE = 50;

function People() {
  const params = useSearchParams();
  const { current, analysis, loading } = useNetwork();
  const g = useGraph(current?.id, analysis);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [sort, setSort] = useState<MetricName | "label" | "connections">(analysis ? "pagerank" : "connections");
  const [page, setPage] = useState(0);

  useEffect(() => setQ(params.get("q") ?? ""), [params]);
  useEffect(() => setPage(0), [q, sort]);

  const rows = useMemo(() => {
    const deg = new Map<number, number>();
    g.edges.forEach((e) => {
      deg.set(e.source_id, (deg.get(e.source_id) ?? 0) + 1);
      deg.set(e.target_id, (deg.get(e.target_id) ?? 0) + 1);
    });
    const needle = q.trim().toLowerCase();
    const list = g.nodes
      .filter((n) => !needle || n.label.toLowerCase().includes(needle))
      .map((n) => ({ id: n.id, label: n.label, connections: deg.get(n.id) ?? 0, m: analysis?.metrics[String(n.id)] }));
    return list.sort((a, b) =>
      sort === "label" ? a.label.localeCompare(b.label)
        : sort === "connections" ? b.connections - a.connections
        : (b.m?.[sort] ?? -1) - (a.m?.[sort] ?? -1),
    );
  }, [g.nodes, g.edges, analysis, q, sort]);

  if (loading) return <Spinner />;
  if (!current) return <NoNetwork />;

  const shown = rows.slice(page * PAGE, (page + 1) * PAGE);
  const th = (key: typeof sort, label: string) => (
    <th className="cursor-pointer px-3 py-2 text-left font-medium hover:text-blue-600" onClick={() => setSort(key)}>
      {label}{sort === key ? " ↓" : ""}
    </th>
  );

  return (
    <>
      <PageHeader title="People & Profiles" subtitle={`${rows.length.toLocaleString()} of ${g.nodes.length.toLocaleString()} people`} />
      <Card>
        <input className={`${input} mb-4 max-w-sm`} placeholder="Search by name..." value={q} onChange={(e) => setQ(e.target.value)} />
        {!analysis && <p className="mb-3 text-sm text-amber-700">Run analysis to see influence metrics for each person.</p>}
        {g.loading && !g.nodes.length ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  {th("label", "Person")}
                  {th("connections", "Connections")}
                  {analysis && METRICS.map((m) => <Fragment key={m}>{th(m, METRIC_LABEL[m])}</Fragment>)}
                  {analysis && <th className="px-3 py-2 text-left font-medium">Community</th>}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2"><Link className="text-blue-600 hover:underline" href={`/people/${r.id}`}>{r.label}</Link></td>
                    <td className="px-3 py-2">{r.connections}</td>
                    {analysis && METRICS.map((m) => <td key={m} className="px-3 py-2 font-mono text-xs">{fmt(r.m?.[m])}</td>)}
                    {analysis && (
                      <td className="px-3 py-2">
                        {r.m && <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: communityColor(r.m.community) }} />{r.m.community + 1}</span>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > PAGE && (
          <div className="mt-4 flex items-center gap-3 text-sm">
            <button className="text-blue-600 disabled:text-slate-300" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
            <span className="text-slate-500">Page {page + 1} of {Math.ceil(rows.length / PAGE)}</span>
            <button className="text-blue-600 disabled:text-slate-300" disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        )}
      </Card>
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<Spinner />}><People /></Suspense>;
}
