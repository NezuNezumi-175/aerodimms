"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { CompletedInspectionView } from "@/components/completed-inspection-view";
import { FindingForm } from "@/components/finding-form";
import {
  allInspections,
  checklistByInspectionType,
  type CompletedInspectionFinding,
  type CompletedInspectionRecord,
  type EvidenceAttachment,
  type FindingDraft,
  type FindingCategory,
  type FindingSeverity,
  type GpsLocation,
  type Inspection,
  type InspectionStatus,
} from "@/lib/inspection-data";
import { loadDemoState } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/app-data";
import { createFindingEvidence, requestFindingGps } from "@/lib/finding-form";
import {
  getOfflineInspectionFindings,
  getOfflineInspectionProgress,
  saveOfflineFinding,
  saveOfflineInspectionProgress,
  acknowledgeOfflineFindingSync,
} from "@/lib/offline-db";
import { completeInspectionAndTransfer } from "@/lib/inspection-workflow";
import { saveFindingToSupabase } from "@/lib/supabase/finding-write";
import { useNetworkStatus } from "@/lib/use-network-status";
import {
  completeSupabaseInspection,
  loadSupabaseInspectionExecution,
  loadSupabaseInspections,
  markSupabaseInspectionInProgress,
  saveSupabaseChecklistAnswers,
} from "@/lib/supabase/inspection-write";

type ChecklistResult = "Pass" | "Fail" | "N/A";
type ChecklistAnswer = { result?: ChecklistResult; remark: string };
  type LocalFinding = {
  id: string;
  inspectionId: string;
  checklistItemId: string;
  checklistItemTitle: string;
  description: string;
  category: FindingCategory;
  severity: FindingSeverity;
  area: string;
  remarks: string;
  gps: GpsLocation | null;
  evidence: EvidenceAttachment[];
  createdAt: string;
  serverId?: string;
  serverUpdatedAt?: string;
};

const statusStyles: Record<InspectionStatus, string> = {
  Scheduled: "bg-slate-100 text-slate-700",
  "In Progress": "bg-sky-100 text-sky-800",
  Completed: "bg-emerald-100 text-emerald-800",
};

const resultOptions: ChecklistResult[] = ["Pass", "Fail", "N/A"];
function createEmptyFindingDraft(area = ""): FindingDraft {
  return { description: "", category: "", severity: "", area, remarks: "", gps: null, evidence: [] };
}

function getSaveErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    const details = "details" in error && typeof error.details === "string" ? error.details : "";
    const hint = "hint" in error && typeof error.hint === "string" ? error.hint : "";
    return [error.message, details, hint].filter(Boolean).join(" — ");
  }
  return "Please check the Supabase configuration and try again.";
}

function resultButtonClass(result: ChecklistResult, selected: boolean) {
  if (!selected) return "border-slate-200 bg-white text-slate-600 hover:bg-slate-50";
  if (result === "Pass") return "border-emerald-600 bg-emerald-600 text-white";
  if (result === "Fail") return "border-red-600 bg-red-600 text-white";
  return "border-slate-600 bg-slate-600 text-white";
}

