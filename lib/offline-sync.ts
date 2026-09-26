import {
  getOfflineSyncQueue, acknowledgeOfflineFindingSync, markOfflineProgressSynced,
} from "@/lib/offline-db";
import { createClient } from "@/lib/supabase/client";
import {
  loadSupabaseInspections, markSupabaseInspectionInProgress, saveSupabaseChecklistAnswers, assertInspectionDependenciesSynced,
} from "@/lib/supabase/inspection-write";
import { syncOfflineFinding } from "@/lib/supabase/offline-write";

export type OfflineSyncResult = { errors: string[]; pending: boolean };
let running: Promise<OfflineSyncResult> | null = null;

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return String(error);
}

async function processQueue(): Promise<OfflineSyncResult> {
  const errors: string[] = [];
  const queue = await getOfflineSyncQueue();
  if (!queue.findings.length && !queue.progress.length) return { errors, pending: false };
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error("Sign in to synchronize pending local data.");
  const { data: profile, error: profileError } = await supabase.from("profiles").select("employee_id").eq("id", user.id).single();
  if (profileError) throw profileError;
  const inspections = await loadSupabaseInspections();
  let synchronized = false;
  for (const finding of queue.findings) {
    if (!navigator.onLine) break;
    try {
      if (finding.record.inspectionId && !inspections.some((item) => item.id === finding.record.inspectionId)) {
        throw new Error(`Inspection ${finding.record.inspectionId} is missing or unreadable in Supabase.`);
      }
      const receipt = await syncOfflineFinding(finding, user.id, profile.employee_id);
      await acknowledgeOfflineFindingSync(finding.record, receipt.id, receipt.serverUpdatedAt, receipt.findingCode);
      synchronized = true;
    } catch (error) {
      errors.push(`Finding ${finding.record.findingId}: ${errorMessage(error)}`);
    }
  }
  // Re-read the queue: a finding edited during upload must still block completion.
  const remaining = await getOfflineSyncQueue();
  for (const progress of queue.progress) {
    if (!navigator.onLine) break;
    try {
      if (remaining.findings.some(({ record }) => record.inspectionId === progress.inspectionId || progress.findingRecordIds.includes(record.id))) {
        throw new Error("Related findings or evidence are still pending.");
      }
      const inspection = inspections.find((item) => item.id === progress.inspectionId);
      if (!inspection) throw new Error(`Inspection ${progress.inspectionId} is missing or unreadable in Supabase.`);
      await saveSupabaseChecklistAnswers(inspection, progress.answers);
      if (progress.completionState === "COMPLETED" && inspection.status !== "Completed") {
        await assertInspectionDependenciesSynced(inspection.id);
        const { error } = await supabase.from("inspections").update({
          status: "Completed", completed_at: progress.updatedAt, updated_at: progress.updatedAt,
        }).eq("id", inspection.id).select("id").single();
        if (error) throw error;
      } else if (progress.completionState === "IN_PROGRESS") {
        await markSupabaseInspectionInProgress(inspection);
      }
      await markOfflineProgressSynced(progress);
      synchronized = true;
    } catch (error) {
      errors.push(`Inspection ${progress.inspectionId}: ${errorMessage(error)}`);
    }
  }
  const pending = await getOfflineSyncQueue();
  if (synchronized) window.dispatchEvent(new Event("aerodimms:sync-completed"));
  return { errors, pending: Boolean(pending.findings.length || pending.progress.length) };
}

export function synchronizeOfflineData(): Promise<OfflineSyncResult> {
  if (running) return running;
  const run = async () => {
    try {
      return await processQueue();
    } catch (error) {
      return { errors: [errorMessage(error)], pending: true };
    }
  };
  const task = (async () => navigator.locks
    ? await navigator.locks.request("aerodimms-offline-sync", run)
    : await run())().catch((error) => ({ errors: [errorMessage(error)], pending: true }))
    .finally(() => { running = null; });
  running = task;
  return task;
}
