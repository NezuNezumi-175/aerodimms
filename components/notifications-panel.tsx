"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getStoredUser, type DemoState } from "@/lib/demo-data";
import { loadAppState } from "@/lib/app-data";
import { useSyncRefresh } from "@/lib/use-sync-refresh";

function getTeamAssignment(entry: DemoState["issueHistory"][number]) {
  if (entry.action === "Team assigned") return entry.remarks?.trim() || null;
  const legacy = entry.action.match(/^Finding assigned to (.+)$/i);
  return legacy?.[1]?.trim() || null;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return {
    date: new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(date),
    time: new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date),
  };
}

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
    const findings = new Map(state.findings.map((finding) => [finding.id, finding]));
    return state.issueHistory.flatMap((entry) => {
      const team = getTeamAssignment(entry);
      const finding = findings.get(entry.findingId);
      return team && finding ? [{ entry, finding, team }] : [];
    }).sort((a, b) => new Date(b.entry.createdAt).getTime() - new Date(a.entry.createdAt).getTime());
  }, [state]);

  if (currentUser && currentUser.role !== "MAINTENANCE_ENGINEER") {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">Notifications are available to Maintenance accounts.</div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Maintenance</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Notifications</h1>
        <p className="mt-1 text-sm text-slate-600">Issues assigned to your maintenance teams.</p>
      </header>

      {loadError ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{loadError}</p> : null}
      {!state ? <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading notifications…</div> : notifications.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="font-semibold text-slate-800">No team assignment notifications</h2>
          <p className="mt-2 text-sm text-slate-500">New notifications will appear here when an Operation Manager assigns an issue to a team.</p>
        </div>
      ) : (
        <section aria-label="Team assignment notifications" className="space-y-3">
          {notifications.map(({ entry, finding, team }) => {
            const { date, time } = formatDateTime(entry.createdAt);
            return (
              <article key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">New team assignment</p>
                    <h2 className="mt-1 text-lg font-semibold text-slate-900">{finding.title}</h2>
                    <p className="mt-1 text-sm text-slate-600">Assigned team: <span className="font-semibold text-slate-800">{team}</span></p>
                    <p className="mt-2 text-sm text-slate-600">Status: <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{finding.status.replaceAll("_", " ")}</span></p>
                  </div>
                  <time dateTime={entry.createdAt} className="shrink-0 rounded-lg bg-slate-50 px-3 py-2 text-right text-sm text-slate-600">
                    <span className="block font-medium">{date}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{time}</span>
                  </time>
                </div>
                <Link href={`/issues/${encodeURIComponent(finding.id)}`} className="mt-4 inline-flex text-sm font-semibold text-sky-700 hover:text-sky-900">
                  View {finding.findingCode} →
                </Link>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
