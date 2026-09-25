"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { loadDemoState, type DemoState } from "@/lib/demo-data";

export function IssuesPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<DemoState | null>(null);

  useEffect(() => {
    setState(loadDemoState());
  }, []);

  const updateQuery = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (!value || value === "ALL") {
      params.delete(key);
    } else {
      params.set(key, value);
    }

    router.replace(`/issues?${params.toString()}`);
  };

  const filteredIssues = useMemo(() => {
    if (!state) return [];

    const status = searchParams.get("status") ?? "ALL";
    const severity = searchParams.get("severity") ?? "ALL";
    const source = searchParams.get("source") ?? "ALL";
    const location = searchParams.get("location") ?? "ALL";
    const assignee = searchParams.get("assignee") ?? "ALL";

    return state.findings.filter((finding) => {
      const matchesStatus =
        status === "ALL"
          ? true
          : status === "OPEN"
            ? ["FINDING", "ASSIGNED", "WORK_ORDER", "IN_PROGRESS", "PENDING_VERIFICATION"].includes(finding.status)
            : status === "OVERDUE"
              ? ["ASSIGNED", "WORK_ORDER", "IN_PROGRESS", "PENDING_VERIFICATION"].includes(finding.status)
              : finding.status === status;

      const matchesSeverity = severity === "ALL" || finding.severity === severity;
      const matchesSource = source === "ALL" || finding.source === source;
      const matchesLocation = location === "ALL" || finding.locationName === location;
      const matchesAssignee = assignee === "ALL" || finding.assignedTeam === assignee;

      return matchesStatus && matchesSeverity && matchesSource && matchesLocation && matchesAssignee;
    });
  }, [searchParams, state]);

  const statusOptions = ["ALL", "FINDING", "ASSIGNED", "WORK_ORDER", "IN_PROGRESS", "PENDING_VERIFICATION", "CLOSED", "OPEN", "OVERDUE"];
  const severityOptions = ["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"];
  const sourceOptions = ["ALL", "INTERNAL_INSPECTION", "REGULATORY"];
  const locationOptions = state
    ? ["ALL", ...Array.from(new Set(state.findings.map((finding) => finding.locationName)))]
    : ["ALL"];
  const assigneeOptions = state
    ? ["ALL", ...Array.from(new Set(state.findings.map((finding) => finding.assignedTeam ?? "Unassigned")))]
    : ["ALL"];

  if (!state) {
    return <div>Loading issues…</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Issue list</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Issues & Actions</h1>
        </div>
      </div>

      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-5">
        <select value={searchParams.get("status") ?? "ALL"} onChange={(event) => updateQuery("status", event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <select value={searchParams.get("severity") ?? "ALL"} onChange={(event) => updateQuery("severity", event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {severityOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <select value={searchParams.get("source") ?? "ALL"} onChange={(event) => updateQuery("source", event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {sourceOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <select value={searchParams.get("location") ?? "ALL"} onChange={(event) => updateQuery("location", event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {locationOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <select value={searchParams.get("assignee") ?? "ALL"} onChange={(event) => updateQuery("assignee", event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {assigneeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm text-slate-700">
          <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
            <tr>
              <th className="px-4 py-3">Finding ID</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Severity</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Assignee</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {filteredIssues.map((finding) => (
              <tr key={finding.id} className="border-t border-slate-200 hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold text-slate-900">
                  <Link href={`/issues/${finding.findingCode}`} className="text-sky-700 hover:underline">
                    {finding.findingCode}
                  </Link>
                </td>
                <td className="px-4 py-3">{finding.title}</td>
                <td className="px-4 py-3">{finding.source}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-200 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-700">
                    {finding.severity}
                  </span>
                </td>
                <td className="px-4 py-3">{finding.locationName}</td>
                <td className="px-4 py-3">{finding.assignedTeam ?? "Unassigned"}</td>
                <td className="px-4 py-3">{finding.status}</td>
                <td className="px-4 py-3">{new Date(finding.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
