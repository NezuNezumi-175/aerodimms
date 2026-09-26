"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { CompletedInspectionView } from "@/components/completed-inspection-view";
import {
  allInspections,
  checklistByInspectionType,
  type CompletedInspectionFinding,
  type CompletedInspectionRecord,
  type InspectionStatus,
} from "@/lib/inspection-data";
import { loadDemoState } from "@/lib/demo-data";
import { completeInspectionAndTransfer } from "@/lib/inspection-workflow";

type ChecklistResult = "Pass" | "Fail" | "N/A";
type ChecklistAnswer = { result?: ChecklistResult; remark: string };
type FindingCategory =
  | "Pavement / Surface"
  | "FOD"
  | "Lighting / AGL"
  | "Markings"
  | "Drainage"
  | "Wildlife Hazard"
  | "Facility / Infrastructure"
  | "Other";
type FindingSeverity = "Low" | "Medium" | "High" | "Critical";
type GpsLocation = { latitude: number; longitude: number; capturedAt: string };
type EvidenceAttachment = {
  localId: string;
  file: File;
  fileName: string;
  fileType: string;
  fileSize: number;
  previewUrl: string;
};
type FindingDraft = {
  description: string;
  category: FindingCategory | "";
  severity: FindingSeverity | "";
  area: string;
  remarks: string;
  gps: GpsLocation | null;
  evidence: EvidenceAttachment[];
};
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
};

const statusStyles: Record<InspectionStatus, string> = {
  Scheduled: "bg-slate-100 text-slate-700",
  "In Progress": "bg-sky-100 text-sky-800",
  Completed: "bg-emerald-100 text-emerald-800",
};

const resultOptions: ChecklistResult[] = ["Pass", "Fail", "N/A"];
const findingCategories: FindingCategory[] = [
  "Pavement / Surface",
  "FOD",
  "Lighting / AGL",
  "Markings",
  "Drainage",
  "Wildlife Hazard",
  "Facility / Infrastructure",
  "Other",
];
const findingSeverities: FindingSeverity[] = ["Low", "Medium", "High", "Critical"];
const severityStyles: Record<FindingSeverity, string> = {
  Low: "border-emerald-600 bg-emerald-600 text-white",
  Medium: "border-amber-500 bg-amber-500 text-white",
  High: "border-orange-600 bg-orange-600 text-white",
  Critical: "border-red-700 bg-red-700 text-white",
};
const formControlClass =
  "mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:bg-white";