export function InspectionExecutionPanel({ inspectionId }: { inspectionId: string }) {
  const [inspection, setInspection] = useState<Inspection | undefined>(() => allInspections.find((item) => item.id === inspectionId));
  const [answers, setAnswers] = useState<Record<string, ChecklistAnswer>>({});
  const [findings, setFindings] = useState<LocalFinding[]>([]);
  const [findingFormFor, setFindingFormFor] = useState<string | null>(null);
  const [findingDraft, setFindingDraft] = useState<FindingDraft>(() => createEmptyFindingDraft());
  const [findingFormError, setFindingFormError] = useState("");
  const [offlineStorageError, setOfflineStorageError] = useState("");
  const [isSavingFinding, setIsSavingFinding] = useState(false);
  const [gpsLoadingFor, setGpsLoadingFor] = useState<string | null>(null);
  const [gpsErrorFor, setGpsErrorFor] = useState<string | null>(null);
  const [gpsError, setGpsError] = useState("");
  const [evidenceError, setEvidenceError] = useState("");
  const [saveNotice, setSaveNotice] = useState(false);
  const [completionLoadedFor, setCompletionLoadedFor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [progressSaving, setProgressSaving] = useState(false);
  const [progressError, setProgressError] = useState("");
  const [completedRecord, setCompletedRecord] = useState<CompletedInspectionRecord | null>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [completionError, setCompletionError] = useState("");
  const [transferredCount, setTransferredCount] = useState(0);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const findingFormForRef = useRef<string | null>(null);
  const preservePreviewUrlsOnUnmountRef = useRef(false);
  const isOnline = useNetworkStatus();

  useEffect(() => {
    let active = true;
    const load = async () => {
      let storedCompletedRecord: CompletedInspectionRecord | null = null;
      try {
        const demoState = loadDemoState();
        storedCompletedRecord = demoState.completedInspectionRecords?.find(
          (item) => item.inspection.id === inspectionId,
        ) ?? null;
        setTransferredCount(
          (demoState.internalInspectionFindings ?? []).filter(
            (finding) => finding.sourceInspectionId === inspectionId,
          ).length,
        );
      } catch {
        storedCompletedRecord = null;
      }

      try {
        const [progress, storedFindings] = await Promise.all([
          getOfflineInspectionProgress(inspectionId),
          getOfflineInspectionFindings(inspectionId),
        ]);
        if (!active) return;
        const restoredFindings: LocalFinding[] = storedFindings.flatMap(({ record, evidence }) => {
          if (!record.inspectionId || !record.checklistItemId || !record.checklistItemTitle) return [];
          return [{
            id: record.findingId,
            inspectionId: record.inspectionId,
            checklistItemId: record.checklistItemId,
            checklistItemTitle: record.checklistItemTitle,
            description: record.description,
            category: record.category as FindingCategory,
            severity: record.severity as FindingSeverity,
            area: record.area,
            remarks: record.remarks,
            gps: record.gps,
            evidence: evidence.map((item) => {
              const file = new File([item.blob], item.fileName, { type: item.fileType });
              const previewUrl = URL.createObjectURL(file);
              objectUrlsRef.current.add(previewUrl);
              return { localId: item.id.slice(`${record.id}:`.length), file, fileName: item.fileName, fileType: item.fileType, fileSize: item.fileSize, previewUrl };
            }),
            createdAt: record.createdAt,
            serverId: record.serverId,
            serverUpdatedAt: record.serverUpdatedAt,
          }];
        });

        if (isDemoMode() || !isOnline) {
          setInspection(allInspections.find((item) => item.id === inspectionId));
          setAnswers(progress?.answers ?? {});
          setFindings(restoredFindings);
          setCompletedRecord(storedCompletedRecord);
          setTransferredCount((loadDemoState().internalInspectionFindings ?? []).filter((finding) => finding.sourceInspectionId === inspectionId).length);
        } else {
          const inspections = await loadSupabaseInspections();
          const remoteInspection = inspections.find((item) => item.id === inspectionId);
          if (!active) return;
          setInspection(remoteInspection);
          if (!remoteInspection) {
            setLoadError(`Inspection ${inspectionId} was not found in Supabase. Import inspections.csv or add this inspection first.`);
            return;
          }
          if (remoteInspection.status === "Scheduled") {
            await markSupabaseInspectionInProgress(remoteInspection);
            if (!active) return;
            remoteInspection.status = "In Progress";
            setInspection({ ...remoteInspection });
          }
          const data = await loadSupabaseInspectionExecution(remoteInspection);
          if (!active) return;
          const remoteFindingIds = new Set(data.findings.map((item) => item.checklistItemId));
          setAnswers(progress?.syncStatus === "pending" ? { ...data.answers, ...progress.answers } : data.answers);
          setFindings([...data.findings, ...restoredFindings.filter((item) => !remoteFindingIds.has(item.checklistItemId))]);
          setCompletedRecord(progress?.completionState === "COMPLETED" ? storedCompletedRecord : data.completedRecord);
          setTransferredCount(Math.max(data.findings.length, restoredFindings.length));
        }
      } catch (error) {
        if (active) {
          setOfflineStorageError("Unable to restore local inspection data from IndexedDB.");
          if (!isDemoMode() && isOnline) setLoadError(error instanceof Error ? error.message : "Could not load inspection data.");
          setInspection(allInspections.find((item) => item.id === inspectionId));
          setAnswers({});
          setFindings([]);
          setCompletedRecord(storedCompletedRecord);
        }
      } finally {
        if (active) setCompletionLoadedFor(inspectionId);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [inspectionId, isOnline]);

  useEffect(() => {
    const retainedUrls = new Set<string>();
    findings.forEach((finding) => finding.evidence.forEach((item) => retainedUrls.add(item.previewUrl)));
    findingDraft.evidence.forEach((item) => retainedUrls.add(item.previewUrl));

    objectUrlsRef.current.forEach((previewUrl) => {
      if (!retainedUrls.has(previewUrl)) {
        URL.revokeObjectURL(previewUrl);
        objectUrlsRef.current.delete(previewUrl);
      }
    });
  }, [findings, findingDraft.evidence]);

  useEffect(
    () => () => {
      if (preservePreviewUrlsOnUnmountRef.current) return;
      objectUrlsRef.current.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
      objectUrlsRef.current.clear();
    },
    [],
  );

  if (completionLoadedFor !== inspectionId) {
    return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading inspection status…</div>;
  }

  if (loadError && !isDemoMode()) {
    return <div role="alert" className="max-w-2xl rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
      Could not load inspection from Supabase: {loadError}
      <Link href="/inspections" className="mt-4 inline-flex rounded-lg bg-sky-600 px-4 py-2 font-semibold text-white hover:bg-sky-700">Back to Inspections</Link>
    </div>;
  }

  if (!inspection) {
    return (
      <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Inspection not found</h1>
        <p className="mt-2 text-sm text-slate-600">{loadError || `No inspection matches ID ${inspectionId}.`}</p>
        <Link href="/inspections" className="mt-5 inline-flex rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">
          Back to Inspections
        </Link>
      </div>
    );
  }

  if (completedRecord) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        {offlineStorageError ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {offlineStorageError}
          </p>
        ) : null}
        <CompletedInspectionView record={completedRecord} transferredCount={transferredCount} />
      </div>
    );
  }

  const checklist = checklistByInspectionType[inspection.type];
  const answeredCount = checklist.filter((item) => answers[item.id]?.result).length;
  const allAnswered = answeredCount === checklist.length;
  const progressPercent = Math.round((answeredCount / checklist.length) * 100);
  const getFinding = (checklistItemId: string) =>
    findings.find(
      (finding) =>
        finding.inspectionId === inspection.id && finding.checklistItemId === checklistItemId,
    );
  const failedItemsHaveFindings = checklist.every(
    (item) => answers[item.id]?.result !== "Fail" || Boolean(getFinding(item.id)),
  );
  const readyToComplete = allAnswered && failedItemsHaveFindings;
  const passCount = checklist.filter((item) => answers[item.id]?.result === "Pass").length;
  const failCount = checklist.filter((item) => answers[item.id]?.result === "Fail").length;
  const notApplicableCount = checklist.filter((item) => answers[item.id]?.result === "N/A").length;

  const persistProgress = (
    nextAnswers: Record<string, ChecklistAnswer>,
    nextFindings: LocalFinding[],
    completionState: "IN_PROGRESS" | "COMPLETED" = "IN_PROGRESS",
  ) => saveOfflineInspectionProgress({
    inspectionId: inspection.id,
    answers: nextAnswers,
    findingRecordIds: nextFindings.map((finding) => `inspection:${inspection.id}:${finding.id}`),
    completionState,
  });

  const persistProgressInBackground = (
    nextAnswers: Record<string, ChecklistAnswer>,
    nextFindings: LocalFinding[],
  ) => {
    void persistProgress(nextAnswers, nextFindings)
      .then(() => setOfflineStorageError(""))
      .catch(() => setOfflineStorageError("Unable to save inspection progress to IndexedDB. Keep working and try Save & Continue again."));
  };

  const updateAnswer = (itemId: string, update: Partial<ChecklistAnswer>) => {
    const previous = answers[itemId] ?? { remark: "" };
    const nextAnswers = { ...answers, [itemId]: { ...previous, ...update } };
    setAnswers(nextAnswers);
    persistProgressInBackground(nextAnswers, findings);
    setSaveNotice(false);
  };

  const updateFindingDraft = (update: Partial<FindingDraft>) => {
    setFindingDraft((current) => ({ ...current, ...update }));
    setFindingFormError("");
  };

  const openFindingForm = (checklistItemId: string) => {
    const existingFinding = getFinding(checklistItemId);
    setFindingDraft(
      existingFinding
        ? {
            description: existingFinding.description,
            category: existingFinding.category,
            severity: existingFinding.severity,
            area: existingFinding.area,
            remarks: existingFinding.remarks,
            gps: existingFinding.gps,
            evidence: existingFinding.evidence,
          }
        : createEmptyFindingDraft(inspection.area),
    );
    setFindingFormError("");
    setGpsError("");
    setGpsErrorFor(null);
    setEvidenceError("");
    findingFormForRef.current = checklistItemId;
    setFindingFormFor(checklistItemId);
  };

  const saveFinding = async (checklistItemId: string, checklistItemTitle: string, draft: FindingDraft) => {
    if (isSavingFinding) return;
    const description = draft.description.trim();

    if (!description || !draft.category || !draft.severity) {
      setFindingFormError("Enter a description, category, and severity before saving.");
      return;
    }

    const existingFinding = getFinding(checklistItemId);
    setIsSavingFinding(true);
    const findingId = existingFinding?.id ?? `F-${String(findings.length + 1).padStart(3, "0")}`;
    try {
      const finding: LocalFinding = {
        id: findingId,
        inspectionId: inspection.id,
        checklistItemId,
        checklistItemTitle,
        description,
        category: draft.category,
        severity: draft.severity,
        area: draft.area.trim() || inspection.area,
        remarks: draft.remarks.trim(),
        gps: draft.gps,
        evidence: draft.evidence,
        createdAt: existingFinding?.createdAt ?? new Date().toISOString(),
        serverId: existingFinding?.serverId,
        serverUpdatedAt: existingFinding?.serverUpdatedAt,
      };
      const existingIndex = findings.findIndex((item) => item.inspectionId === inspection.id && item.checklistItemId === checklistItemId);
      const nextFindings = existingIndex < 0 ? [...findings, finding] : findings.map((item, index) => index === existingIndex ? finding : item);
      const offlineRecordId = `inspection:${inspection.id}:${finding.id}`;
      const offlineRecord = await saveOfflineFinding({
        id: offlineRecordId,
        findingId: finding.id,
        kind: "checklist",
        inspectionId: inspection.id,
        checklistItemId: finding.checklistItemId,
        checklistItemTitle: finding.checklistItemTitle,
        description: finding.description,
        category: finding.category,
        severity: finding.severity,
        area: finding.area,
        remarks: finding.remarks,
        gps: finding.gps,
        createdAt: finding.createdAt,
        serverId: existingFinding?.serverId,
        serverUpdatedAt: existingFinding?.serverUpdatedAt,
      }, finding.evidence.map((item) => ({
        id: `${offlineRecordId}:${item.localId}`,
        findingRecordId: offlineRecordId,
        fileName: item.fileName,
        fileType: item.fileType,
        fileSize: item.fileSize,
        blob: item.file,
      })));
      await persistProgress(answers, nextFindings);
      let syncPending = false;
      if (!isDemoMode() && isOnline) {
        try {
          const receipt = await saveFindingToSupabase(draft, inspection, checklistItemId,
            existingFinding?.serverId ?? (existingFinding?.id.startsWith("internal-") ? existingFinding.id : undefined));
          finding.serverId = receipt.id;
          finding.serverUpdatedAt = receipt.serverUpdatedAt;
          await acknowledgeOfflineFindingSync(offlineRecord, receipt.id, receipt.serverUpdatedAt);
        } catch {
          syncPending = true;
        }
      }
      setFindings(nextFindings);
      setOfflineStorageError(syncPending ? "Finding saved locally. Supabase sync is pending." : "");
      findingFormForRef.current = null;
      setFindingFormFor(null);
      setFindingFormError("");
      setFindingDraft(createEmptyFindingDraft());
    } catch (error) {
      setFindingFormError(`Unable to save Finding locally or to Supabase: ${getSaveErrorMessage(error)}`);
      setOfflineStorageError("A Finding or its evidence could not be saved. The current form is still available.");
      setIsSavingFinding(false);
      return;
    }
    setIsSavingFinding(false);
  };

  const confirmCompletion = async () => {
    if (!readyToComplete || findingFormFor !== null || isCompleting) return;

    setIsCompleting(true);
    setCompletionError("");
    const completedAt = new Date().toISOString();
    const completedChecklist = checklist.flatMap((item) => {
      const answer = answers[item.id];
      return answer?.result
        ? [{
            checklistItemId: item.id,
            checklistItemTitle: item.label,
            result: answer.result,
            remark: answer.remark,
          }]
        : [];
    });
    if (completedChecklist.length !== checklist.length) {
      setIsCompleting(false);
      return;
    }

    const completedFindings: CompletedInspectionFinding[] = findings
      .filter((finding) => finding.inspectionId === inspection.id)
      .map((finding) => ({
        id: finding.id,
        inspectionId: finding.inspectionId,
        checklistItemId: finding.checklistItemId,
        checklistItemTitle: finding.checklistItemTitle,
        description: finding.description,
        category: finding.category,
        severity: finding.severity,
        area: finding.area,
        remarks: finding.remarks,
        createdAt: finding.createdAt,
        gps: finding.gps,
        evidence: finding.evidence.map((item) => ({
          localId: item.localId,
          fileName: item.fileName,
          fileType: item.fileType,
          fileSize: item.fileSize,
          previewUrl: item.previewUrl,
        })),
      }));
    const record: CompletedInspectionRecord = {
      inspection: { ...inspection, status: "Completed" },
      completedAt,
      checklist: completedChecklist,
      findings: completedFindings,
    };

    try {
      await persistProgress(answers, findings, "COMPLETED");
      if (!isDemoMode() && isOnline) await completeSupabaseInspection(inspection, answers);
      const result = completeInspectionAndTransfer(record);
      preservePreviewUrlsOnUnmountRef.current = completedFindings.some(
        (finding) => finding.evidence.some((item) => item.previewUrl),
      );
      setCompletedRecord(result.completedRecord);
      setTransferredCount(result.transferredCount);
      setInspection({ ...inspection, status: "Completed" });
      setConfirmationOpen(false);
      setIsCompleting(false);
      findingFormForRef.current = null;
      setFindingFormFor(null);
      setSaveNotice(false);
    } catch (error) {
      setCompletionError(error instanceof Error ? `Unable to save inspection completion: ${error.message}` : "Unable to save inspection completion.");
      setOfflineStorageError("Inspection completion could not be saved. Your current progress remains on screen.");
      setIsCompleting(false);
    }
  };

  const captureGps = (checklistItemId: string) => {
    setGpsError("");
    setGpsErrorFor(null);

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsErrorFor(checklistItemId);
      setGpsError("Location unavailable. You can continue the inspection without GPS.");
      return;
    }

    setGpsLoadingFor(checklistItemId);
    requestFindingGps(
      (gps) => {
        if (findingFormForRef.current === checklistItemId) {
          setFindingDraft((current) => ({ ...current, gps }));
        } else if (findingFormForRef.current === null) {
          setFindings((current) => current.map((finding) =>
            finding.inspectionId === inspection.id && finding.checklistItemId === checklistItemId
              ? { ...finding, gps }
              : finding,
          ));
        }
        setGpsLoadingFor(null);
      },
      () => {
        setGpsError("Location unavailable. You can continue the inspection without GPS.");
        setGpsErrorFor(checklistItemId);
        setGpsLoadingFor(null);
      },
    );
  };

  const saveProgress = async () => {
    if (progressSaving) return;
    setProgressSaving(true);
    setProgressError("");
    try {
      await persistProgress(answers, findings);
      if (!isDemoMode() && isOnline) await saveSupabaseChecklistAnswers(inspection, answers);
      setOfflineStorageError("");
      setSaveNotice(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save inspection progress.";
      setProgressError(message);
      setOfflineStorageError(`Unable to save inspection progress: ${message}`);
      setSaveNotice(false);
    } finally {
      setProgressSaving(false);
    }
  };

  const addEvidence = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.currentTarget.files ?? []);
    const { attachments, rejectedCount } = createFindingEvidence(
      selectedFiles,
      (previewUrl) => objectUrlsRef.current.add(previewUrl),
    );

    if (attachments.length) {
      setFindingDraft((current) => ({ ...current, evidence: [...current.evidence, ...attachments] }));
    }
    setEvidenceError(
      rejectedCount ? "Use JPG, PNG, or WebP images up to 10 MB each." : "",
    );
    event.currentTarget.value = "";
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Inspection execution</p>
          <p className="mt-1 break-words text-sm font-semibold text-slate-600">{inspection.id}</p>
        </div>
        <Link
          href="/inspections"
          className="inline-flex w-fit rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Back to Inspections
        </Link>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="text-2xl font-bold text-slate-900">{inspection.type}</h1>
          <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[inspection.status]}`}>
            {inspection.status}
          </span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-[0.12em] text-slate-500">Inspector</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-800">{inspection.inspector}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.12em] text-slate-500">Area</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-800">{inspection.area}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.12em] text-slate-500">Date</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-800">{inspection.date}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.12em] text-slate-500">Status</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-800">{inspection.status}</dd>
          </div>
        </dl>
      </section>

      {offlineStorageError ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {offlineStorageError}
        </p>
      ) : null}

      <section aria-labelledby="checklist-heading">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Field checklist</p>
            <h2 id="checklist-heading" className="mt-1 text-xl font-semibold text-slate-900">Inspection Checklist</h2>
          </div>
          <p className="text-sm font-semibold text-slate-700">
            {answeredCount} of {checklist.length} items completed ({progressPercent}%)
          </p>
        </div>
        <div
          className="mb-4 h-2 overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-label="Checklist progress"
          aria-valuemin={0}
          aria-valuemax={checklist.length}
          aria-valuenow={answeredCount}
        >
          <div className="h-full rounded-full bg-sky-600 transition-all" style={{ width: `${progressPercent}%` }} />
        </div>

        <div className="space-y-3">
          {checklist.map((item, index) => {
            const answer = answers[item.id];
            const isFailed = answer?.result === "Fail";
            const existingFinding = getFinding(item.id);
            const isFindingFormOpen = findingFormFor === item.id;

            return (
              <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">Item {index + 1}</p>
                    <h3 className="mt-1 text-base font-semibold text-slate-900">{item.label}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{item.guidance}</p>
                  </div>
                  <div role="group" aria-label={`Result for ${item.label}`} className="flex shrink-0 gap-2">
                    {resultOptions.map((result) => {
                      const selected = answer?.result === result;
                      return (
                        <button
                          key={result}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => updateAnswer(item.id, { result })}
                          className={`min-w-14 rounded-lg border px-3 py-2 text-sm font-semibold transition ${resultButtonClass(result, selected)}`}
                        >
                          {result}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {isFailed || existingFinding ? (
                  <div className={`mt-4 flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between ${
                    isFailed && !existingFinding ? "border-red-100 bg-red-50/70" : "border-emerald-100 bg-emerald-50/70"
                  }`}>
                    <p className={`text-sm font-medium ${
                      isFailed && !existingFinding ? "text-red-800" : "text-emerald-800"
                    }`}>
                      {isFailed
                        ? existingFinding
                          ? `Fail - Finding recorded (${existingFinding.id})`
                          : "Fail - Finding required"
                        : `Finding ${existingFinding?.id} recorded and retained for this checklist item`}
                    </p>
                    {existingFinding?.gps ? (
                      <span className="w-fit rounded-full bg-white px-2.5 py-1 text-xs font-medium text-sky-800">GPS captured</span>
                    ) : null}
                    {existingFinding?.evidence.length ? (
                      <span className="w-fit rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                        {existingFinding.evidence.length} {existingFinding.evidence.length === 1 ? "evidence" : "evidence files"}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      disabled={gpsLoadingFor !== null}
                      onClick={() => {
                        if (isFindingFormOpen) {
                          findingFormForRef.current = null;
                          setFindingFormFor(null);
                          setFindingFormError("");
                          setFindingDraft(createEmptyFindingDraft());
                        } else {
                          openFindingForm(item.id);
                        }
                      }}
                      className="w-fit shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isFindingFormOpen ? "Close Finding Form" : existingFinding ? "Edit Finding" : "Record Finding"}
                    </button>
                  </div>
                ) : null}

                {isFindingFormOpen ? (
                  <FindingForm
                    title={existingFinding ? `Edit Finding ${existingFinding.id}` : "Record Finding"}
                    context={`Linked to ${inspection.id} / ${item.id} / ${item.label}`}
                    draft={findingDraft}
                    onDraftChange={updateFindingDraft}
                    onSave={(draft) => saveFinding(item.id, item.label, draft)}
                    onCancel={() => {
                      findingFormForRef.current = null;
                      setFindingFormFor(null);
                      setFindingFormError("");
                      setFindingDraft(createEmptyFindingDraft());
                    }}
                    onCaptureGps={() => captureGps(item.id)}
                    gpsLoading={gpsLoadingFor === item.id}
                    gpsError={gpsErrorFor === item.id ? gpsError : ""}
                    evidenceError={evidenceError}
                    formError={findingFormError}
                    isSaving={isSavingFinding}
                    onAddEvidence={addEvidence}
                    onRemoveEvidence={(localId) => {
                      setFindingDraft((current) => ({
                        ...current,
                        evidence: current.evidence.filter((evidence) => evidence.localId !== localId),
                      }));
                      setEvidenceError("");
                    }}
                  />
                ) : null}

                <label className="mt-4 block">
                  <span className="text-xs font-medium text-slate-600">Inspector remark (optional)</span>
                  <textarea
                    value={answer?.remark ?? ""}
                    onChange={(event) => updateAnswer(item.id, { remark: event.target.value })}
                    rows={2}
                    className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:bg-white"
                    placeholder="Add a short observation"
                  />
                </label>
              </article>
            );
          })}
        </div>
      </section>

      <section aria-label="Inspection actions" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        {saveNotice ? (
          <p role="status" className="mb-4 text-sm font-medium text-emerald-700">
            {isDemoMode()
              ? "Inspection progress saved locally."
              : !isOnline
                ? "Inspection progress saved locally. Pending sync."
                : "Inspection progress saved locally and to Supabase."}
          </p>
        ) : null}
        {progressError ? <p role="alert" className="mb-4 text-sm font-medium text-red-700">{progressError}</p> : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={progressSaving || isCompleting}
            onClick={() => { void saveProgress(); }}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            {progressSaving ? "Saving…" : "Save & Continue"}
          </button>
          <button
            type="button"
            disabled={!readyToComplete || findingFormFor !== null || isCompleting}
            onClick={() => {
              setCompletionError("");
              setConfirmationOpen(true);
              setSaveNotice(false);
            }}
            className="rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
          >
            Complete Inspection
          </button>
        </div>
      </section>

      {confirmationOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="complete-inspection-heading"
            className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"
          >
            <h2 id="complete-inspection-heading" className="text-xl font-bold text-slate-900">Confirm Inspection Completion</h2>
            <p className="mt-1 text-sm text-slate-600">Review this inspection summary before finalizing.</p>
            <dl className="mt-5 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm">
              <div><dt className="text-xs text-slate-500">Inspection ID</dt><dd className="mt-1 font-semibold text-slate-800">{inspection.id}</dd></div>
              <div><dt className="text-xs text-slate-500">Inspection Type</dt><dd className="mt-1 font-semibold text-slate-800">{inspection.type}</dd></div>
              <div><dt className="text-xs text-slate-500">Checklist Items</dt><dd className="mt-1 font-semibold text-slate-800">{checklist.length}</dd></div>
              <div><dt className="text-xs text-slate-500">Pass / Fail / N/A</dt><dd className="mt-1 font-semibold text-slate-800">{passCount} / {failCount} / {notApplicableCount}</dd></div>
              <div><dt className="text-xs text-slate-500">Findings</dt><dd className="mt-1 font-semibold text-slate-800">{findings.filter((finding) => finding.inspectionId === inspection.id).length}</dd></div>
            </dl>
            {completionError ? <p role="alert" className="mt-4 text-sm font-medium text-red-700">{completionError}</p> : null}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={isCompleting}
                onClick={() => setConfirmationOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isCompleting}
                onClick={confirmCompletion}
                className="rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-wait disabled:opacity-60"
              >
                {isCompleting ? "Completing…" : "Confirm Completion"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
