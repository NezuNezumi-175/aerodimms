"use client";

import Link from "next/link";
<<<<<<< HEAD
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { FindingForm } from "@/components/finding-form";
import { createFindingEvidence, requestFindingGps } from "@/lib/finding-form";
import { loadDemoState, type DemoState } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/app-data";
import { saveManualFinding } from "@/lib/inspection-workflow";
import { saveFindingToSupabase } from "@/lib/supabase/finding-write";
import { loadSupabaseInspections } from "@/lib/supabase/inspection-write";
import { useNetworkStatus } from "@/lib/use-network-status";
import {
  allInspections,
  type FindingDraft,
=======
import { useEffect, useState } from "react";
import { loadDemoState, profiles as demoProfiles, saveDemoState, type DemoState } from "@/lib/demo-data";
import {
  allInspections,
  completedInspections,
  generateNextInspectionId,
  inProgressInspections,
  scheduledInspections,
>>>>>>> ui_fix
  type Inspection,
  type InspectionStatus,
  type InspectionType,
} from "@/lib/inspection-data";
import { useProfileRole } from "@/lib/profile-role-context";

type AdHocInspectionDraft = {
  id: string;
  inspector: string;
  type: InspectionType;
  area: string;
  dateTime: string;
  remarks: string;
};

const adHocInspectionTypes: InspectionType[] = [
  "Runway Surface Inspection",
  "Taxiway Safety Inspection",
  "Airfield Lighting Inspection",
  "Apron Operations Inspection",
  "Post-Incident Inspection",
  "Post-Weather Inspection",
  "Follow-up / Re-inspection",
  "Other",
];

function toDateTimeLocalValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getInspectionIds(state: DemoState) {
  return [
    ...allInspections.map((inspection) => inspection.id),
    ...(state.adHocInspections ?? []).map((inspection) => inspection.id),
    ...(state.completedInspectionRecords ?? []).map((record) => record.inspection.id),
  ];
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
  const profileRole = useProfileRole();
  // TODO: Disable this demo override when Supabase role permissions are implemented.
  const allowAdHocInspectionForDemo = true;
  const canCreateAdHocInspection = allowAdHocInspectionForDemo || profileRole === "OPERATIONS_MANAGER";
  const [demoState, setDemoState] = useState<DemoState | null>(null);
<<<<<<< HEAD
  const [supabaseInspections, setSupabaseInspections] = useState<Inspection[] | null>(null);
  const [inspectionLoadError, setInspectionLoadError] = useState("");
  const [findingFormOpen, setFindingFormOpen] = useState(false);
  const [findingDraft, setFindingDraft] = useState<FindingDraft>(() => createEmptyFindingDraft());
  const [selectedInspectionId, setSelectedInspectionId] = useState("");
  const [findingFormError, setFindingFormError] = useState("");
  const [isSavingFinding, setIsSavingFinding] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const isOnline = useNetworkStatus();

=======
  const [adHocFormOpen, setAdHocFormOpen] = useState(false);
  const [adHocDraft, setAdHocDraft] = useState<AdHocInspectionDraft | null>(null);
  const [adHocFormError, setAdHocFormError] = useState("");
  const [adHocSuccessMessage, setAdHocSuccessMessage] = useState("");
  const [isSavingAdHocInspection, setIsSavingAdHocInspection] = useState(false);
>>>>>>> ui_fix
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setDemoState(loadDemoState());
    });
    return () => {
      active = false;
    };
  }, []);

