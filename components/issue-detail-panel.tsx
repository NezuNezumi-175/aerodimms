"use client";

import { useEffect, useMemo, useState } from "react";
import { getStoredUser, saveDemoState, type DemoState, type Finding, type IssueHistoryEntry } from "@/lib/demo-data";
import { createClient } from "@/lib/supabase/client";
import { useSyncRefresh } from "@/lib/use-sync-refresh";
import { isDemoMode, loadAppState } from "@/lib/app-data";
import Image from "next/image";
import Link from "next/link";
import type { InternalInspectionFinding } from "@/lib/inspection-data";
import { getOfflineEvidenceForFinding } from "@/lib/offline-db";
import { EVIDENCE_BUCKET, safeFileName } from "@/lib/supabase/finding-write";

type EvidencePhase = "BEFORE" | "AFTER";
const evidencePhaseLabel: Record<EvidencePhase, string> = { BEFORE: "Before work", AFTER: "After work" };

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    const detail = "details" in error && typeof error.details === "string" ? error.details : "";
    const hint = "hint" in error && typeof error.hint === "string" ? error.hint : "";
    return [error.message, detail, hint].filter(Boolean).join(" — ");
  }
  if (typeof error === "string") return error;
  return fallback;
}

type IssueDetailPanelProps = {
  findingCode: string;
};

type IssueEvidenceDisplay = {
  id: string;
  phase?: EvidencePhase;
  fileName: string;
  mimeType: string;
  fileSize?: number;
  previewUrl?: string;
  storagePath?: string;
};
type OfflineEvidencePreview = IssueEvidenceDisplay & { localId: string };

