"use client";

import { useEffect, useState } from "react";
import { Download, Pencil, Trash2 } from "lucide-react";
import { Card, ErrorBox, NoNetwork, PageHeader, Spinner, btnDanger, btnGhost, input } from "@/components/ui";
import { api, errMsg, fmt } from "@/lib/api";
import { useNetwork } from "@/lib/store";

interface Run { id: number; created_at: string; nodes: number; edges: number; communities: number; modularity: number }

const FORMATS = [
  { f: "md", l: "Report (Markdown)", d: "Structure, insights, top people, communities, robustness" },
  { f: "csv", l: "Metrics (CSV)", d: "Every person with all centrality scores and community" },
  { f: "json", l: "Full results (JSON)", d: "Complete analysis output for further processing" },
];

export default function Reports() {
  const { current, analysis, networks, refresh, loading } = useNetwork();
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (current) api.get<Run[]>(`/networks/${current.id}/analysis`).then((r) => setRuns(r.data));
  }, [current, analysis?.id]);

  if (loading) return <Spinner />;
  if (!current) return <NoNetwork />;

  const download = async (format: string) => {
    setError(null);
    try {
      const r = await api.get(`/networks/${current.id}/reports/export`, { params: { format }, responseType: "blob" });
      const name = /filename="(.+)"/.exec(r.headers["content-disposition"] ?? "")?.[1] ?? `report.${format}`;
      const url = URL.createObjectURL(r.data);
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  return (
    <>
      <PageHeader title="Reports" subtitle={`Export results for “${current.name}” and manage your networks.`} />
      <ErrorBox msg={error} />
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <Card title="Export results">
          {!analysis ? <p className="text-sm text-slate-500">Run analysis first to export results.</p> : (
            <ul className="space-y-3">
              {FORMATS.map(({ f, l, d }) => (
                <li key={f} className="flex items-center justify-between gap-3">
                  <div><p className="text-sm font-medium">{l}</p><p className="text-xs text-slate-500">{d}</p></div>
                  <button className={btnGhost} onClick={() => download(f)}><Download className="h-4 w-4" /> Download</button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Analysis history">
          {!runs.length ? <p className="text-sm text-slate-500">No analyses yet.</p> : (
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500"><tr><th className="py-1">Run</th><th>People</th><th>Links</th><th>Communities</th><th>Modularity</th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="py-1.5">{new Date(r.created_at).toLocaleString()}</td>
                    <td>{r.nodes}</td><td>{r.edges}</td><td>{r.communities}</td><td className="font-mono text-xs">{fmt(r.modularity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Your networks" className="lg:col-span-2">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500"><tr><th className="py-1">Name</th><th>People</th><th>Connections</th><th>Updated</th><th /></tr></thead>
            <tbody>
              {networks.map((n) => (
                <tr key={n.id} className="border-t border-slate-100">
                  <td className="py-2">
                    {editing === n.id ? (
                      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); act(() => api.patch(`/networks/${n.id}`, { name: newName })).then(() => setEditing(null)); }}>
                        <input className={input} value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
                        <button className={btnGhost}>Save</button>
                      </form>
                    ) : n.name}
                  </td>
                  <td>{n.node_count}</td><td>{n.edge_count}</td><td>{new Date(n.updated_at).toLocaleDateString()}</td>
                  <td className="flex justify-end gap-2 py-2">
                    <button className={btnGhost} title="Rename" aria-label={`Rename ${n.name}`} onClick={() => { setEditing(n.id); setNewName(n.name); }}><Pencil className="h-4 w-4" /></button>
                    <button className={btnDanger} title="Delete" aria-label={`Delete ${n.name}`} onClick={() => confirm(`Delete “${n.name}” and all its data? This cannot be undone.`) && act(() => api.delete(`/networks/${n.id}`))}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
