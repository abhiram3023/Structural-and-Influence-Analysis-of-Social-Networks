"use client";

import { useState } from "react";
import { Card, ErrorBox, PageHeader, btn, input } from "@/components/ui";
import { API_URL, User, api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/store";

export default function SettingsPage() {
  const { user, setUser, logout } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMsg(null);
    try {
      setUser((await api.patch<User>("/auth/me", { name })).data);
      setMsg("Saved.");
    } catch (err) {
      setError(errMsg(err));
    }
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Account and preferences" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Profile">
          <form onSubmit={save} className="space-y-3 text-sm">
            <label className="block">Display name<input className={`${input} mt-1`} value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="block">Email<input className={`${input} mt-1 bg-slate-50`} value={user.email} disabled /></label>
            <ErrorBox msg={error} />
            {msg && <p className="text-green-700">{msg}</p>}
            <button className={btn}>Save</button>
          </form>
        </Card>
        <Card title="Account">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-slate-500">Member since</dt><dd>{new Date(user.created_at).toLocaleDateString()}</dd>
            <dt className="text-slate-500">API</dt><dd className="font-mono text-xs">{API_URL}</dd>
          </dl>
          <button className="mt-4 text-sm text-red-600 hover:underline" onClick={logout}>Sign out</button>
        </Card>
      </div>
    </>
  );
}
