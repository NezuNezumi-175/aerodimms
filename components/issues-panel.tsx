"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { loadDemoState, type DemoState } from "@/lib/demo-data";

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0">
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replaceAll("_", " ")}
          </option>
        ))}
      </select>
    </div>
  );
}

export function IssuesPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<DemoState | null>(null);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setState(loadDemoState());
    });
    return () => {
      active = false;
    };
  }, []);

  const allFindings = useMemo(() => {
    if (!state) return [];
    return [...state.findings, ...(state.internalInspectionFindings ?? [])];
  }, [state]);

  const updateQuery = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (!value || value === "ALL") {
      params.delete(key);
    } else {
      params.set(key, value);
    }

    const query = params.toString();
    router.replace(query ? `/issues?${query}` : "/issues");
  };

  const filteredIssues = useMemo(() => {
    if (!state) return [];

    const status = searchParams.get("status") ?? "ALL";
    const severity = searchParams.get("severity") ?? "ALL";
    const source = searchParams.get("source") ?? "ALL";
    const location = searchParams.get("location") ?? "ALL";
    const assignee = searchParams.get("assignee") ?? "ALL";

    return allFindings.filter((finding) => {
      const matchesStatus =
        status === "ALL"
          ? true
          : status === "OPEN"
            ? [
                "FINDING",
                "ASSIGNED",
                "WORK_ORDER",
                "IN_PROGRESS",
                "PENDING_VERIFICATION",
              ].includes(finding.status)
            : status === "OVERDUE"
              ? [
                  "ASSIGNED",
                  "WORK_ORDER",
                  "IN_PROGRESS",
                  "PENDING_VERIFICATION",
                ].includes(finding.status)
              : finding.status === status;

      const matchesSeverity =
        severity === "ALL" || finding.severity === severity;
      const matchesSource =
        source === "ALL" || finding.source === source;
      const matchesLocation =
        location === "ALL" || finding.locationName === location;
      const matchesAssignee =
        assignee === "ALL" ||
        finding.assignedTeam === assignee;

      return (
        matchesStatus &&
        matchesSeverity &&
        matchesSource &&
        matchesLocation &&
        matchesAssignee
      );
    });
  }, [allFindings, searchParams, state]);

  const statusOptions = [
    "ALL",
    "FINDING",
    "ASSIGNED",
    "WORK_ORDER",
    "IN_PROGRESS",
    "PENDING_VERIFICATION",
    "CLOSED",
    "OPEN",
    "OVERDUE",
  ];

  const severityOptions = [
    "ALL",
    "CRITICAL",
    "HIGH",
    "MEDIUM",
    "LOW",
  ];

  const sourceOptions = [
    "ALL",
    "INTERNAL_INSPECTION",
    "REGULATORY",
  ];

  const locationOptions = state
    ? [
        "ALL",
        ...Array.from(
          new Set(
            allFindings.map(
              (finding) => finding.locationName,
            ),
          ),
        ),
      ]
    : ["ALL"];

  const assigneeOptions = state
    ? [
        "ALL",
        ...Array.from(
          new Set(
            allFindings.map(
              (finding) => finding.assignedTeam ?? "Unassigned",
            ),
          ),
        ),
      ]
    : ["ALL"];

  const metrics = useMemo(() => {
    if (!state) {
      return {
        total: 0,
        open: 0,
        critical: 0,
        overdue: 0,
      };
    }

    const openStatuses = [
      "FINDING",
      "ASSIGNED",
      "WORK_ORDER",
      "IN_PROGRESS",
      "PENDING_VERIFICATION",
    ];

    return {
      total: allFindings.length,
      open: allFindings.filter((finding) =>
        openStatuses.includes(finding.status),
      ).length,
      critical: allFindings.filter(
        (finding) => finding.severity === "CRITICAL",
      ).length,
      overdue: allFindings.filter((finding) =>
        ["ASSIGNED", "WORK_ORDER", "IN_PROGRESS", "PENDING_VERIFICATION"].includes(
          finding.status,
        ),
      ).length,
    };
  }, [allFindings, state]);

  if (!state) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-sky-600" />
          Loading issues…
        </div>
      </div>
    );
  }

  const severityStyles: Record<string, string> = {
    CRITICAL:
      "bg-red-50 text-red-700 ring-red-200",
    HIGH:
      "bg-orange-50 text-orange-700 ring-orange-200",
    MEDIUM:
      "bg-amber-50 text-amber-700 ring-amber-200",
    LOW:
      "bg-slate-100 text-slate-600 ring-slate-200",
  };

  const statusStyles: Record<string, string> = {
    FINDING:
      "bg-blue-50 text-blue-700 ring-blue-200",
    ASSIGNED:
      "bg-violet-50 text-violet-700 ring-violet-200",
    WORK_ORDER:
      "bg-indigo-50 text-indigo-700 ring-indigo-200",
    IN_PROGRESS:
      "bg-sky-50 text-sky-700 ring-sky-200",
    PENDING_VERIFICATION:
      "bg-amber-50 text-amber-700 ring-amber-200",
    CLOSED:
      "bg-emerald-50 text-emerald-700 ring-emerald-200",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-600">
            Issue Management
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            Issues & Actions
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Monitor findings, assignments, work orders, and verification status.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm">
          <span className="text-slate-400">Showing</span>{" "}
          <span className="font-semibold text-slate-900">
            {filteredIssues.length}
          </span>{" "}
          <span className="text-slate-400">of</span>{" "}
          <span className="font-semibold text-slate-900">
            {allFindings.length}
          </span>{" "}
          <span className="text-slate-500">issues</span>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            Total Findings
          </p>
          <p className="mt-3 text-3xl font-bold text-slate-950">
            {metrics.total}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            All recorded issues
          </p>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">
            Open
          </p>
          <p className="mt-3 text-3xl font-bold text-blue-700">
            {metrics.open}
          </p>
          <p className="mt-1 text-xs text-blue-600/70">
            Requires follow-up
          </p>
        </div>

        <div className="rounded-2xl border border-red-100 bg-red-50/40 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600">
            Critical
          </p>
          <p className="mt-3 text-3xl font-bold text-red-700">
            {metrics.critical}
          </p>
          <p className="mt-1 text-xs text-red-600/70">
            Highest severity
          </p>
        </div>

        <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-600">
            In Progress
          </p>
          <p className="mt-3 text-3xl font-bold text-amber-700">
            {metrics.overdue}
          </p>
          <p className="mt-1 text-xs text-amber-600/70">
            Active workflow items
          </p>
        </div>
      </div>

      {/* Filters */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Filters
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Narrow the issue list by workflow and location.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.replace("/issues")}
            className="text-xs font-semibold text-sky-600 transition hover:text-sky-700 hover:underline"
          >
            Clear filters
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <FilterSelect
            label="Status"
            value={searchParams.get("status") ?? "ALL"}
            options={statusOptions}
            onChange={(value) => updateQuery("status", value)}
          />

          <FilterSelect
            label="Severity"
            value={searchParams.get("severity") ?? "ALL"}
            options={severityOptions}
            onChange={(value) => updateQuery("severity", value)}
          />

          <FilterSelect
            label="Source"
            value={searchParams.get("source") ?? "ALL"}
            options={sourceOptions}
            onChange={(value) => updateQuery("source", value)}
          />

          <FilterSelect
            label="Location"
            value={searchParams.get("location") ?? "ALL"}
            options={locationOptions}
            onChange={(value) => updateQuery("location", value)}
          />

          <FilterSelect
            label="Assignee"
            value={searchParams.get("assignee") ?? "ALL"}
            options={assigneeOptions}
            onChange={(value) => updateQuery("assignee", value)}
          />
        </div>
      </section>

      {/* Table */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Issue Register
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Select an issue ID to view the full record.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1000px] w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                <th className="px-5 py-3">Finding</th>
                <th className="px-5 py-3">Description</th>
                <th className="px-5 py-3">Source</th>
                <th className="px-5 py-3">Severity</th>
                <th className="px-5 py-3">Location</th>
                <th className="px-5 py-3">Assignee</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Created</th>
              </tr>
            </thead>

            <tbody>
              {filteredIssues.map((finding) => (
                <tr
                  key={finding.id}
                  className="border-b border-slate-100 last:border-0 transition hover:bg-slate-50/80"
                >
                  <td className="px-5 py-4">
                    <Link
                      href={`/issues/${finding.findingCode}`}
                      className="font-bold text-sky-700 hover:text-sky-800 hover:underline"
                    >
                      {finding.findingCode}
                    </Link>
                  </td>

                  <td className="max-w-[260px] px-5 py-4">
                    <p className="truncate font-medium text-slate-800">
                      {finding.title}
                    </p>
                  </td>

                  <td className="px-5 py-4">
                    <span className={`text-xs font-medium ${
                      finding.source === "INTERNAL_INSPECTION" ? "text-sky-700" : "text-slate-500"
                    }`}>
                      {finding.source === "INTERNAL_INSPECTION" ? "Internal Inspection" : "Regulatory"}
                    </span>
                    {"sourceInspectionId" in finding ? (
                      <span className="mt-1 block text-[10px] text-slate-400">{finding.sourceInspectionId}</span>
                    ) : null}
                  </td>

                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ring-1 ring-inset ${
                        severityStyles[finding.severity] ??
                        "bg-slate-100 text-slate-600 ring-slate-200"
                      }`}
                    >
                      {finding.severity}
                    </span>
                  </td>

                  <td className="px-5 py-4 text-slate-600">
                    {finding.locationName}
                  </td>

                  <td className="px-5 py-4">
                    {finding.assignedTeam ? (
                      <span className="font-medium text-slate-700">
                        {finding.assignedTeam}
                      </span>
                    ) : (
                      <span className="text-slate-400">
                        Unassigned
                      </span>
                    )}
                  </td>

                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ring-1 ring-inset ${
                        statusStyles[finding.status] ??
                        "bg-slate-100 text-slate-600 ring-slate-200"
                      }`}
                    >
                      {finding.status.replaceAll("_", " ")}
                    </span>
                  </td>

                  <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">
                    {new Date(
                      finding.createdAt,
                    ).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredIssues.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <span className="text-xl">—</span>
              </div>

              <h3 className="mt-4 text-sm font-bold text-slate-900">
                No issues found
              </h3>

              <p className="mt-1 max-w-sm text-sm text-slate-500">
                No findings match the current filter combination.
                Try clearing one or more filters.
              </p>

              <button
                type="button"
                onClick={() => router.replace("/issues")}
                className="mt-4 rounded-lg px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-50"
              >
                Clear all filters
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}