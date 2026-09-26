"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getStoredUser, setStoredUser } from "@/lib/demo-data";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<ReturnType<typeof getStoredUser>>(null);

  useEffect(() => {
    setCurrentUser(getStoredUser());
  }, [pathname]);

  useEffect(() => {
    if (pathname === "/login" || pathname === "/") return;
    if (!currentUser) {
      router.replace("/login");
    }
  }, [currentUser, pathname, router]);

  if (pathname === "/login" || pathname === "/") {
    return <>{children}</>;
  }

  const logout = () => {
    setStoredUser(null);
    setCurrentUser(null);
    router.push("/login");
  };

  const navItems = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/map", label: "Map" },
    { href: "/issues", label: "Issues" },
  ];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen flex-col md:flex-row">
        <aside className="w-full border-b border-slate-200 bg-slate-900 text-slate-50 md:w-64 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between px-5 py-5">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">AeroDIMMS</p>
              <h1 className="mt-1 text-xl font-semibold">Fukuoka Airport</h1>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Online
            </div>
          </div>

          <nav className="space-y-2 px-3 pb-4">
            {navItems.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between rounded-xl px-3 py-3 text-sm font-medium transition ${
                    active ? "bg-sky-500 text-white shadow-sm" : "text-slate-200 hover:bg-slate-800"
                  }`}
                >
                  <span>{item.label}</span>
                  <span className="text-xs opacity-70">→</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="flex-1">
          <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Operations status</p>
              <div className="mt-1 flex items-center gap-2 text-sm text-slate-700">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                Syncing
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">User</p>
                <p className="text-sm font-semibold text-slate-700">{currentUser?.fullName ?? "N/A"}</p>
              </div>
              <button
                type="button"
                onClick={logout}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Logout
              </button>
            </div>
          </header>

          <main className="p-4 md:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
