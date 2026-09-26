"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  loadDemoState,
  openFindingStatuses,
  severityColors,
  type DemoState,
  type Severity,
} from "@/lib/demo-data";

export function DashboardPanel() {
  const [state, setState] = useState<DemoState | null>(null);

  useEffect(() => {
    setState(loadDemoState());
  }, []);

  const dashboard = useMemo(() => {
    if (!state) return null;

    const openFindings = state.findings.filter((item) => openFindingStatuses.has(item.status));
    const critical = state.findings.filter((item) => item.severity === "CRITICAL");
    const overdue = state.findings.filter((item) =>
      ["ASSIGNED", "WORK_ORDER", "IN_PROGRESS", "PENDING_VERIFICATION"].includes(item.status),
    );
    const pendingVerification = state.findings.filter((item) => item.status === "PENDING_VERIFICATION");
    const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

    const urgent = [...state.findings]
      .filter((item) => openFindingStatuses.has(item.status))
      .sort((a, b) => {
        const scoreA = SEVERITY_ORDER[a.severity] ?? 99;
        const scoreB = SEVERITY_ORDER[b.severity] ?? 99;
        return scoreA - scoreB; // 数字が小さい（優先度が高い）順に並ぶ
      })
      .slice(0, 3);

    return {
      openFindings: openFindings.length,
      criticalFindings: critical.length,
      overdueIssues: overdue.length,
      pendingVerification: pendingVerification.length,
      urgent,
      activity: [...state.issueHistory].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ).slice(0, 4),
    };
  }, [state]);

  if (!state || !dashboard) {
    return <div className="space-y-4">Loading dashboard…</div>;
  }

  const kpis = [
    { label: "Open Findings", value: dashboard.openFindings, href: "/issues?status=OPEN" },
    { label: "Critical Findings", value: dashboard.criticalFindings, href: "/issues?severity=CRITICAL" },
    { label: "Overdue Issues", value: dashboard.overdueIssues, href: "/issues?status=OVERDUE" },
    { label: "Pending Verification", value: dashboard.pendingVerification, href: "/issues?status=PENDING_VERIFICATION" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Operations overview</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Dashboard</h1>
        </div>
        <Link href="/map" className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">
          Open Map
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{kpi.label}</p>
            <div className="mt-4 flex items-end justify-between">
              <span className="text-4xl font-bold text-slate-900">{kpi.value}</span>
              <Link href={kpi.href} className="text-sm font-semibold text-sky-600 hover:text-sky-700">
                View
              </Link>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Urgent Actions</h2>
            <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Priority</span>
          </div>

          <div className="space-y-4">
            {dashboard.urgent.map((item) => (
              <Link
                key={item.findingCode}
                href={`/issues/${item.findingCode}`}
                className="block rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-sky-300 hover:bg-sky-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-1 text-sm text-slate-500">{item.severity} · {item.locationName}</p>
                  </div>
                  <span
                    className="rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white"
                    style={{ backgroundColor: severityColors[item.severity as Severity] }}
                  >
                    {item.severity}
                  </span>
                </div>
                <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">{item.status}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Recent Activity</h2>
          <div className="mt-4 space-y-4">
            {dashboard.activity.map((entry) => {
              const finding = state.findings.find((item) => item.id === entry.findingId);
              return (
                <div key={entry.id} className="border-l-2 border-sky-200 pl-3">
                  <p className="text-sm font-medium text-slate-700">{entry.action}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {finding?.findingCode ?? "Finding"} · {new Date(entry.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
