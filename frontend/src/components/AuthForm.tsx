"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Network } from "lucide-react";
import { errMsg } from "@/lib/api";
import { useAuth } from "@/lib/store";
import { ErrorBox, btn, input } from "./ui";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { login, register, user } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) router.replace(mode === "login" ? "/dashboard" : "/import");
  }, [user, router, mode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password, name);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0f172a] to-[#1e3a8a] p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-surface p-8 shadow-xl">
        <div className="flex items-center gap-2 text-blue-600">
          <Network className="h-6 w-6" />
          <span className="font-semibold text-slate-900">Social Network Analytics</span>
        </div>
        <h1 className="text-xl font-bold text-slate-900">{mode === "login" ? "Sign in" : "Create your account"}</h1>
        {mode === "register" && (
          <label className="block text-sm text-slate-700">
            Name
            <input className={`${input} mt-1`} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        )}
        <label className="block text-sm text-slate-700">
          Email
          <input className={`${input} mt-1`} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block text-sm text-slate-700">
          Password
          <input
            className={`${input} mt-1`}
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <ErrorBox msg={error} />
        <button className={`${btn} w-full`} disabled={busy}>
          {busy ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
        </button>
        <p className="text-center text-sm text-slate-500">
          {mode === "login" ? (
            <>No account? <Link className="text-blue-600 hover:underline" href="/register">Register</Link></>
          ) : (
            <>Have an account? <Link className="text-blue-600 hover:underline" href="/login">Sign in</Link></>
          )}
        </p>
      </form>
    </div>
  );
}