export function IssueDetailPanel({ findingCode }: IssueDetailPanelProps) {
  const [state, setState] = useState<DemoState | null>(null);
  const [offlineEvidence, setOfflineEvidence] = useState<OfflineEvidencePreview[]>([]);
  const [offlineEvidenceError, setOfflineEvidenceError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [signedEvidenceUrls, setSignedEvidenceUrls] = useState<Record<string, string>>({});
  const currentUser = getStoredUser();
  const isOperationManager = currentUser?.role === "OPERATIONS_MANAGER";

  const syncRevision = useSyncRefresh();
  useEffect(() => {
    let active = true;
    loadAppState().then((data) => { if (active) setState(data); }).catch(() => { if (active) setState(null); });
    return () => { active = false; };
  }, [syncRevision]);

  useEffect(() => {
    if (isDemoMode() || !state || !findingCode) return;
    let cancelled = false;
    const rows = state.evidence.filter((item) => {
      const target = state.findings.find((finding) => finding.findingCode === findingCode || finding.id === findingCode);
      return target?.id === item.findingId;
    });
    Promise.all(rows.map(async (item) => {
      const { data, error } = await createClient().storage.from("finding-evidence").createSignedUrl(item.storagePath, 3600);
      return error ? null : [item.id, data.signedUrl] as const;
    })).then((results) => {
      if (!cancelled) setSignedEvidenceUrls(Object.fromEntries(results.filter((item): item is readonly [string, string] => item !== null)));
    });
    return () => { cancelled = true; };
  }, [findingCode, state]);

  const finding = useMemo(() => {
    if (!state) return null;
    return state.findings.find((item) => item.findingCode === findingCode || item.id === findingCode)
      ?? state.internalInspectionFindings?.find((item) => item.findingCode === findingCode || item.id === findingCode)
      ?? null;
  }, [findingCode, state]);
  const internalFinding = finding && "sourceFindingId" in finding
    ? finding as InternalInspectionFinding
    : null;
  const offlineFindingRecordId = internalFinding
    ? internalFinding.checklistItemId && internalFinding.sourceInspectionId
      ? `inspection:${internalFinding.sourceInspectionId}:${internalFinding.sourceFindingId}`
      : `manual:${internalFinding.id}`
    : null;

  useEffect(() => {
    let active = true;
    const previewUrls: string[] = [];
    if (!offlineFindingRecordId) {
      queueMicrotask(() => {
        if (active) setOfflineEvidence([]);
      });
      return () => {
        active = false;
      };
    }

    getOfflineEvidenceForFinding(offlineFindingRecordId)
      .then((records) => {
        const previews = records.map((record) => {
          const previewUrl = URL.createObjectURL(record.blob);
          previewUrls.push(previewUrl);
          return {
            id: record.id,
            localId: record.id.slice(`${offlineFindingRecordId}:`.length),
            fileName: record.fileName,
            mimeType: record.fileType,
            fileSize: record.fileSize,
            previewUrl,
          };
        });
        if (active) {
          setOfflineEvidence(previews);
          setOfflineEvidenceError("");
        } else {
          previewUrls.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
        }
      })
      .catch(() => {
        if (active) setOfflineEvidenceError("Unable to restore locally stored evidence from IndexedDB.");
      });

    return () => {
      active = false;
      previewUrls.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
    };
  }, [offlineFindingRecordId]);

  const workOrder = useMemo(() => {
    if (!state || !finding) return null;
    return state.workOrders.find((item) => item.findingId === finding.id) ?? null;
  }, [finding, state]);

  const evidenceItems = useMemo<IssueEvidenceDisplay[]>(() => {
    if (!state || !finding) return [];
    if ("sourceFindingId" in finding) {
      return finding.evidence.map((item) => ({
        id: item.localId,
        fileName: item.fileName,
        mimeType: item.fileType,
        fileSize: item.fileSize,
        previewUrl: offlineEvidence.find((offlineItem) => offlineItem.localId === item.localId)?.previewUrl ?? item.previewUrl,
      }));
    }
    return state.evidence.filter((item) => item.findingId === finding.id).map((item) => ({
      ...item,
      previewUrl: signedEvidenceUrls[item.id],
    }));
  }, [finding, offlineEvidence, signedEvidenceUrls, state]);

  const history = useMemo(() => {
    if (!state || !finding) return [];
    return [...state.issueHistory]
      .filter((item) => item.findingId === finding.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [finding, state]);

  const hasBeforePhoto = evidenceItems.some((item) => item.phase === "BEFORE");
  const hasAfterPhoto = evidenceItems.some((item) => item.phase === "AFTER");
  const hasRequiredEvidence = hasBeforePhoto && hasAfterPhoto;

  const updateFindingStatus = async (nextStatus: string, action: string, remarks?: string) => {
    if (!state || !finding || isSaving || "sourceFindingId" in finding) return;
    if (nextStatus === "PENDING_VERIFICATION" && !hasRequiredEvidence) {
      setSaveError("Upload one before-work photo and one after-work photo before submitting for verification.");
      return;
    }
    setIsSaving(true);
    setSaveError("");
    setSaveMessage("");

    if (!isDemoMode()) {
      try {
        const supabase = createClient();
        const { error } = await supabase.rpc("update_finding_status", {
          p_finding_id: finding.id,
          p_new_status: nextStatus,
          p_action: action,
          p_remarks: remarks ?? null,
        });
        if (error) throw new Error(error.message);
        const nextState = await loadAppState();
        setState(nextState);
        setSaveMessage("Saved to Supabase.");
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "Could not save this update to Supabase.");
      } finally {
        setIsSaving(false);
      }
      return;
    }

    const nextFinding: Finding = {
      ...finding,
      status: nextStatus as Finding["status"],
      updatedAt: new Date().toISOString(),
    };

    const nextEntry: IssueHistoryEntry = {
      id: `h-${Math.random().toString(36).slice(2, 9)}`,
      findingId: finding.id,
      userId: currentUser?.employee_id ?? "PEN12345",
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
    setSaveMessage("Saved in this browser's demo data.");
    setIsSaving(false);
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>, phase: EvidencePhase) => {
    if (!state || !finding) return;

    const file = event.target.files?.[0];
    if (!file) return;

    event.target.value = "";
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setSaveError("Use a JPG, PNG, or WebP image up to 10 MB.");
      return;
    }
    setSaveError("");
    setSaveMessage("");

    if (!isDemoMode()) {
      setIsSaving(true);
      let uploadedStoragePath: string | null = null;
      try {
        const supabase = createClient();
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!user) throw new Error("Sign in before uploading evidence.");
        const id = crypto.randomUUID();
        const storagePath = `${user.id}/${finding.id}/${id}-${safeFileName(file.name)}`;
        const { error: uploadError } = await supabase.storage.from(EVIDENCE_BUCKET)
          .upload(storagePath, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        uploadedStoragePath = storagePath;
        const { data: profile, error: profileError } = await supabase.from("profiles").select("employee_id").eq("id", user.id).maybeSingle();
        if (profileError) throw profileError;
        const { error: insertError } = await supabase.from("evidence").insert({
          id, finding_id: finding.id, phase, file_name: file.name, storage_path: storagePath,
          mime_type: file.type, file_size: file.size, uploaded_by_employee_id: profile?.employee_id ?? null,
          created_at: new Date().toISOString(),
        });
        if (insertError) throw insertError;
        uploadedStoragePath = null;
        setState(await loadAppState());
        setSaveMessage(`${evidencePhaseLabel[phase]} photo uploaded.`);
      } catch (error) {
        if (uploadedStoragePath) await createClient().storage.from(EVIDENCE_BUCKET).remove([uploadedStoragePath]).catch(() => undefined);
        setSaveError(getErrorMessage(error, "Could not upload this photo."));
      } finally {
        setIsSaving(false);
      }
      return;
    }

    const evidenceItem = {
      id: `ev-${Math.random().toString(36).slice(2, 9)}`,
      findingId: finding.id,
      phase,
      fileName: file.name,
      storagePath: `evidence/${finding.id}/${file.name}`,
      mimeType: file.type || "application/octet-stream",
      uploadedBy: currentUser?.employee_id ?? "PEN12345",
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
          userId: currentUser?.employee_id ?? "PEN12345",
          action: `${evidencePhaseLabel[phase]} evidence uploaded`,
          previousStatus: finding.status,
          newStatus: finding.status,
          remarks: file.name,
          createdAt: new Date().toISOString(),
        },
      ],
    };

    saveDemoState(nextState);
    setState(nextState);
    setSaveMessage(`${evidencePhaseLabel[phase]} photo added.`);
  };

  if (!state || !finding) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-600">Unable to load issue details.</div>;
  }

  const primaryAction = (() => {
    if (internalFinding) return null;
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
        return isOperationManager ? { label: "Approve & Close", nextStatus: "CLOSED", action: "Issue approved and closed" } : null;
      case "CLOSED":
        return null;
      default:
        return null;
    }
  })();
  const coordinates = internalFinding?.gps
    ? `${internalFinding.gps.latitude.toFixed(5)}, ${internalFinding.gps.longitude.toFixed(5)}`
    : finding.latitude !== null && finding.latitude !== undefined && finding.longitude !== null && finding.longitude !== undefined
      ? `${finding.latitude.toFixed(5)}, ${finding.longitude.toFixed(5)}`
      : "Not captured";

  const formatEvidenceSize = (size: number) =>
    size < 1024 ? `${size} B` : size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;

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
            <p><span className="font-semibold text-slate-800">Source:</span> {finding.source === "INTERNAL_INSPECTION" ? "Internal Inspection" : "Regulatory"}</p>
            <p><span className="font-semibold text-slate-800">Severity:</span> {finding.severity}</p>
            <p><span className="font-semibold text-slate-800">Location:</span> {finding.locationName}</p>
            <p><span className="font-semibold text-slate-800">Created:</span> {new Date(finding.createdAt).toLocaleDateString()}</p>
          </div>
          <div className="space-y-3 text-sm text-slate-600">
            <p><span className="font-semibold text-slate-800">Current Status:</span> {finding.status}</p>
            <p><span className="font-semibold text-slate-800">Assigned Team:</span> {finding.assignedTeam ?? "Unassigned"}</p>
            <p><span className="font-semibold text-slate-800">GPS Location:</span> {coordinates}</p>
            {internalFinding?.gps ? <p><span className="font-semibold text-slate-800">GPS Captured:</span> {new Date(internalFinding.gps.capturedAt).toLocaleString()}</p> : "gpsCapturedAt" in finding && finding.gpsCapturedAt ? <p><span className="font-semibold text-slate-800">GPS Captured:</span> {new Date(finding.gpsCapturedAt).toLocaleString()}</p> : null}
            <p><span className="font-semibold text-slate-800">Target Completion:</span> {finding.targetCompletionDate ?? "Not set"}</p>
          </div>
        </div>
      </div>

      {internalFinding ? (
        <section className="rounded-2xl border border-sky-100 bg-sky-50/50 p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Internal Inspection</p>
              <h3 className="mt-1 font-semibold text-slate-900">Source Inspection</h3>
            </div>
            {internalFinding.sourceInspectionId ? (
              <Link
                href={`/inspections/${internalFinding.sourceInspectionId}`}
                className="w-fit rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50"
              >
                View Inspection
              </Link>
            ) : null}
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-slate-500">Inspection ID</dt><dd className="mt-1 font-medium text-slate-800">{internalFinding.sourceInspectionId ?? "No related inspection"}</dd></div>
            <div><dt className="text-xs text-slate-500">Original Finding ID</dt><dd className="mt-1 font-medium text-slate-800">{internalFinding.sourceFindingId}</dd></div>
            {internalFinding.relatedInspectionType ? <div><dt className="text-xs text-slate-500">Inspection Type</dt><dd className="mt-1 font-medium text-slate-800">{internalFinding.relatedInspectionType}</dd></div> : null}
            {internalFinding.relatedInspector ? <div><dt className="text-xs text-slate-500">Inspector</dt><dd className="mt-1 font-medium text-slate-800">{internalFinding.relatedInspector}</dd></div> : null}
            {internalFinding.relatedInspectionArea ? <div><dt className="text-xs text-slate-500">Inspection Area</dt><dd className="mt-1 font-medium text-slate-800">{internalFinding.relatedInspectionArea}</dd></div> : null}
            {internalFinding.checklistItemId ? <div><dt className="text-xs text-slate-500">Checklist Item</dt><dd className="mt-1 font-medium text-slate-800">{internalFinding.checklistItemTitle} ({internalFinding.checklistItemId})</dd></div> : null}
            <div><dt className="text-xs text-slate-500">Category</dt><dd className="mt-1 font-medium text-slate-800">{internalFinding.category}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Inspector Remarks</dt><dd className="mt-1 font-medium text-slate-800">{internalFinding.inspectorRemarks || "None"}</dd></div>
          </dl>
        </section>
      ) : null}

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

            {internalFinding ? (
              <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
                Stage 1: Finding. No work order was created automatically.
              </p>
            ) : primaryAction ? (
              <button
                type="button"
                onClick={() => updateFindingStatus(primaryAction.nextStatus, primaryAction.action, primaryAction.action)}
                disabled={isSaving || (primaryAction.nextStatus === "PENDING_VERIFICATION" && !hasRequiredEvidence)}
                className="mt-3 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
              >
                {isSaving ? "Saving…" : primaryAction.label}
              </button>
            ) : (
              <div className="mt-3 rounded-xl bg-slate-100 px-4 py-2 text-sm text-slate-600">{finding.status === "CLOSED" ? "Closed" : "Awaiting Operation Manager review"}</div>
            )}
            {finding.status === "IN_PROGRESS" && !hasRequiredEvidence ? (
              <p className="text-sm text-amber-800">Before-work and after-work photos are required. Missing: {[!hasBeforePhoto ? "before work" : null, !hasAfterPhoto ? "after work" : null].filter(Boolean).join(" and ")}.</p>
            ) : null}

            {finding.status === "PENDING_VERIFICATION" ? (
              isOperationManager ? (
                <div className="space-y-2 pt-2">
                  <p className="text-sm text-slate-600">Review the submitted evidence, then approve the completed issue or reject it and return it for more work.</p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => updateFindingStatus("CLOSED", "Issue approved and closed", "Approved by Operation Manager")}
                      disabled={isSaving}
                      className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {isSaving ? "Saving…" : "Approve & Close"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const reason = window.prompt("Why are you rejecting this issue? The reason will be recorded in its history.");
                        if (reason === null) return;
                        if (!reason.trim()) {
                          setSaveError("Enter a reason for rejecting the issue.");
                          return;
                        }
                        void updateFindingStatus("IN_PROGRESS", "Issue rejected", reason.trim());
                      }}
                      disabled={isSaving}
                      className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                    >
                      {isSaving ? "Saving…" : "Reject & Return for Work"}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">This issue is awaiting review by an Operation Manager.</p>
              )
            ) : null}
            {saveError ? <p role="alert" className="text-sm text-red-700">{saveError}</p> : null}
            {saveMessage ? <p role="status" className="text-sm text-emerald-700">{saveMessage}</p> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Evidence</h3>
          {offlineEvidenceError ? <p role="alert" className="mt-2 text-sm text-red-700">{offlineEvidenceError}</p> : null}
          <div className="mt-4 space-y-3">
            {evidenceItems.length ? (
              evidenceItems.map((item) => (
                <div key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2 text-sm text-slate-700">
                  {item.previewUrl ? (
                    <Image src={item.previewUrl} alt={`Preview of ${item.fileName}`} width={64} height={64} unoptimized className="h-16 w-16 shrink-0 rounded-md object-cover" />
                  ) : null}
                  <div className="min-w-0">
                    {item.phase ? <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">{evidencePhaseLabel[item.phase]}</p> : <p className="text-xs font-semibold text-amber-700">Unclassified legacy evidence</p>}
                    <p className="break-all font-medium">{item.fileName}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.mimeType}{item.fileSize !== undefined ? ` · ${formatEvidenceSize(item.fileSize)}` : ""}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No evidence uploaded.</p>
            )}
            {finding.status === "IN_PROGRESS" && !internalFinding ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {(["BEFORE", "AFTER"] as const).map((phase) => {
                  const uploaded = phase === "BEFORE" ? hasBeforePhoto : hasAfterPhoto;
                  return (
                    <label key={phase} className={`inline-flex cursor-pointer flex-col rounded-xl border border-dashed px-4 py-3 text-sm font-medium ${uploaded ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100"}`}>
                      <span>{uploaded ? "Add another" : "Upload"} {evidencePhaseLabel[phase]} Photo</span>
                      <span className="mt-1 text-xs font-normal">JPG, PNG, or WebP · up to 10 MB</span>
                      <input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" className="sr-only" disabled={isSaving} onChange={(event) => void handleUpload(event, phase)} />
                    </label>
                  );
                })}
              </div>
            ) : null}
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
