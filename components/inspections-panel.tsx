"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { FindingForm } from "@/components/finding-form";
import { createFindingEvidence, requestFindingGps } from "@/lib/finding-form";
import { loadDemoState, type DemoState } from "@/lib/demo-data";
import { saveManualFinding } from "@/lib/inspection-workflow";
import {
  completedInspections,
  inProgressInspections,
  scheduledInspections,
  type FindingDraft,
  type Inspection,
  type InspectionStatus,
} from "@/lib/inspection-data";

function createEmptyFindingDraft(area = ""): FindingDraft {
  return { description: "", category: "", severity: "", area, remarks: "", gps: null, evidence: [] };
}

const statusStyles: Record<InspectionStatus, string> = {
  Scheduled: "bg-slate-100 text-slate-700",
  "In Progress": "bg-sky-100 text-sky-800",
  Completed: "bg-emerald-100 text-emerald-800",
};

function InspectionCard({
  inspection,
  action,
}: {
  inspection: Inspection;
  action?: "Start" | "Continue" | "View";
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            {inspection.id}
          </p>
          <h3 className="mt-1 text-base font-semibold text-slate-900">{inspection.type}</h3>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[inspection.status]}`}>
          {inspection.status}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-xs text-slate-500">Inspector</dt>
          <dd className="mt-0.5 font-medium text-slate-700">{inspection.inspector}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Area</dt>
          <dd className="mt-0.5 font-medium text-slate-700">{inspection.area}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Date</dt>
          <dd className="mt-0.5 font-medium text-slate-700">{inspection.date}</dd>
        </div>
      </dl>

      {action ? (
        <Link
          href={`/inspections/${inspection.id}`}
          className="mt-4 inline-flex rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
        >
          {action}
        </Link>
      ) : null}
    </article>
  );
}

function InspectionSection({
  title,
  inspections,
  action,
  viewableIds,
}: {
  title: string;
  inspections: Inspection[];
  action?: "Start" | "Continue";
  viewableIds?: Set<string>;
}) {
  return (
    <section aria-labelledby={`${title.toLowerCase().replaceAll(" ", "-")}-heading`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2
          id={`${title.toLowerCase().replaceAll(" ", "-")}-heading`}
          className="text-xl font-semibold text-slate-900"
        >
          {title}
        </h2>
        <span className="text-sm font-medium text-slate-500">{inspections.length}</span>
      </div>
      <div className="space-y-3">
        {inspections.map((inspection) => (
          <InspectionCard
            key={inspection.id}
            inspection={inspection}
            action={viewableIds?.has(inspection.id) ? "View" : action}
          />
        ))}
      </div>
    </section>
  );
}

export function InspectionsPanel() {
  const [demoState, setDemoState] = useState<DemoState | null>(null);
  const [findingFormOpen, setFindingFormOpen] = useState(false);
  const [findingDraft, setFindingDraft] = useState<FindingDraft>(() => createEmptyFindingDraft());
  const [selectedInspectionId, setSelectedInspectionId] = useState("");
  const [findingFormError, setFindingFormError] = useState("");
  const [gpsError, setGpsError] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const objectUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setDemoState(loadDemoState());
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const retainedUrls = new Set(findingDraft.evidence.map((attachment) => attachment.previewUrl));
    objectUrlsRef.current.forEach((previewUrl) => {
      if (!retainedUrls.has(previewUrl)) {
        URL.revokeObjectURL(previewUrl);
        objectUrlsRef.current.delete(previewUrl);
      }
    });
  }, [findingDraft.evidence]);

  useEffect(
    () => () => {
      objectUrlsRef.current.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
      objectUrlsRef.current.clear();
    },
    [],
  );

  if (!demoState) {
    return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading inspections…</div>;
  }

  const completedRecords = demoState.completedInspectionRecords ?? [];
  const completedIds = new Set(completedRecords.map((record) => record.inspection.id));
  const activeScheduled = scheduledInspections.filter((inspection) => !completedIds.has(inspection.id));
  const activeInProgress = inProgressInspections.filter((inspection) => !completedIds.has(inspection.id));
  const completedHistory = [
    ...completedRecords.map((record) => record.inspection),
    ...completedInspections.filter((inspection) => !completedIds.has(inspection.id)),
  ];
  const viewableCompletedIds = new Set(completedRecords.map((record) => record.inspection.id));
  const relatedInspections = [...activeInProgress, ...activeScheduled];
  const relatedInspection = relatedInspections.find((inspection) => inspection.id === selectedInspectionId);

  const openFindingForm = () => {
    const defaultInspection = activeInProgress[0] ?? activeScheduled[0];
    setFindingDraft(createEmptyFindingDraft(defaultInspection?.area ?? ""));
    setSelectedInspectionId(defaultInspection?.id ?? "");
    setFindingFormError("");
    setGpsError("");
    setEvidenceError("");
    setSuccessMessage("");
    setFindingFormOpen(true);
  };

  const updateFindingDraft = (update: Partial<FindingDraft>) => {
    setFindingDraft((current) => ({ ...current, ...update }));
    setFindingFormError("");
  };

  const captureGps = () => {
    setGpsError("");
    setGpsLoading(true);
    requestFindingGps(
      (gps) => {
        setFindingDraft((current) => ({ ...current, gps }));
        setGpsLoading(false);
      },
      () => {
        setGpsError("Location unavailable. You can still save this Finding without GPS.");
        setGpsLoading(false);
      },
    );
  };

  const addEvidence = (event: ChangeEvent<HTMLInputElement>) => {
    const { attachments, rejectedCount } = createFindingEvidence(
      Array.from(event.currentTarget.files ?? []),
      (previewUrl) => objectUrlsRef.current.add(previewUrl),
    );
    if (attachments.length) {
      setFindingDraft((current) => ({ ...current, evidence: [...current.evidence, ...attachments] }));
    }
    setEvidenceError(rejectedCount ? "Only JPG, PNG, and WebP images can be attached." : "");
    event.currentTarget.value = "";
  };

  const saveFinding = (draft: FindingDraft) => {
    if (!draft.description.trim() || !draft.category || !draft.severity) {
      setFindingFormError("Enter a description, category, and severity before saving.");
      return;
    }

    try {
      const finding = saveManualFinding(draft, relatedInspection);
      setDemoState(loadDemoState());
      setFindingFormOpen(false);
      setFindingDraft(createEmptyFindingDraft());
      setSuccessMessage(`${finding.findingCode} saved to Issues at Stage 1: FINDING.`);
    } catch {
      setFindingFormError("Unable to save this Finding in the local demo store. Please try again.");
    }
  };

  const cancelFinding = () => {
    setFindingFormOpen(false);
    setFindingDraft(createEmptyFindingDraft());
    setFindingFormError("");
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Field operations</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Inspections</h1>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={openFindingForm}
            className="inline-flex items-center justify-center rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-800"
          >
            + Create Finding
          </button>
          <div className="flex items-center justify-between gap-8 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm sm:min-w-64">
            <div>
              <p className="text-sm font-medium text-slate-600">Active Inspections</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">
                {activeInProgress.length} active inspections
              </p>
            </div>
            <span className="text-3xl font-bold text-slate-900">{activeInProgress.length}</span>
          </div>
        </div>
      </div>

      {successMessage ? (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {successMessage}
        </p>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <InspectionSection title="Scheduled Inspections" inspections={activeScheduled} action="Start" />
        <InspectionSection title="In Progress Inspections" inspections={activeInProgress} action="Continue" />
      </div>

      <InspectionSection title="Completed History" inspections={completedHistory} viewableIds={viewableCompletedIds} />

      {findingFormOpen ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4">
          <div role="dialog" aria-modal="true" aria-label="Create Finding" className="mx-auto my-4 max-w-3xl rounded-xl bg-white p-4 shadow-2xl sm:p-6">
            <FindingForm
              title="Create Finding"
              context="Created manually from the Inspections overview. No checklist item is linked."
              draft={findingDraft}
              onDraftChange={updateFindingDraft}
              onSave={saveFinding}
              onCancel={cancelFinding}
              onCaptureGps={captureGps}
              gpsLoading={gpsLoading}
              gpsError={gpsError}
              evidenceError={evidenceError}
              formError={findingFormError}
              onAddEvidence={addEvidence}
              onRemoveEvidence={(localId) => {
                setFindingDraft((current) => ({
                  ...current,
                  evidence: current.evidence.filter((evidence) => evidence.localId !== localId),
                }));
                setEvidenceError("");
              }}
              relatedInspections={relatedInspections}
              selectedInspectionId={selectedInspectionId}
              onRelatedInspectionChange={(inspectionId) => {
                setSelectedInspectionId(inspectionId);
                const selected = relatedInspections.find((inspection) => inspection.id === inspectionId);
                if (selected) setFindingDraft((current) => ({ ...current, area: selected.area }));
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}