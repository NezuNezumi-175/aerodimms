"use client";

import { useEffect, useMemo, useState } from "react";
import { getStoredUser, loadDemoState, saveDemoState, type DemoState, type Finding, type IssueHistoryEntry } from "@/lib/demo-data";

type IssueDetailPanelProps = {
  findingCode: string;
};

const statusTransitions: Record<string, string[]> = {
  FINDING: ["ASSIGNED"],
  ASSIGNED: ["WORK_ORDER"],
  WORK_ORDER: ["IN_PROGRESS"],
  IN_PROGRESS: ["PENDING_VERIFICATION"],
  PENDING_VERIFICATION: ["CLOSED", "IN_PROGRESS"],
  CLOSED: [],
};

export function IssueDetailPanel({ findingCode }: IssueDetailPanelProps) {
  const [state, setState] = useState<DemoState | null>(null);
  const currentUser = getStoredUser();

  useEffect(() => {
    setState(loadDemoState());
  }, []);

  const finding = useMemo(() => {
    if (!state) return null;
    return state.findings.find((item) => item.findingCode === findingCode || item.id === findingCode) ?? null;
  }, [findingCode, state]);

  const workOrder = useMemo(() => {
    if (!state || !finding) return null;
    return state.workOrders.find((item) => item.findingId === finding.id) ?? null;
  }, [finding, state]);

  const evidenceItems = useMemo(() => {
    if (!state || !finding) return [];
    return state.evidence.filter((item) => item.findingId === finding.id);
  }, [finding, state]);

  const history = useMemo(() => {
    if (!state || !finding) return [];
    return [...state.issueHistory]
      .filter((item) => item.findingId === finding.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [finding, state]);

  const updateFindingStatus = (nextStatus: string, action: string, remarks?: string) => {
    if (!state || !finding) return;

    const nextFinding: Finding = {
      ...finding,
      status: nextStatus as Finding["status"],
      updatedAt: new Date().toISOString(),
    };

    const nextEntry: IssueHistoryEntry = {
      id: `h-${Math.random().toString(36).slice(2, 9)}`,
      findingId: finding.id,
      userId: currentUser?.id ?? "u-1",
      action,
      previousStatus: finding.status,
      newStatus: nextStatus,
      remarks,
      createdAt: new Date().toISOString(),
    };

    const nextState = {
      ...state,
      findings: state.findings.map((item) => item.id === finding.id ? nextFinding : item),
      issueHistory: [...state.issueHistory, nextEntry],
    };

    saveDemoState(nextState);
    setState(nextState);
  };

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!state || !finding) return;

    const file = event.target.files?.[0];
    if (!file) return;

    const evidenceItem = {
      id: `ev-${Math.random().toString(36).slice(2, 9)}`,
      findingId: finding.id,
      fileName: file.name,
      storagePath: `evidence/${finding.id}/${file.name}`,
      mimeType: file.type || "application/octet-stream",
      uploadedBy: currentUser?.id ?? "u-1",
      createdAt: new Date().toISOString(),
    };

    const nextState = {
      ...state,
      evidence: [...state.evidence, evidenceItem],
      issueHistory: [
        ...state.issueHistory,
        {
          id: `h-${Math.random().toString(36).slice(2, 9)}`,
          findingId: finding.id,
          userId: currentUser?.id ?? "u-1",
          action: "Evidence uploaded",
          previousStatus: finding.status,
          newStatus: finding.status,
          remarks: file.name,
          createdAt: new Date().toISOString(),
        },
      ],
    };

    saveDemoState(nextState);
    setState(nextState);
    event.target.value = "";
  };

  if (!state || !finding) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-600">Unable to load issue details.</div>;
  }

  const primaryAction = (() => {
    switch (finding.status) {
      case "FINDING":
        return { label: "Assign", nextStatus: "ASSIGNED", action: "Finding assigned" };
      case "ASSIGNED":
        return { label: "Create Work Order", nextStatus: "WORK_ORDER", action: "Work order created" };
      case "WORK_ORDER":
        return { label: "Start Work", nextStatus: "IN_PROGRESS", action: "Corrective action started" };
      case "IN_PROGRESS":
        return { label: "Submit for Verification", nextStatus: "PENDING_VERIFICATION", action: "Submitted for verification" };
      case "PENDING_VERIFICATION":
        return { label: "Verify & Close", nextStatus: "CLOSED", action: "Verified and closed" };
      case "CLOSED":
        return null;
      default:
        return null;
    }
  })();

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Issue detail</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">{finding.findingCode}</h1>
            <h2 className="mt-2 text-2xl font-semibold text-slate-800">{finding.title}</h2>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">{finding.status}</div>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <div className="space-y-3 text-sm text-slate-600">
            <p><span className="font-semibold text-slate-800">Source:</span> {finding.source}</p>
            <p><span className="font-semibold text-slate-800">Severity:</span> {finding.severity}</p>
            <p><span className="font-semibold text-slate-800">Location:</span> {finding.locationName}</p>
            <p><span className="font-semibold text-slate-800">Created:</span> {new Date(finding.createdAt).toLocaleDateString()}</p>
          </div>
          <div className="space-y-3 text-sm text-slate-600">
            <p><span className="font-semibold text-slate-800">Current Status:</span> {finding.status}</p>
            <p><span className="font-semibold text-slate-800">Assigned Team:</span> {finding.assignedTeam ?? "Unassigned"}</p>
            <p><span className="font-semibold text-slate-800">GPS Location:</span> {finding.latitude.toFixed(5)}, {finding.longitude.toFixed(5)}</p>
            <p><span className="font-semibold text-slate-800">Target Completion:</span> {finding.targetCompletionDate ?? "Not set"}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Action / Work Order</h3>
          <div className="mt-4 space-y-4 text-sm text-slate-600">
            {workOrder ? (
              <>
                <p><span className="font-semibold text-slate-800">Work Order:</span> {workOrder.workOrderCode}</p>
                <p><span className="font-semibold text-slate-800">Corrective Action:</span> {workOrder.correctiveAction}</p>
                <p><span className="font-semibold text-slate-800">Assigned Team:</span> {workOrder.assignedTeam ?? "Unassigned"}</p>
                <p><span className="font-semibold text-slate-800">Due:</span> {workOrder.targetCompletionDate ?? "Not set"}</p>
              </>
            ) : (
              <p>No work order created yet.</p>
            )}

            {primaryAction ? (
              <button
                type="button"
                onClick={() => updateFindingStatus(primaryAction.nextStatus, primaryAction.action, primaryAction.action)}
                className="mt-3 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
              >
                {primaryAction.label}
              </button>
            ) : (
              <div className="mt-3 rounded-xl bg-slate-100 px-4 py-2 text-sm text-slate-600">Closed</div>
            )}

            {finding.status === "PENDING_VERIFICATION" ? (
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => updateFindingStatus("CLOSED", "Verify and close", "Accepted by verifier")}
                  className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Verify & Close
                </button>
                <button
                  type="button"
                  onClick={() => updateFindingStatus("IN_PROGRESS", "Return for further action", "Returned for additional work")}
                  className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-100"
                >
                  Return for Further Action
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Evidence</h3>
          <div className="mt-4 space-y-3">
            {evidenceItems.length ? (
              evidenceItems.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {item.fileName}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No evidence uploaded.</p>
            )}
            <label className="mt-3 inline-flex cursor-pointer rounded-xl border border-dashed border-sky-300 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-700 hover:bg-sky-100">
              Upload Evidence
              <input type="file" className="hidden" onChange={handleUpload} />
            </label>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">History</h3>
        <div className="mt-4 space-y-3">
          {history.length ? (
            history.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <p className="font-medium text-slate-800">{item.action}</p>
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    {new Date(item.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{item.previousStatus || "-"} → {item.newStatus || "-"}</p>
                {item.remarks ? <p className="mt-2 text-sm text-slate-600">{item.remarks}</p> : null}
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">No history available.</p>
          )}
        </div>
      </div>
    </div>
  );
}
