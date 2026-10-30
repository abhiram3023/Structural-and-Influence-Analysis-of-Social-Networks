"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { Card, ErrorBox, NoNetwork, PageHeader, Spinner, Stat } from "@/components/ui";
import { METRICS, METRIC_HELP, METRIC_LABEL, Metric, api, communityColor, errMsg, fmt } from "@/lib/api";
import { useNetwork } from "@/lib/store";

interface Person {
  id: number;
  label: string;
  attributes: Record<string, unknown>;
  degree: number;
  total_nodes: number;
  metrics: Metric | null;
  analysed_at: string | null;
  neighbours: { id: number; label: string; weight: number; pagerank: number | null }[];
}

export default function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const { current, loading } = useNetwork();
  const [p, setP] = useState<Person | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!current) return;
    setP(null);
    api.get<Person>(`/networks/${current.id}/people/${id}`).then((r) => setP(r.data)).catch((e) => setError(errMsg(e)));
  }, [current, id]);

  if (loading) return <Spinner />;
  if (!current) return <NoNetwork />;
  if (error) return <ErrorBox msg={error} />;
  if (!p) return <Spinner />;
  const m = p.metrics;
  const attrs = Object.entries(p.attributes).filter(([k]) => k !== "label");

  return (
    <>
      <Link href="/people" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-blue-600"><ArrowLeft className="h-4 w-4" /> All people</Link>
      <PageHeader
        title={p.label}
        subtitle={m ? `Community ${m.community + 1} · ${p.degree} direct connections` : `${p.degree} direct connections · run analysis for metrics`}
      />
      {m?.is_articulation_point && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <ShieldAlert className="h-4 w-4" /> Single point of failure: removing {p.label} would split the network.
        </div>
      )}
      {m && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
          {METRICS.map((k) => (
            <Stat key={k} label={METRIC_LABEL[k]} value={fmt(m[k])} hint={`Rank ${m[`${k}_rank`] as number} of ${p.total_nodes} · ${METRIC_HELP[k]}`} />
          ))}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Direct connections (${p.neighbours.length})`}>
          <ul className="max-h-[480px] divide-y divide-slate-100 overflow-auto text-sm">
            {p.neighbours.map((n) => (
              <li key={n.id} className="flex items-center justify-between py-2">
                <Link href={`/people/${n.id}`} className="text-blue-600 hover:underline">{n.label}</Link>
                <span className="font-mono text-xs text-slate-500">
                  {n.weight !== 1 && `weight ${fmt(n.weight, 1)} · `}PR {fmt(n.pagerank)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Profile details">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-slate-500">Name</dt><dd>{p.label}</dd>
            {m && (<><dt className="text-slate-500">Community</dt><dd className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: communityColor(m.community) }} />{m.community + 1}</dd></>)}
            {m && (<><dt className="text-slate-500">Local clustering</dt><dd>{fmt(m.clustering)} <span className="text-xs text-slate-400">(how connected their friends are to each other)</span></dd></>)}
            {attrs.map(([k, v]) => (<Fragment key={k}><dt className="text-slate-500">{k === "source_id" ? "Original ID" : k}</dt><dd>{String(v)}</dd></Fragment>))}
            {p.analysed_at && (<><dt className="text-slate-500">Metrics from</dt><dd>{new Date(p.analysed_at).toLocaleString()}</dd></>)}
          </dl>
        </Card>
      </div>
    </>
  );
}
