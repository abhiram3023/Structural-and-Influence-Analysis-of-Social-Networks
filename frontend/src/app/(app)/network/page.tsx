"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Link2, Plus, Trash2, UserPlus } from "lucide-react";
import GraphView from "@/components/GraphView";
import { Card, ErrorBox, NoNetwork, PageHeader, Spinner, btn, btnDanger, btnGhost, input } from "@/components/ui";
import { api, errMsg, fmt } from "@/lib/api";
import { useNetwork } from "@/lib/store";
import { useGraph } from "@/lib/useGraph";

export default function MyNetwork() {
  const { current, analysis, refresh, loading, stale, runAnalysis, running } = useNetwork();
  const g = useGraph(current?.id, analysis);
  const [selected, setSelected] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [labels, setLabels] = useState<"all" | "top" | "none">("top");
  const [showWeak, setShowWeak] = useState(false);
  const weak = useMemo(() => analysis?.communities.articulation_points ?? [], [analysis]);
  const [newPerson, setNewPerson] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rename, setRename] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const byLabel = useMemo(() => new Map(g.nodes.map((n) => [n.label, n.id])), [g.nodes]);
  const byId = useMemo(() => new Map(g.nodes.map((n) => [n.id, n])), [g.nodes]);
  const sel = selected != null ? byId.get(selected) : undefined;
  const selEdges = useMemo(
    () => (selected == null ? [] : g.edges.filter((e) => e.source_id === selected || e.target_id === selected)),
    [g.edges, selected],
  );

  if (loading) return <Spinner />;
  if (!current) return <NoNetwork />;

  const mutate = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await Promise.all([g.reload(), refresh()]);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const base = `/networks/${current.id}`;

  const addPerson = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPerson.trim()) return;
    mutate(async () => {
      const r = await api.post(`${base}/nodes`, { label: newPerson.trim() });
      setSelected(r.data.id);
      setNewPerson("");
    });
  };
  const addEdge = (e: React.FormEvent) => {
    e.preventDefault();
    const s = byLabel.get((from.trim() || sel?.label) ?? "");
    const t = byLabel.get(to.trim());
    if (s === undefined || t === undefined) {
      setError("Pick two existing people (type to search the list).");
      return;
    }
    mutate(async () => {
      await api.post(`${base}/edges`, { source_id: s, target_id: t });
      setTo("");
    });
  };

  const tooBig = g.nodes.length > 3000;

  return (
    <>
      <PageHeader
        title="My Network"
        subtitle={`${current.node_count.toLocaleString()} people · ${current.edge_count.toLocaleString()} connections. Click a person to see and edit their connections.`}
        action={
          (stale || !analysis) && (
            <button className={btn} onClick={runAnalysis} disabled={running}>
              {running ? "Analysing..." : analysis ? "Re-run analysis" : "Run analysis"}
            </button>
          )
        }
      />
      <datalist id="people">{g.nodes.slice(0, 5000).map((n) => <option key={n.id} value={n.label} />)}</datalist>
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card>
          <div className="mb-3 flex flex-wrap gap-2">
            <input className={`${input} max-w-xs`} placeholder="Search and highlight..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className={`${input} w-auto`} value={labels} onChange={(e) => setLabels(e.target.value as typeof labels)} aria-label="Labels">
              <option value="top">Label top people</option>
              <option value="all">Label everyone</option>
              <option value="none">No labels</option>
            </select>
            {weak.length > 0 && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={showWeak} onChange={(e) => setShowWeak(e.target.checked)} /> Highlight weak points
              </label>
            )}
          </div>
          {g.loading && !g.nodes.length ? (
            <Spinner />
          ) : tooBig ? (
            <p className="py-10 text-sm text-slate-500">This network has {g.nodes.length.toLocaleString()} people — too many to draw interactively. Use the People and Analysis pages.</p>
          ) : g.nodes.length === 0 ? (
            <p className="py-10 text-sm text-slate-500">No people yet. Add someone on the right, or <Link className="text-blue-600 underline" href="/import">import a CSV</Link>.</p>
          ) : (
            <GraphView nodes={g.vnodes} edges={g.vedges} selected={selected} highlight={search} showLabels={labels} onSelect={setSelected} height={620} vulnerable={showWeak ? weak : undefined} />
          )}
          <ErrorBox msg={g.error} />
        </Card>

        <div className="space-y-4">
          <ErrorBox msg={error} />
          {sel && (
            <Card title={sel.label} action={<Link href={`/people/${sel.id}`} className="text-sm text-blue-600 hover:underline">Profile</Link>}>
              {analysis?.metrics[String(sel.id)] && (
                <p className="mb-3 text-xs text-slate-500">
                  PageRank {fmt(analysis.metrics[String(sel.id)].pagerank)} · Betweenness {fmt(analysis.metrics[String(sel.id)].betweenness)} · Community {analysis.metrics[String(sel.id)].community + 1}
                </p>
              )}
              <form
                className="mb-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (rename.trim()) mutate(() => api.patch(`${base}/nodes/${sel.id}`, { label: rename.trim() }).then(() => setRename("")));
                }}
              >
                <input className={input} placeholder="Rename..." value={rename} onChange={(e) => setRename(e.target.value)} />
                <button className={btnGhost} disabled={busy}>Save</button>
              </form>
              <p className="mb-2 text-sm font-medium text-slate-700">Connections ({selEdges.length})</p>
              <ul className="max-h-64 space-y-1 overflow-auto text-sm">
                {selEdges.map((e) => {
                  const other = byId.get(e.source_id === sel.id ? e.target_id : e.source_id);
                  return (
                    <li key={e.id} className="flex items-center justify-between rounded px-2 py-1 hover:bg-slate-50">
                      <button className="truncate text-left hover:text-blue-600" onClick={() => setSelected(other?.id ?? null)}>{other?.label}</button>
                      <button className="text-slate-400 hover:text-red-600" title="Remove connection" aria-label={`Remove connection to ${other?.label}`} disabled={busy} onClick={() => mutate(() => api.delete(`${base}/edges/${e.id}`))}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                className={`${btnDanger} mt-4 w-full`}
                disabled={busy}
                onClick={() => {
                  if (confirm(`Remove ${sel.label} and all their connections?`))
                    mutate(() => api.delete(`${base}/nodes/${sel.id}`).then(() => setSelected(null)));
                }}
              >
                <Trash2 className="h-4 w-4" /> Remove person
              </button>
            </Card>
          )}

          <Card title={<span className="flex items-center gap-2"><UserPlus className="h-4 w-4" /> Add person</span>}>
            <form onSubmit={addPerson} className="flex gap-2">
              <input className={input} placeholder="Name" value={newPerson} onChange={(e) => setNewPerson(e.target.value)} />
              <button className={btn} disabled={busy} aria-label="Add person"><Plus className="h-4 w-4" /></button>
            </form>
          </Card>

          <Card title={<span className="flex items-center gap-2"><Link2 className="h-4 w-4" /> Add connection</span>}>
            <form onSubmit={addEdge} className="space-y-2">
              <input className={input} list="people" placeholder="From" value={from || (sel?.label ?? "")} onChange={(e) => setFrom(e.target.value)} />
              <input className={input} list="people" placeholder="To" value={to} onChange={(e) => setTo(e.target.value)} />
              <button className={`${btn} w-full`} disabled={busy}>Connect</button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
