"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3, Boxes, FileText, LayoutDashboard, LogOut, Menu, Moon, Network as NetIcon, Search, Settings, Share2,
  ShieldAlert, Sun, Upload, Users, X,
} from "lucide-react";
import { useAuth, useNetwork } from "@/lib/store";
import { useTheme } from "@/lib/theme";
import { Spinner } from "./ui";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/network", label: "My Network", icon: Share2 },
  { href: "/people", label: "People", icon: Users },
  { href: "/analysis/influence", label: "Influence", icon: BarChart3 },
  { href: "/analysis/communities", label: "Communities", icon: Boxes },
  { href: "/analysis/robustness", label: "Robustness", icon: ShieldAlert },
  { href: "/import", label: "Import Data", icon: Upload },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const { networks, current, select } = useNetwork();
  const { theme, toggle } = useTheme();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);
  useEffect(() => setOpen(false), [path]);

  if (loading || !user) return <div className="p-8"><Spinner /></div>;

  const nav = (
    <nav className="flex flex-col gap-1 p-3">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = path === href || path.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
              active ? "bg-[#2563eb] text-white" : "text-[#cbd5e1] hover:bg-[#1e293b] hover:text-white"
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-60 transform bg-[#0f172a] transition-transform lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-[#1e293b] px-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-white">
            <NetIcon className="h-5 w-5 text-[#60a5fa]" /> Social Network Analytics
          </Link>
          <button className="text-[#94a3b8] lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        {nav}
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="lg:pl-60">
        {/* top bar */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-surface px-4">
          <button className="text-slate-600 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <select
            className="max-w-[40vw] rounded-lg border border-slate-300 bg-surface px-2 py-1.5 text-sm text-slate-800"
            value={current?.id ?? ""}
            onChange={(e) => select(Number(e.target.value))}
            aria-label="Current network"
          >
            {networks.length === 0 && <option value="">No networks</option>}
            {networks.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
          <form
            className="ml-auto hidden items-center gap-2 rounded-lg border border-slate-300 px-2 sm:flex"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(`/people?q=${encodeURIComponent(q)}`);
            }}
          >
            <Search className="h-4 w-4 text-slate-400" />
            <input
              className="w-48 py-1.5 text-sm outline-none"
              placeholder="Search people..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </form>
          <div className="ml-auto flex items-center gap-3 sm:ml-0">
            <button
              onClick={toggle}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <span className="hidden h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-600 sm:flex">
              {(user.name || user.email)[0].toUpperCase()}
            </span>
            <button onClick={logout} className="text-slate-500 hover:text-slate-800" title="Log out" aria-label="Log out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
