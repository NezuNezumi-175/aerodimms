import type { FindingCategory, FindingDraft, FindingSeverity, Inspection } from "@/lib/inspection-data";
import {
  getAllOfflineFindings,
  getAllOfflineInspectionProgress,
  getOfflineInspections,
  getOfflineEvidenceForFinding,
  saveOfflineFinding,
  updateOfflineFindingSyncStatus,
  updateOfflineInspectionSyncStatus,
  type OfflineFindingKind,
  type OfflineFindingRecord,
} from "@/lib/offline-db";
import { saveFindingToSupabase } from "@/lib/supabase/finding-write";
import {
  completeSupabaseInspection,
  markSupabaseInspectionInProgress,
  saveSupabaseChecklistAnswers,
} from "@/lib/supabase/inspection-write";

export async function saveFindingToLocalQueue(
  draft: FindingDraft,
  kind: OfflineFindingKind,
  relatedInspection?: Inspection,
  checklistItemId?: string,
  checklistItemTitle?: string,
) {
  const token = crypto.randomUUID();
  const findingId = `internal-${token}`;
  const recordId = kind === "manual"
    ? `manual:${findingId}`
    : `inspection:${relatedInspection?.id ?? "unknown"}:${findingId}`;
  const now = new Date().toISOString();
  const record = await saveOfflineFinding({
    id: recordId,
    findingId,
    kind,
    inspectionId: relatedInspection?.id,
    checklistItemId,
    checklistItemTitle,
    description: draft.description.trim(),
    category: draft.category,
    severity: draft.severity,
    area: draft.area.trim() || relatedInspection?.area || "",
    remarks: draft.remarks.trim(),
    gps: draft.gps,
    createdAt: now,
  }, draft.evidence.map((item) => ({
    id: `${recordId}:${item.localId}`,
    findingRecordId: recordId,
    fileName: item.fileName,
    fileType: item.fileType,
    fileSize: item.fileSize,
    blob: item.file,
  })));
  return record;
}

function toDraft(record: OfflineFindingRecord, evidence: Awaited<ReturnType<typeof getOfflineEvidenceForFinding>>): FindingDraft {
  return {
    description: record.description,
    category: record.category as FindingCategory,
    severity: record.severity as FindingSeverity,
    area: record.area,
    remarks: record.remarks,
    gps: record.gps,
    evidence: evidence.map((item) => {
      const file = new File([item.blob], item.fileName, { type: item.fileType });
      return { localId: item.id, file, fileName: item.fileName, fileType: item.fileType, fileSize: item.fileSize, previewUrl: URL.createObjectURL(file) };
    }),
  };
}

let syncInProgress: Promise<{ errors: string[] }> | null = null;

async function runPendingOfflineChanges(): Promise<{ errors: string[] }> {
  const findings = await getAllOfflineFindings();
  const errors: string[] = [];
  const inspectionsWithFailedFindings = new Set<string>();
  for (const record of findings) {
    if (record.syncStatus === "synced") continue;
    await updateOfflineFindingSyncStatus(record.id, "syncing");
    try {
      const evidence = await getOfflineEvidenceForFinding(record.id);
      const draft = toDraft(record, evidence);
      try {
        const relatedInspection = record.inspectionId
          ? { id: record.inspectionId, area: record.area }
          : undefined;
        await saveFindingToSupabase(
          draft,
          relatedInspection,
          record.checklistItemId,
          undefined,
          {
            findingId: record.findingId,
            findingCode: `F-${record.findingId.replace(/[^a-zA-Z0-9]/g, "").slice(-12).toUpperCase()}`,
            sourceFindingId: record.id,
          },
        );
        await updateOfflineFindingSyncStatus(record.id, "synced");
      } finally {
        draft.evidence.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Finding synchronization failed.";
      errors.push(`${record.findingId}: ${message}`);
      console.warn("Finding synchronization failed; it remains in the local queue.", record.findingId, error);
      if (record.inspectionId) inspectionsWithFailedFindings.add(record.inspectionId);
      await updateOfflineFindingSyncStatus(record.id, "failed");
    }
  }

  const progressRecords = await getAllOfflineInspectionProgress();
  const inspections = await getOfflineInspections();
  for (const progress of progressRecords) {
    if (progress.syncStatus === "synced") continue;
    await updateOfflineInspectionSyncStatus(progress.inspectionId, "syncing");
    try {
      if (inspectionsWithFailedFindings.has(progress.inspectionId)) {
        throw new Error("A related Finding is still waiting to synchronize.");
      }
      const inspection = inspections.find((item) => item.id === progress.inspectionId);
      if (!inspection) throw new Error(`Inspection ${progress.inspectionId} has not been cached on this device. Open it online before synchronizing progress.`);
      const answers = progress.answers as Record<string, { result?: "Pass" | "Fail" | "N/A"; remark: string }>;
      if (progress.completionState === "COMPLETED") {
        await completeSupabaseInspection(inspection, answers);
      } else {
        await markSupabaseInspectionInProgress(inspection);
        await saveSupabaseChecklistAnswers(inspection, answers);
      }
      await updateOfflineInspectionSyncStatus(progress.inspectionId, "synced");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Inspection synchronization failed.";
      errors.push(`${progress.inspectionId}: ${message}`);
      console.warn("Inspection synchronization failed; it remains in the local queue.", progress.inspectionId, error);
      await updateOfflineInspectionSyncStatus(progress.inspectionId, "failed");
    }
  }
  return { errors };
}

export function syncPendingOfflineChanges(): Promise<{ errors: string[] }> {
  if (syncInProgress) return syncInProgress;
  const currentSync = runPendingOfflineChanges()
    .then((result) => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("aerodimms:offline-sync-complete", { detail: result }));
      }
      return result;
    })
    .finally(() => { syncInProgress = null; });
  syncInProgress = currentSync;
  return currentSync;
}