<<<<<<< HEAD
  useEffect(() => {
    if (isDemoMode()) return;
    if (!isOnline) {
      setSupabaseInspections(allInspections);
      setInspectionLoadError("");
      return;
    }
    let active = true;
    loadSupabaseInspections().then((items) => {
      if (active) setSupabaseInspections(items);
    }).catch((error) => {
      if (active) {
        setInspectionLoadError(error instanceof Error ? error.message : "Could not load inspections from Supabase.");
        setSupabaseInspections([]);
      }
    });
    return () => { active = false; };
  }, [isOnline]);

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

  if (!demoState || (!isDemoMode() && supabaseInspections === null)) {
=======
  if (!demoState) {
>>>>>>> ui_fix
    return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading inspections…</div>;
  }

  const inspectionRows = isDemoMode() || !isOnline ? allInspections : supabaseInspections ?? [];
  const completedRecords = demoState.completedInspectionRecords ?? [];
  const completedIds = new Set(completedRecords.map((record) => record.inspection.id));
<<<<<<< HEAD
  const activeScheduled = inspectionRows.filter((inspection) => inspection.status === "Scheduled" && !completedIds.has(inspection.id));
  const activeInProgress = inspectionRows.filter((inspection) => inspection.status === "In Progress" && !completedIds.has(inspection.id));
  const completedHistory = [
    ...completedRecords.map((record) => record.inspection),
    ...inspectionRows.filter((inspection) => inspection.status === "Completed" && !completedIds.has(inspection.id)),
  ];
  const viewableCompletedIds = new Set(completedHistory.map((inspection) => inspection.id));
  const relatedInspections = [...activeInProgress, ...activeScheduled];
  const relatedInspection = relatedInspections.find((inspection) => inspection.id === selectedInspectionId);
=======
  const adHocInspections = demoState.adHocInspections ?? [];
  const activeScheduled = [...scheduledInspections, ...adHocInspections.filter((inspection) => inspection.status === "Scheduled")]
    .filter((inspection) => !completedIds.has(inspection.id));
  const activeInProgress = [...inProgressInspections, ...adHocInspections.filter((inspection) => inspection.status === "In Progress")]
    .filter((inspection) => !completedIds.has(inspection.id));
  const completedHistory = [
    ...completedRecords.map((record) => record.inspection),
    ...adHocInspections.filter((inspection) => inspection.status === "Completed" && !completedIds.has(inspection.id)),
    ...completedInspections.filter((inspection) => !completedIds.has(inspection.id)),
  ];
  const viewableCompletedIds = new Set(completedRecords.map((record) => record.inspection.id));
  const inspectorOptions = Array.from(new Set([
    ...demoProfiles.filter((profile) => profile.role === "INSPECTOR").map((profile) => profile.fullName),
    ...allInspections.map((inspection) => inspection.inspector),
  ])).sort();
>>>>>>> ui_fix

  const openAdHocInspectionForm = () => {
    if (!canCreateAdHocInspection) return;
    const now = new Date();
    const currentState = loadDemoState();
    setAdHocDraft({
      id: generateNextInspectionId(getInspectionIds(currentState)),
      inspector: inspectorOptions[0] ?? "",
      type: "Post-Incident Inspection",
      area: "",
      dateTime: toDateTimeLocalValue(now),
      remarks: "",
    });
    setAdHocFormError("");
    setAdHocSuccessMessage("");
    setAdHocFormOpen(true);
  };

<<<<<<< HEAD
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
    setEvidenceError(rejectedCount ? "Use JPG, PNG, or WebP images up to 10 MB each." : "");
    event.currentTarget.value = "";
  };

  const saveFinding = async (draft: FindingDraft) => {
    if (isSavingFinding) return;
    if (!draft.description.trim() || !draft.category || !draft.severity) {
      setFindingFormError("Enter a description, category, and severity before saving.");
=======
  const createAdHocInspection = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreateAdHocInspection || !adHocDraft || isSavingAdHocInspection) return;
    if (!adHocDraft.inspector || !adHocDraft.area.trim() || !adHocDraft.dateTime || Number.isNaN(new Date(adHocDraft.dateTime).getTime())) {
      setAdHocFormError("Complete the assigned Inspector, location, and date/time before creating the Inspection.");
>>>>>>> ui_fix
      return;
    }

    setIsSavingAdHocInspection(true);
    try {
<<<<<<< HEAD
      const finding = isDemoMode() || !isOnline
        ? await saveManualFinding(draft, relatedInspection)
        : await saveFindingToSupabase(draft, relatedInspection);
      if (isDemoMode() || !isOnline) setDemoState(loadDemoState());
      setFindingFormOpen(false);
      setFindingDraft(createEmptyFindingDraft());
      setSuccessMessage(isDemoMode()
        ? `${finding.findingCode} saved locally.`
        : !isOnline
          ? `${finding.findingCode} saved locally. Pending sync.`
          : `${finding.findingCode} saved to Supabase with its GPS and evidence.`);
    } catch (error) {
      setFindingFormError(`Unable to save this Finding: ${getSaveErrorMessage(error)}`);
=======
      const currentState = loadDemoState();
      const inspectionIds = getInspectionIds(currentState);
      const id = inspectionIds.includes(adHocDraft.id)
        ? generateNextInspectionId(inspectionIds)
        : adHocDraft.id;
      const dateTime = new Date(adHocDraft.dateTime);
      const inspection: Inspection = {
        id,
        inspector: adHocDraft.inspector,
        type: adHocDraft.type,
        area: adHocDraft.area.trim(),
        date: dateTime.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }),
        status: "Scheduled",
        remarks: adHocDraft.remarks.trim() || undefined,
        isAdHoc: true,
      };
      const nextState: DemoState = {
        ...currentState,
        adHocInspections: [...(currentState.adHocInspections ?? []), inspection],
      };
      saveDemoState(nextState);
      setDemoState(nextState);
      setAdHocFormOpen(false);
      setAdHocDraft(null);
      setAdHocSuccessMessage(`${inspection.id} created as Scheduled.`);
    } catch {
      setAdHocFormError("Unable to save this Inspection to local demo storage. Keep the form open and retry.");
>>>>>>> ui_fix
    } finally {
      setIsSavingAdHocInspection(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Field operations</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Inspections</h1>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {canCreateAdHocInspection ? (
            <button
              type="button"
              onClick={openAdHocInspectionForm}
              className="inline-flex items-center justify-center rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-800"
            >
              + Start New Inspection
            </button>
          ) : null}
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

<<<<<<< HEAD
      {inspectionLoadError ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">Could not load inspections from Supabase: {inspectionLoadError}</p> : null}

      {successMessage ? (
=======
      {adHocSuccessMessage ? (
>>>>>>> ui_fix
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {adHocSuccessMessage}
        </p>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <InspectionSection title="Scheduled Inspections" inspections={activeScheduled} action="Start" />
        <InspectionSection title="In Progress Inspections" inspections={activeInProgress} action="Continue" />
      </div>

      <InspectionSection title="Completed History" inspections={completedHistory} viewableIds={viewableCompletedIds} />

      {adHocFormOpen && adHocDraft ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4">
<<<<<<< HEAD
          <div role="dialog" aria-modal="true" aria-label="Create Finding" className="mx-auto my-4 max-w-3xl rounded-xl bg-white p-4 shadow-2xl sm:p-6">
            <FindingForm
              title="Create Finding"
              context="Created manually from the Inspections overview. No checklist item is linked."
              draft={findingDraft}
              onDraftChange={updateFindingDraft}
              onSave={saveFinding}
              isSaving={isSavingFinding}
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
=======
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="ad-hoc-inspection-heading"
            className="mx-auto my-4 max-w-2xl rounded-xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"
          >
            <div className="mb-5 border-b border-slate-100 pb-4">
              <h2 id="ad-hoc-inspection-heading" className="text-xl font-bold text-slate-900">Create Ad-Hoc Inspection</h2>
              <p className="mt-1 text-sm text-slate-600">The Inspection will be created as Scheduled and use the standard checklist workflow.</p>
            </div>
            <form onSubmit={createAdHocInspection} className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Inspection ID</span>
                <input
                  readOnly
                  value={adHocDraft.id}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm font-semibold text-slate-700"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Assigned Inspector <span className="text-red-600">*</span></span>
                  <select
                    required
                    value={adHocDraft.inspector}
                    onChange={(event) => setAdHocDraft((current) => current ? { ...current, inspector: event.target.value } : current)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-400 focus:bg-white"
                  >
                    {inspectorOptions.map((inspector) => <option key={inspector} value={inspector}>{inspector}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Inspection Category / Type <span className="text-red-600">*</span></span>
                  <select
                    required
                    value={adHocDraft.type}
                    onChange={(event) => setAdHocDraft((current) => current ? { ...current, type: event.target.value as InspectionType } : current)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-400 focus:bg-white"
                  >
                    {adHocInspectionTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Location / Area <span className="text-red-600">*</span></span>
                <input
                  required
                  maxLength={120}
                  value={adHocDraft.area}
                  onChange={(event) => setAdHocDraft((current) => current ? { ...current, area: event.target.value } : current)}
                  placeholder="Runway 04/22, Taxiway A, Apron North"
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Date / Time <span className="text-red-600">*</span></span>
                <input
                  required
                  type="datetime-local"
                  value={adHocDraft.dateTime}
                  onChange={(event) => setAdHocDraft((current) => current ? { ...current, dateTime: event.target.value } : current)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Remarks (optional)</span>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={adHocDraft.remarks}
                  onChange={(event) => setAdHocDraft((current) => current ? { ...current, remarks: event.target.value } : current)}
                  placeholder="Reason or context for this non-routine inspection"
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-400 focus:bg-white"
                />
              </label>

              {adHocFormError ? <p role="alert" className="text-sm font-medium text-red-700">{adHocFormError}</p> : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={isSavingAdHocInspection}
                  onClick={() => {
                    setAdHocFormOpen(false);
                    setAdHocDraft(null);
                    setAdHocFormError("");
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingAdHocInspection}
                  className="rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-wait disabled:opacity-60"
                >
                  {isSavingAdHocInspection ? "Creating…" : "Create Inspection"}
                </button>
              </div>
            </form>
          </section>
>>>>>>> ui_fix
        </div>
      ) : null}

    </div>
  );
}
