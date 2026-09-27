"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getStoredUser, type DemoState, type Finding } from "@/lib/demo-data";
import { loadAppState } from "@/lib/app-data";
import { useSyncRefresh } from "@/lib/use-sync-refresh";

function formatDateTime(value: string) {
  const date = new Date(value);
  return {
    date: new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(date),
    time: new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date),
  };
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

type NotificationFinding = Pick<Finding, "id" | "findingCode" | "title" | "status" | "assignedTeam" | "updatedAt">;
type NotificationGroup = "Today" | "Yesterday" | "Earlier";

export function NotificationsPanel() {
  const [state, setState] = useState<DemoState | null>(null);
  const [loadError, setLoadError] = useState("");
  const syncRevision = useSyncRefresh();
  const currentUser = getStoredUser();

  useEffect(() => {
    let active = true;
    void loadAppState().then((data) => {
      if (!active) return;
      setState(data);
      setLoadError("");
    }).catch((error: unknown) => {
      if (!active) return;
      setLoadError(error instanceof Error ? error.message : "Could not load notifications.");
    });
    return () => { active = false; };
  }, [syncRevision]);

  const notifications = useMemo(() => {
    if (!state) return [];
    const findings: NotificationFinding[] = [
      ...state.findings,
      ...(state.internalInspectionFindings ?? []).map((finding) => ({
        id: finding.id,
        findingCode: finding.findingCode,
        title: finding.title,
        status: finding.status,
        assignedTeam: finding.assignedTeam,
        updatedAt: finding.updatedAt,
      })),
    ];
    const uniqueFindings = new Map(findings.map((finding) => [finding.id, finding]));
    return [...uniqueFindings.values()]
      .filter((finding) => finding.status !== "CLOSED")
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [state]);

  const groupedNotifications = useMemo(() => {
    const now = new Date();
    const todayKey = localDateKey(now);
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const yesterdayKey = localDateKey(yesterday);
    const groups: Record<NotificationGroup, NotificationFinding[]> = { Today: [], Yesterday: [], Earlier: [] };
    for (const finding of notifications) {
      const date = new Date(finding.updatedAt);
      const key = localDateKey(date);
      const group: NotificationGroup = key === todayKey ? "Today" : key === yesterdayKey ? "Yesterday" : "Earlier";
      groups[group].push(finding);
    }
    return groups;
  }, [notifications]);

  if (currentUser && currentUser.role !== "MAINTENANCE_ENGINEER") {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">Notifications are available to Maintenance accounts.</div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Maintenance</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Notifications</h1>
        <p className="mt-1 text-sm text-slate-600">All active findings and their current team assignments.</p>
      </header>

      {loadError ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{loadError}</p> : null}
      {!state ? <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading notifications…</div> : notifications.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="font-semibold text-slate-800">No active findings</h2>
          <p className="mt-2 text-sm text-slate-500">Findings will appear here until they are closed.</p>
        </div>
      ) : (
        <div className="space-y-7">
          {(["Today", "Yesterday", "Earlier"] as const).map((group) => groupedNotifications[group].length ? (
            <section key={group} aria-label={`${group} findings`} className="space-y-3">
              <h2 className="border-b border-slate-200 pb-2 text-sm font-bold uppercase tracking-wide text-slate-500">{group}</h2>
              {groupedNotifications[group].map((finding) => {
                const { date, time } = formatDateTime(finding.updatedAt);
                return (
                  <article key={finding.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">{finding.findingCode}</p>
                        <h3 className="mt-1 text-lg font-semibold text-slate-900">{finding.title}</h3>
                        <p className="mt-1 text-sm text-slate-600">Assigned team: <span className="font-semibold text-slate-800">{finding.assignedTeam ?? "Unassigned"}</span></p>
                        <p className="mt-2 text-sm text-slate-600">Status: <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{finding.status.replaceAll("_", " ")}</span></p>
                      </div>
                      <time dateTime={finding.updatedAt} className="shrink-0 rounded-lg bg-slate-50 px-3 py-2 text-right text-sm text-slate-600">
                        <span className="block font-medium">{date}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">{time}</span>
                      </time>
                    </div>
                    <Link href={`/issues/${encodeURIComponent(finding.id)}`} className="mt-4 inline-flex text-sm font-semibold text-sky-700 hover:text-sky-900">
                      View issue →
                    </Link>
                  </article>
                );
              })}
            </section>
          ) : null)}
        </div>
      )}
    </div>
  );
}
