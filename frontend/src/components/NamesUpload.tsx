"use client";

import { useState } from "react";
import { Tags } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useNetwork } from "@/lib/store";
import { Card, ErrorBox, btn, input } from "./ui";

interface Report { rows: number; renamed: number; unmatched: number; extra_attributes: string[] }

/** Upload a CSV of id,name[,other columns] to replace numeric IDs with readable names. */
export default function NamesUpload() {
  const { current, refresh, reloadAnalysis } = useNetwork();
  const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [idCol, setIdCol] = useState("");
  const [nameCol, setNameCol] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  const pick = async (f: File | null) => {
    setFile(f);
    setReport(null);
    if (!f) return setColumns([]);
    const head = (await f.slice(0, 4096).text()).split(/\r?\n/)[0] ?? "";
    let cols = head.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cols.every((c) => c !== "" && !isNaN(Number(c)))) cols = cols.map((_, i) => `column ${i + 1}`);
    setColumns(cols);
    const rest = cols.slice(1);
    setIdCol(cols[0] ?? "");
    setNameCol(rest.find((c) => /name|label|handle|title/i.test(c)) ?? rest[0] ?? "");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !current) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("id_column", idCol);
      fd.append("name_column", nameCol);
      setReport((await api.post<Report>(`/networks/${current.id}/names`, fd)).data);
      await Promise.all([refresh(), reloadAnalysis()]);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={<span className="flex items-center gap-2"><Tags className="h-4 w-4" /> Add names to people</span>}>
      <form onSubmit={submit} className="space-y-3 text-sm">
        <p className="text-slate-500">
          Datasets like the Twitter graph only contain anonymous numeric IDs. Upload a CSV mapping each ID to a name
          (e.g. <code>id,name</code>) to label “{current?.name ?? "the current network"}”. Any extra columns (city, role…) appear on profiles.
        </p>
        <input type="file" accept=".csv,.txt" onChange={(e) => pick(e.target.files?.[0] ?? null)} className="block w-full text-sm" disabled={!current} />
        {columns.length > 1 && (
          <div className="grid grid-cols-2 gap-2">
            {[{ l: "ID column", v: idCol, s: setIdCol }, { l: "Name column", v: nameCol, s: setNameCol }].map((c) => (
              <label key={c.l} className="text-xs text-slate-600">
                {c.l}
                <select className={`${input} mt-1`} value={c.v} onChange={(e) => c.s(e.target.value)}>
                  {columns.map((col) => <option key={col} value={col}>{col}</option>)}
                </select>
              </label>
            ))}
          </div>
        )}
        <ErrorBox msg={error} />
        <button className={btn} disabled={!file || !current || columns.length < 2 || idCol === nameCol || busy}>{busy ? "Applying..." : "Apply names"}</button>
        {report && (
          <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-green-800">
            Named {report.renamed.toLocaleString()} people
            {report.unmatched > 0 && `; ${report.unmatched.toLocaleString()} IDs weren't in this network`}
            {report.extra_attributes.length > 0 && `; added ${report.extra_attributes.join(", ")} to profiles`}.
          </p>
        )}
      </form>
    </Card>
  );
}
