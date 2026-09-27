"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { FindingForm } from "@/components/finding-form";
import { createFindingEvidence, requestFindingGps } from "@/lib/finding-form";
import { getStoredUser, loadDemoState, type DemoState, type Profile } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/app-data";
import { saveManualFinding } from "@/lib/inspection-workflow";
import { saveFindingToSupabase } from "@/lib/supabase/finding-write";
import { createSupabaseInspection, loadSupabaseInspections } from "@/lib/supabase/inspection-write";
import { useNetworkStatus } from "@/lib/use-network-status";
import { useSyncRefresh } from "@/lib/use-sync-refresh";
import { getCachedOfflineInspections } from "@/lib/offline-db";
import {
  allInspections,
  checklistByInspectionType,
  type FindingDraft,
  type Inspection,
  type InspectionStatus,
  type InspectionType,
} from "@/lib/inspection-data";

function createEmptyFindingDraft(area = ""): FindingDraft {
  return { description: "", category: "", severity: "", area, remarks: "", gps: null, evidence: [] };
}

type NewInspectionDraft = {
  id: string;
  inspectorValue: string;
  type: InspectionType;
  area: string;
  scheduledDate: string;
  scheduledTime: string;
};

const inspectionTypes = Object.keys(checklistByInspectionType) as InspectionType[];

function generateInspectionId(existingIds: string[], scheduledDate: string) {
  const prefix = `INSP-${scheduledDate}-`;
  const usedIds = new Set(existingIds);
  const highestSequence = existingIds.reduce((highest, id) => {
    if (!id.startsWith(prefix)) return highest;
    const sequence = Number(id.slice(prefix.length));
    return Number.isInteger(sequence) ? Math.max(highest, sequence) : highest;
  }, 0);
  let sequence = highestSequence + 1;
  let candidate = `${prefix}${String(sequence).padStart(2, "0")}`;
  while (usedIds.has(candidate)) {
    sequence += 1;
    candidate = `${prefix}${String(sequence).padStart(2, "0")}`;
  }
  return candidate;
}

function toDateInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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
          <dd className="mt-0.5 font-medium text-slate-700">{inspection.date}{inspection.scheduledTime ? ` · ${inspection.scheduledTime}` : ""}</dd>
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
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [demoState, setDemoState] = useState<DemoState | null>(null);
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
  const [newInspectionOpen, setNewInspectionOpen] = useState(false);
  const [newInspectionDraft, setNewInspectionDraft] = useState<NewInspectionDraft | null>(null);
  const [newInspectionError, setNewInspectionError] = useState("");
  const [isCreatingInspection, setIsCreatingInspection] = useState(false);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const inspectionLoadRequestRef = useRef(0);
  const isOnline = useNetworkStatus();
  const syncRevision = useSyncRefresh();

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
    let active = true;
    queueMicrotask(() => {
      if (active) setCurrentProfile(getStoredUser());
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (isDemoMode()) return;
    if (!isOnline) {
      let active = true;
      getCachedOfflineInspections().then((cached) => {
        if (active) {
          setSupabaseInspections((previous) => Array.from(new Map(
            [...allInspections, ...(previous ?? []), ...cached].map((item) => [item.id, item]),
          ).values()));
          setInspectionLoadError("");
        }
      }).catch(() => { /* Keep the last loaded list if local storage is unavailable. */ });
      return () => { active = false; };
    }
    let active = true;
    const requestId = ++inspectionLoadRequestRef.current;
    loadSupabaseInspections().then((items) => {
      if (active && requestId === inspectionLoadRequestRef.current) setSupabaseInspections(items);
    }).catch((error) => {
      if (active && requestId === inspectionLoadRequestRef.current) {
        setInspectionLoadError(error instanceof Error ? error.message : "Could not load inspections from Supabase.");
        setSupabaseInspections([]);
      }
    });
    return () => { active = false; };
  }, [isOnline, syncRevision]);

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
    return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading inspections…</div>;
  }

  const inspectionRows = isDemoMode() ? allInspections : supabaseInspections ?? [];
  const storedCompletedRecords = demoState.completedInspectionRecords ?? [];
  const completedRecords = !isDemoMode() && isOnline
    ? storedCompletedRecords.filter((record) => !inspectionRows.some((inspection) => inspection.id === record.inspection.id))
    : storedCompletedRecords;
  const completedIds = new Set(completedRecords.map((record) => record.inspection.id));
  const activeScheduled = inspectionRows.filter((inspection) => inspection.status === "Scheduled" && !completedIds.has(inspection.id));
  const activeInProgress = inspectionRows.filter((inspection) => inspection.status === "In Progress" && !completedIds.has(inspection.id));
  const completedHistory = [
    ...completedRecords.map((record) => record.inspection),
    ...inspectionRows.filter((inspection) => inspection.status === "Completed" && !completedIds.has(inspection.id)),
  ];
  const viewableCompletedIds = new Set(completedHistory.map((inspection) => inspection.id));
  const relatedInspections = [...activeInProgress, ...activeScheduled];
  const relatedInspection = relatedInspections.find((inspection) => inspection.id === selectedInspectionId);
  const inspectorOptions = Array.from(new Map(
    [
      ...inspectionRows.map((inspection) => ({
        value: inspection.inspectorEmployeeId ? `employee:${inspection.inspectorEmployeeId}` : `name:${inspection.inspector}`,
        employeeId: inspection.inspectorEmployeeId,
        name: inspection.inspector,
      })),
      ...(currentProfile?.role === "INSPECTOR" ? [{
        value: `employee:${currentProfile.employee_id}`,
        employeeId: currentProfile.employee_id,
        name: currentProfile.full_name,
      }] : []),
    ].map((option) => [option.value, option] as const),
  ).values());
  const canCreateInspection = !isDemoMode() && currentProfile?.role === "OPERATIONS_MANAGER";

  const openNewInspectionForm = () => {
    if (!canCreateInspection || !isOnline) return;
    const scheduledDate = toDateInputValue(new Date());
    try {
      setNewInspectionDraft({
        id: generateInspectionId(inspectionRows.map((inspection) => inspection.id), scheduledDate),
        inspectorValue: inspectorOptions[0]?.value ?? "",
        type: inspectionTypes[0],
        area: "",
        scheduledDate,
        scheduledTime: "",
      });
      setNewInspectionError("");
    } catch (error) {
      setNewInspectionError(getSaveErrorMessage(error));
      return;
    }
    setSuccessMessage("");
    setNewInspectionOpen(true);
  };

  const createInspection = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreateInspection || !newInspectionDraft || isCreatingInspection) return;
    if (!isOnline) {
      setNewInspectionError("Connect to the network before creating an Inspection in Supabase.");
      return;
    }
    const selectedInspector = inspectorOptions.find((option) => option.value === newInspectionDraft.inspectorValue);
    if (!selectedInspector || !newInspectionDraft.area.trim() || !newInspectionDraft.scheduledDate || !newInspectionDraft.scheduledTime) {
      setNewInspectionError("Choose an assigned Inspector and enter a location, scheduled date, and scheduled time.");
      return;
    }

    setIsCreatingInspection(true);
    setNewInspectionError("");
    let insertedInspection: Inspection | null = null;
    try {
      const latestInspections = await loadSupabaseInspections();
      const latestId = generateInspectionId(latestInspections.map((inspection) => inspection.id), newInspectionDraft.scheduledDate);

      const createdInspection = await createSupabaseInspection({
        id: latestId,
        inspectorEmployeeId: selectedInspector.employeeId,
        inspectorName: selectedInspector.name,
        type: newInspectionDraft.type,
        area: newInspectionDraft.area.trim(),
        scheduledDate: newInspectionDraft.scheduledDate,
        scheduledTime: newInspectionDraft.scheduledTime,
      });
      insertedInspection = createdInspection;
      if (createdInspection.status !== "Scheduled") {
        throw new Error(`Supabase created ${createdInspection.id} with unexpected status "${createdInspection.status}".`);
      }

      const refreshRequestId = ++inspectionLoadRequestRef.current;
      const refreshedInspections = await loadSupabaseInspections();
      const persistedInspection = refreshedInspections.find((inspection) => inspection.id === createdInspection.id);
      if (!persistedInspection || persistedInspection.status !== "Scheduled") {
        throw new Error(`${createdInspection.id} was inserted, but could not be verified as Scheduled when reloading inspections.`);
      }
      if (refreshRequestId === inspectionLoadRequestRef.current) setSupabaseInspections(refreshedInspections);
      setInspectionLoadError("");
      setNewInspectionOpen(false);
      setNewInspectionDraft(null);
      setSuccessMessage(`${persistedInspection.id} created as Scheduled.`);
    } catch (error) {
      setNewInspectionError(insertedInspection
        ? `${insertedInspection.id} was inserted in Supabase, but could not be verified as Scheduled after reloading: ${getSaveErrorMessage(error)}`
        : `Unable to create this Inspection in Supabase: ${getSaveErrorMessage(error)}`);
    } finally {
      setIsCreatingInspection(false);
    }
  };

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
    setEvidenceError(rejectedCount ? "Use JPG, PNG, or WebP images up to 10 MB each." : "");
    event.currentTarget.value = "";
  };

  const saveFinding = async (draft: FindingDraft) => {
    if (isSavingFinding) return;
    if (!draft.description.trim() || !draft.category || !draft.severity) {
      setFindingFormError("Enter a description, category, and severity before saving.");
      return;
    }

    setIsSavingFinding(true);
    try {
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
    } finally {
      setIsSavingFinding(false);
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
          {canCreateInspection ? (
            <button
              type="button"
              disabled={!isOnline}
              onClick={openNewInspectionForm}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              + Start New Inspection
            </button>
          ) : null}
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

      {inspectionLoadError ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">Could not load inspections from Supabase: {inspectionLoadError}</p> : null}

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

      {newInspectionOpen && newInspectionDraft ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-inspection-heading"
            className="mx-auto my-4 max-w-2xl rounded-xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"
          >
            <div className="mb-5 border-b border-slate-100 pb-4">
              <h2 id="new-inspection-heading" className="text-xl font-bold text-slate-900">Start New Inspection</h2>
              <p className="mt-1 text-sm text-slate-600">This Inspection will be saved as Scheduled and use the standard checklist workflow.</p>
            </div>
            <form onSubmit={createInspection} className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Inspection ID</span>
                <input readOnly value={newInspectionDraft.id} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm font-semibold text-slate-700" />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Assigned Inspector <span className="text-red-600">*</span></span>
                  <select
                    required
                    value={newInspectionDraft.inspectorValue}
                    onChange={(event) => setNewInspectionDraft((current) => current ? { ...current, inspectorValue: event.target.value } : current)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-400 focus:bg-white"
                  >
                    <option value="">Select an Inspector</option>
                    {inspectorOptions.map((inspector) => (
                      <option key={inspector.value} value={inspector.value}>{inspector.name}</option>
                    ))}
                  </select>
                  {!inspectorOptions.length ? <span className="mt-1 block text-xs text-amber-800">No Inspector profiles are available from the loaded inspections.</span> : null}
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Inspection Category / Type <span className="text-red-600">*</span></span>
                  <select
                    required
                    value={newInspectionDraft.type}
                    onChange={(event) => setNewInspectionDraft((current) => current ? { ...current, type: event.target.value as InspectionType } : current)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-400 focus:bg-white"
                  >
                    {inspectionTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Location / Area <span className="text-red-600">*</span></span>
                <input
                  required
                  maxLength={120}
                  value={newInspectionDraft.area}
                  onChange={(event) => setNewInspectionDraft((current) => current ? { ...current, area: event.target.value } : current)}
                  placeholder="Runway 04/22, Taxiway A, Apron North"
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Scheduled Date <span className="text-red-600">*</span></span>
                <input
                  required
                  type="date"
                  value={newInspectionDraft.scheduledDate}
                  onChange={(event) => setNewInspectionDraft((current) => current ? { ...current, scheduledDate: event.target.value } : current)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Scheduled Time <span className="text-red-600">*</span></span>
                <input
                  required
                  type="time"
                  value={newInspectionDraft.scheduledTime}
                  onChange={(event) => setNewInspectionDraft((current) => current ? { ...current, scheduledTime: event.target.value } : current)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-400 focus:bg-white"
                />
              </label>

              {newInspectionError ? <p role="alert" className="text-sm font-medium text-red-700">{newInspectionError}</p> : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={isCreatingInspection}
                  onClick={() => {
                    setNewInspectionOpen(false);
                    setNewInspectionDraft(null);
                    setNewInspectionError("");
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button type="submit" disabled={isCreatingInspection || !isOnline || !inspectorOptions.length} className="rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-wait disabled:opacity-60">
                  {isCreatingInspection ? "Creating…" : "Create Inspection"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {findingFormOpen ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4">
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
        </div>
      ) : null}
    </div>
  );
}
