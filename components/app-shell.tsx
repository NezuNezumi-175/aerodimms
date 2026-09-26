"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useNetworkStatus } from "@/lib/use-network-status";
import { getStoredUser, setStoredUser, type Profile, type Role } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/app-data";
import { syncPendingOfflineChanges } from "@/lib/offline-sync";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isOnline = useNetworkStatus();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentRole, setCurrentRole] = useState<Role | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const connectionLabel = isOnline ? "Online" : "Offline";
  const connectionColor = isOnline
    ? "bg-emerald-500/15 text-emerald-300"
    : "bg-amber-500/15 text-amber-200";
  const isInspectionRoute = pathname === "/inspections" || pathname.startsWith("/inspections/");
  const canAccessInspections = currentRole === "INSPECTOR" || currentRole === "OPERATIONS_MANAGER";

  useEffect(() => {
    let active = true;
    const storedProfile = getStoredUser();
    setCurrentRole(storedProfile?.role ?? null);
    setProfileLoaded(false);

    const loadProfile = async () => {
      if (isDemoMode() || pathname === "/login" || pathname === "/") {
        if (active) setProfileLoaded(true);
        return;
      }

      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!active) return;
        setCurrentUser(session?.user ?? null);
        if (session && isOnline) {
          const { data } = await supabase.from("profiles")
            .select("id, employee_id, full_name, role, airport, created_at, updated_at")
            .eq("id", session.user.id)
            .maybeSingle();
          if (!active) return;
          if (data) {
            const profile = data as Profile;
            setCurrentRole(profile.role);
            setStoredUser(profile);
          }
        }
      } catch {
        // Keep the role cached at login so route access still works offline.
      } finally {
        if (active) setProfileLoaded(true);
      }
    };
    void loadProfile();

    return () => {
      active = false;
    };
  }, [isOnline, pathname]);

  useEffect(() => {
    if (isDemoMode() || !isOnline || pathname === "/login" || pathname === "/") return;
    let active = true;
    let retryTimer: number | undefined;
    const runSync = async () => {
      try {
        const { data: { session } } = await createClient().auth.getSession();
        if (active && session) await syncPendingOfflineChanges();
      } catch (error) {
        console.error("Offline changes could not be synchronized. Retrying while online.", error);
      }
    };
    void runSync();
    retryTimer = window.setInterval(() => { void runSync(); }, 15000);
    window.addEventListener("focus", runSync);
    return () => {
      active = false;
      if (retryTimer !== undefined) window.clearInterval(retryTimer);
      window.removeEventListener("focus", runSync);
    };
  }, [isOnline, pathname]);

  useEffect(() => {
    if (isInspectionRoute && profileLoaded && !canAccessInspections) {
      router.replace("/dashboard");
    }
  }, [canAccessInspections, isInspectionRoute, profileLoaded, router]);

  if (pathname === "/login" || pathname === "/") {
    return <>{children}</>;
  }

  if (isInspectionRoute && !profileLoaded) {
    return <div className="flex h-screen items-center justify-center bg-slate-100 text-sm text-slate-600">Checking access…</div>;
  }

  if (isInspectionRoute && !canAccessInspections) {
    return <div className="flex h-screen items-center justify-center bg-slate-100 text-sm text-slate-600">You do not have access to Inspections.</div>;
  }

  const logout = () => {
    setStoredUser(null);
    if (isDemoMode()) {
      router.replace("/dashboard");
      return;
    }

    createClient().auth.signOut().finally(() => {
      setCurrentUser(null);
      router.replace("/login");
      router.refresh();
    });
  };

  const navItems = [
    { href: "/dashboard", label: "Dashboard" },
    ...(canAccessInspections ? [{ href: "/inspections", label: "Inspections" }] : []),
    { href: "/map", label: "Map" },
    { href: "/issues", label: "Issues" },
  ];

  return (
    <div className="h-screen overflow-hidden bg-slate-100 text-slate-900">
      <div className="flex h-full flex-col">
        <div className="z-20 shrink-0 border-b border-slate-700 bg-slate-900 text-slate-50 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6 lg:flex-nowrap">
            <div className="shrink-0">
              <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400">AeroDIMMS</p>
              <h1 className="mt-0.5 text-lg font-semibold">Fukuoka Airport</h1>
            </div>

            <nav className="order-3 flex w-full items-center gap-1 overflow-x-auto lg:order-none lg:w-auto">
              {navItems.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                      active ? "bg-sky-500 text-white shadow-sm" : "text-slate-200 hover:bg-slate-800"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className={`ml-auto flex shrink-0 items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ${connectionColor}`}>
              <span className={`h-2 w-2 rounded-full ${isOnline ? "bg-emerald-400" : "bg-amber-300"}`} />
              {connectionLabel}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <header className="z-10 flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Operations status</p>
              <div className="mt-1 flex items-center gap-2 text-sm text-slate-700">
                <span className={`inline-flex h-2.5 w-2.5 rounded-full ${isOnline ? "bg-emerald-500" : "bg-amber-500"}`} />
                {connectionLabel}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">User</p>
                <p className="text-sm font-semibold text-slate-700">
                  {currentUser?.user_metadata.full_name ?? currentUser?.email ?? "Loading…"}
                </p>
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

          <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