const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function getImageType(file: File): string | null {
  if (acceptedImageTypes.has(file.type)) return file.type;

  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return null;
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function createEmptyFindingDraft(area = ""): FindingDraft {
  return { description: "", category: "", severity: "", area, remarks: "", gps: null, evidence: [] };
}

function resultButtonClass(result: ChecklistResult, selected: boolean) {
  if (!selected) return "border-slate-200 bg-white text-slate-600 hover:bg-slate-50";
  if (result === "Pass") return "border-emerald-600 bg-emerald-600 text-white";
  if (result === "Fail") return "border-red-600 bg-red-600 text-white";
  return "border-slate-600 bg-slate-600 text-white";
}

export function InspectionExecutionPanel({ inspectionId }: { inspectionId: string }) {
  const inspection = allInspections.find((item) => item.id === inspectionId);
  const [answers, setAnswers] = useState<Record<string, ChecklistAnswer>>({});
  const [findings, setFindings] = useState<LocalFinding[]>([]);
  const [findingFormFor, setFindingFormFor] = useState<string | null>(null);
  const [findingDraft, setFindingDraft] = useState<FindingDraft>(() => createEmptyFindingDraft());
  const [findingFormError, setFindingFormError] = useState("");
  const [gpsLoadingFor, setGpsLoadingFor] = useState<string | null>(null);
  const [gpsErrorFor, setGpsErrorFor] = useState<string | null>(null);
  const [gpsError, setGpsError] = useState("");
  const [evidenceError, setEvidenceError] = useState("");
  const [saveNotice, setSaveNotice] = useState(false);
  const [completionLoadedFor, setCompletionLoadedFor] = useState<string | null>(null);
  const [completedRecord, setCompletedRecord] = useState<CompletedInspectionRecord | null>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [completionError, setCompletionError] = useState("");
  const [transferredCount, setTransferredCount] = useState(0);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const findingFormForRef = useRef<string | null>(null);
  const preservePreviewUrlsOnUnmountRef = useRef(false);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const demoState = loadDemoState();
        const record = demoState.completedInspectionRecords?.find(
          (item) => item.inspection.id === inspectionId,
        ) ?? null;
        setCompletedRecord(record);
        setTransferredCount(
          (demoState.internalInspectionFindings ?? []).filter(
            (finding) => finding.sourceInspectionId === inspectionId,
          ).length,
        );
      } catch {
        setCompletedRecord(null);
      }
      setCompletionLoadedFor(inspectionId);
    });
    return () => {
      active = false;
    };
  }, [inspectionId]);

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

  if (!inspection) {
    return (
      <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Inspection not found</h1>
        <p className="mt-2 text-sm text-slate-600">No mock inspection matches ID {inspectionId}.</p>
        <Link href="/inspections" className="mt-5 inline-flex rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">
          Back to Inspections
        </Link>
      </div>
    );
  }

  if (completionLoadedFor !== inspectionId) {
    return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading inspection status…</div>;
  }

  if (completedRecord) {
    return <CompletedInspectionView record={completedRecord} transferredCount={transferredCount} />;
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

  const updateAnswer = (itemId: string, update: Partial<ChecklistAnswer>) => {
    setAnswers((current) => {
      const previous = current[itemId] ?? { remark: "" };
      return { ...current, [itemId]: { ...previous, ...update } };
    });
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

  const saveFinding = (event: FormEvent<HTMLFormElement>, checklistItemId: string, checklistItemTitle: string) => {
    event.preventDefault();
    const description = findingDraft.description.trim();

    if (!description || !findingDraft.category || !findingDraft.severity) {
      setFindingFormError("Enter a description, category, and severity before saving.");
      return;
    }

    const existingFinding = getFinding(checklistItemId);
    const finding: LocalFinding = {
      id: existingFinding?.id ?? `F-${String(findings.length + 1).padStart(3, "0")}`,
      inspectionId: inspection.id,
      checklistItemId,
      checklistItemTitle,
      description,
      category: findingDraft.category,
      severity: findingDraft.severity,
      area: findingDraft.area.trim() || inspection.area,
      remarks: findingDraft.remarks.trim(),
      gps: findingDraft.gps,
      evidence: findingDraft.evidence,
      createdAt: existingFinding?.createdAt ?? new Date().toISOString(),
    };

    setFindings((current) => {
      const existingIndex = current.findIndex(
        (item) => item.inspectionId === inspection.id && item.checklistItemId === checklistItemId,
      );
      if (existingIndex < 0) return [...current, finding];
      return current.map((item, index) => (index === existingIndex ? finding : item));
    });
    findingFormForRef.current = null;
    setFindingFormFor(null);
    setFindingFormError("");
    setFindingDraft(createEmptyFindingDraft());
  };

  const confirmCompletion = () => {
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
      const result = completeInspectionAndTransfer(record);
      preservePreviewUrlsOnUnmountRef.current = completedFindings.some(
        (finding) => finding.evidence.some((item) => item.previewUrl),
      );
      setCompletedRecord(result.completedRecord);
      setTransferredCount(result.transferredCount);
      setConfirmationOpen(false);
      setIsCompleting(false);
      findingFormForRef.current = null;
      setFindingFormFor(null);
      setSaveNotice(false);
    } catch {
      setCompletionError("Unable to save this completion in the local demo store. Please try again.");
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
    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const gps: GpsLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            capturedAt: new Date().toISOString(),
          };
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
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
      );
    } catch {
      setGpsError("Location unavailable. You can continue the inspection without GPS.");
      setGpsErrorFor(checklistItemId);
      setGpsLoadingFor(null);
    }
  };

  const addEvidence = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.currentTarget.files ?? []);
    const attachments: EvidenceAttachment[] = [];
    let rejectedCount = 0;

    selectedFiles.forEach((file) => {
      const fileType = getImageType(file);
      if (!fileType) {
        rejectedCount += 1;
        return;
      }

      const previewUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(previewUrl);
      attachments.push({
        localId: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `evidence-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        file,
        fileName: file.name,
        fileType,
        fileSize: file.size,
        previewUrl,
      });
    });

    if (attachments.length) {
      setFindingDraft((current) => ({ ...current, evidence: [...current.evidence, ...attachments] }));
    }
    setEvidenceError(
      rejectedCount ? "Only JPG, PNG, and WebP images can be attached." : "",
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
                  <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/50 p-4 sm:p-5">
                    <div className="mb-4 border-b border-sky-100 pb-3">
                      <h4 className="font-semibold text-slate-900">
                        {existingFinding ? `Edit Finding ${existingFinding.id}` : "Record Finding"}
                      </h4>
                      <p className="mt-1 text-xs text-slate-600">
                        Linked to {inspection.id} / {item.id} / {item.label}
                      </p>
                    </div>

                    <form onSubmit={(event) => saveFinding(event, item.id, item.label)} className="space-y-4">
                      <label className="block">
                        <span className="text-sm font-medium text-slate-700">Finding Description <span className="text-red-600">*</span></span>
                        <textarea
                          required
                          rows={3}
                          maxLength={1000}
                          value={findingDraft.description}
                          onChange={(event) => updateFindingDraft({ description: event.target.value })}
                          className={formControlClass}
                          placeholder="Describe the observed condition or hazard"
                        />
                      </label>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block">
                          <span className="text-sm font-medium text-slate-700">Category <span className="text-red-600">*</span></span>
                          <select
                            required
                            value={findingDraft.category}
                            onChange={(event) => updateFindingDraft({ category: event.target.value as FindingCategory | "" })}
                            className={formControlClass}
                          >
                            <option value="">Select a category</option>
                            {findingCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                          </select>
                        </label>

                        <fieldset>
                          <legend className="text-sm font-medium text-slate-700">
                            Priority / Severity <span className="text-red-600">*</span>
                          </legend>
                          <div role="group" aria-label="Finding severity" className="mt-1.5 flex flex-wrap gap-2">
                            {findingSeverities.map((severity) => {
                              const selected = findingDraft.severity === severity;
                              return (
                                <button
                                  key={severity}
                                  type="button"
                                  aria-pressed={selected}
                                  onClick={() => updateFindingDraft({ severity })}
                                  className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                                    selected ? severityStyles[severity] : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                  }`}
                                >
                                  {severity}
                                </button>
                              );
                            })}
                          </div>
                        </fieldset>
                      </div>

                      <label className="block">
                        <span className="text-sm font-medium text-slate-700">Location / Area</span>
                        <input
                          required
                          value={findingDraft.area}
                          onChange={(event) => updateFindingDraft({ area: event.target.value })}
                          className={formControlClass}
                        />
                      </label>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <section aria-label="GPS location" className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="flex items-center justify-between gap-2">
                            <h5 className="text-sm font-semibold text-slate-700">GPS Location</h5>
                            {findingDraft.gps ? <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">Captured</span> : null}
                          </div>
                          {findingDraft.gps ? (
                            <dl className="mt-3 space-y-1.5 text-xs text-slate-600">
                              <div className="flex justify-between gap-2"><dt>Latitude</dt><dd className="font-medium text-slate-800">{findingDraft.gps.latitude.toFixed(6)}</dd></div>
                              <div className="flex justify-between gap-2"><dt>Longitude</dt><dd className="font-medium text-slate-800">{findingDraft.gps.longitude.toFixed(6)}</dd></div>
                              <div><dt className="text-slate-500">Captured</dt><dd className="mt-0.5 font-medium text-slate-800">{new Date(findingDraft.gps.capturedAt).toLocaleString()}</dd></div>
                            </dl>
                          ) : <p className="mt-1 text-sm text-slate-500">GPS location not captured yet</p>}
                          {gpsErrorFor === item.id && gpsError ? <p role="status" className="mt-2 text-xs text-amber-800">{gpsError}</p> : null}
                          <button
                            type="button"
                            disabled={gpsLoadingFor !== null}
                            onClick={() => captureGps(item.id)}
                            className="mt-3 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
                          >
                            {gpsLoadingFor === item.id ? "Capturing location..." : findingDraft.gps ? "Update GPS Location" : "Capture GPS Location"}
                          </button>
                        </section>
                        <section aria-label="Evidence" className="rounded-lg border border-slate-200 bg-white p-3">
                          <h5 className="text-sm font-semibold text-slate-700">Photo / Evidence</h5>
                          <label className="mt-2 block text-sm text-slate-600">
                            <span className="sr-only">Add Photo / Evidence</span>
                            <input
                              type="file"
                              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                              capture="environment"
                              multiple
                              onChange={addEvidence}
                              className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-700 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-sky-800"
                            />
                          </label>
                          {findingDraft.evidence.length ? (
                            <ul className="mt-3 divide-y divide-slate-100">
                              {findingDraft.evidence.map((attachment) => (
                                <li key={attachment.localId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                                  <Image
                                    src={attachment.previewUrl}
                                    alt={`Preview of ${attachment.fileName}`}
                                    width={64}
                                    height={64}
                                    unoptimized
                                    className="h-16 w-16 shrink-0 rounded-md border border-slate-200 object-cover"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="break-all text-xs font-medium text-slate-800">{attachment.fileName}</p>
                                    <p className="mt-1 text-xs text-slate-500">{attachment.fileType} · {formatFileSize(attachment.fileSize)}</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFindingDraft((current) => ({
                                        ...current,
                                        evidence: current.evidence.filter((item) => item.localId !== attachment.localId),
                                      }));
                                      setEvidenceError("");
                                    }}
                                    className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                                  >
                                    Remove
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : <p className="mt-2 text-sm text-slate-500">No evidence attached</p>}
                          {evidenceError ? <p role="alert" className="mt-2 text-xs text-amber-800">{evidenceError}</p> : null}
                        </section>
                      </div>

                      <label className="block">
                        <span className="text-sm font-medium text-slate-700">Remarks (optional)</span>
                        <textarea
                          rows={2}
                          maxLength={500}
                          value={findingDraft.remarks}
                          onChange={(event) => updateFindingDraft({ remarks: event.target.value })}
                          className={formControlClass}
                          placeholder="Additional context"
                        />
                      </label>

                      {findingFormError ? <p role="alert" className="text-sm font-medium text-red-700">{findingFormError}</p> : null}

                      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          disabled={gpsLoadingFor !== null}
                          onClick={() => {
                            findingFormForRef.current = null;
                            setFindingFormFor(null);
                            setFindingFormError("");
                            setFindingDraft(createEmptyFindingDraft());
                          }}
                          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button type="submit" className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800">
                          Save Finding
                        </button>
                      </div>
                    </form>
                  </div>
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
            Inspection progress saved locally for this session.
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => {
              setSaveNotice(true);
            }}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Save &amp; Continue
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