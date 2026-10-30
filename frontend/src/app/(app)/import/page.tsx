"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Database, FilePlus2, Upload } from "lucide-react";
import NamesUpload from "@/components/NamesUpload";
import { Card, ErrorBox, PageHeader, btn, btnGhost, input } from "@/components/ui";
import { Network, api, errMsg } from "@/lib/api";
import { useNetwork } from "@/lib/store";

interface Dataset { name: string; description: string }
type Report = Record<string, number | string | string[]>;

const REPORT_LABELS: Record<string, string> = {
  raw_rows: "Rows read",
  dropped_missing: "Dropped (missing values)",
  dropped_self_loops: "Dropped (self-connections)",
  merged_duplicates: "Merged duplicates",
  isolated_nodes_added: "Isolated people",
  nodes_added: "New people added",
  edges_added: "New connections added",
  nodes: "People in file",
  edges: "Connections in file",
};

export default function ImportPage() {
  const router = useRouter();
  const { current, networks, refresh, select } = useNetwork();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // new network
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  // upload
  const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [weight, setWeight] = useState("");
  const [into, setInto] = useState<"current" | "new">("current");
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    api.get<Dataset[]>("/datasets").then((r) => setDatasets(r.data));
  }, []);
  useEffect(() => {
    if (!networks.length) setInto("new");
  }, [networks.length]);

  const pickFile = async (f: File | null) => {
    setFile(f);
    setReport(null);
    setColumns([]);
    if (!f || !f.name.toLowerCase().endsWith(".csv")) return;
    const head = (await f.slice(0, 4096).text()).split(/\r?\n/)[0] ?? "";
    let cols = head.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    // a first row of numbers (e.g. "1,11553") is data, not a header; the backend names these "column N" too
    if (cols.every((c) => c !== "" && !isNaN(Number(c)))) cols = cols.map((_, i) => `column ${i + 1}`);
    setColumns(cols);
    setSource(cols[0] ?? "");
    setTarget(cols[1] ?? "");
    setWeight(cols.find((c) => /weight|count|strength/i.test(c)) ?? "");
  };

  const wrap = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const createEmpty = (e: React.FormEvent) => {
    e.preventDefault();
    wrap("create", async () => {
      const r = await api.post<Network>("/networks", { name, description: desc });
      await refresh();
      select(r.data.id);
      router.push("/network");
    });
  };

  const loadSample = (dataset: string) =>
    wrap(dataset, async () => {
      const r = await api.post<Network>("/networks/sample", { dataset });
      await refresh();
      select(r.data.id);
      router.push("/dashboard");
    });

  const upload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    wrap("upload", async () => {
      let id = current?.id;
      if (into === "new" || !id) {
        id = (await api.post<Network>("/networks", { name: file.name.replace(/\.[^.]+$/, ""), description: `Imported from ${file.name}` })).data.id;
      }
      const fd = new FormData();
      fd.append("file", file);
      if (columns.length > 1) {
        fd.append("source", source);
        fd.append("target", target);
        if (weight) fd.append("weight", weight);
      }
      const r = await api.post<{ report: Report }>(`/networks/${id}/import`, fd);
      setReport(r.data.report);
      await refresh();
      select(id);
    });
  };

  return (
    <>
      <PageHeader title="Import / Build Network" subtitle="Upload relationship data, start from a research dataset, or build a network by hand." />
      <ErrorBox msg={error} />
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><Upload className="h-4 w-4" /> Upload CSV or JSON</span>}>
          <form onSubmit={upload} className="space-y-4 text-sm">
            <p className="text-slate-500">
              CSV: one connection per row (e.g. <code>source,target,weight</code>). JSON: <code>{"{nodes:[...], edges:[{source,target}]}"}</code>.
              Missing values, self-connections and duplicate or reversed rows are cleaned automatically.
            </p>
            <input type="file" accept=".csv,.json,.txt" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
            {file && file.size > 50 * 1024 * 1024 && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
                This file is {(file.size / 2 ** 20).toFixed(0)} MB, above the 50 MB upload limit. Create a sample with{" "}
                <code>python tools/sample_large_graph.py {file.name}</code> and upload the CSV it writes.
              </p>
            )}
            {columns.length === 1 && (
              <p className="text-slate-500">One column found: this will be imported as a list of people. Upload the connections file afterwards into the same network.</p>
            )}
            {columns.length > 1 && (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { l: "Source column", v: source, s: setSource, opt: false },
                  { l: "Target column", v: target, s: setTarget, opt: false },
                  { l: "Weight (optional)", v: weight, s: setWeight, opt: true },
                ].map((c) => (
                  <label key={c.l} className="text-xs text-slate-600">
                    {c.l}
                    <select className={`${input} mt-1`} value={c.v} onChange={(e) => c.s(e.target.value)}>
                      {c.opt && <option value="">none</option>}
                      {columns.map((col) => <option key={col} value={col}>{col}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            )}
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input type="radio" checked={into === "current"} disabled={!current} onChange={() => setInto("current")} /> Add to “{current?.name ?? "—"}”
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={into === "new"} onChange={() => setInto("new")} /> New network
              </label>
            </div>
            <button className={btn} disabled={!file || file.size > 50 * 1024 * 1024 || busy === "upload"}>{busy === "upload" ? "Importing..." : "Import"}</button>
          </form>
          {report && (
            <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
              <p className="mb-2 font-semibold text-green-800">Import complete</p>
              <dl className="grid grid-cols-2 gap-1 text-green-900">
                {Object.entries(REPORT_LABELS).filter(([k]) => k in report).map(([k, l]) => (
                  <div key={k} className="contents"><dt>{l}</dt><dd className="font-mono">{String(report[k])}</dd></div>
                ))}
              </dl>
              <button className={`${btnGhost} mt-3`} onClick={() => router.push("/network")}>View network</button>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <NamesUpload />
          <Card title={<span className="flex items-center gap-2"><Database className="h-4 w-4" /> Research datasets</span>}>
            <ul className="space-y-3">
              {datasets.map((d) => (
                <li key={d.name} className="flex items-center justify-between gap-3 text-sm">
                  <div>
                    <p className="font-medium text-slate-800">{d.name}</p>
                    <p className="text-xs text-slate-500">{d.description}</p>
                  </div>
                  <button className={btnGhost} onClick={() => loadSample(d.name)} disabled={busy !== null}>{busy === d.name ? "Loading..." : "Load"}</button>
                </li>
              ))}
            </ul>
          </Card>
          <Card title={<span className="flex items-center gap-2"><FilePlus2 className="h-4 w-4" /> Build manually</span>}>
            <form onSubmit={createEmpty} className="space-y-3">
              <input className={input} placeholder="Network name" required value={name} onChange={(e) => setName(e.target.value)} />
              <input className={input} placeholder="Description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
              <button className={btn} disabled={busy === "create"}>Create and open editor</button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
