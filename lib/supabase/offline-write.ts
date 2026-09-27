import type { OfflineFindingWithEvidence } from "@/lib/offline-db";
import { markOfflineEvidenceSynced } from "@/lib/offline-db";
import { createClient } from "@/lib/supabase/client";
import { EVIDENCE_BUCKET, safeFileName } from "@/lib/supabase/finding-write";
import { insertFindingWithUniqueCode } from "@/lib/supabase/finding-code";

export class ConfirmedMissingLinkedFindingError extends Error {
  constructor(serverId: string) {
    super(`Linked server finding ${serverId} no longer exists.`);
    this.name = "ConfirmedMissingLinkedFindingError";
  }
}

async function sameContent(left: Blob, right: Blob) {
  const [leftHash, rightHash] = await Promise.all([
    left.arrayBuffer().then((bytes) => crypto.subtle.digest("SHA-256", bytes)),
    right.arrayBuffer().then((bytes) => crypto.subtle.digest("SHA-256", bytes)),
  ]);
  const rightBytes = new Uint8Array(rightHash);
  return new Uint8Array(leftHash).every((byte, index) => byte === rightBytes[index]);
}

export function sameGpsCoordinate(left: unknown, right: unknown) {
  if (left === null || right === null || left === undefined || right === undefined) return left === right;
  if (!["number", "string"].includes(typeof left) || !["number", "string"].includes(typeof right)) return false;
  const a = Number(left), b = Number(right);
  // Allow only floating-point round-trip noise (a few ULPs), not GPS movement.
  return Number.isFinite(a) && Number.isFinite(b)
    && Math.abs(a - b) <= 8 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
}

function sameLegacyGpsCoordinate(left: unknown, right: unknown) {
  if (sameGpsCoordinate(left, right)) return true;
  if (!['number', 'string'].includes(typeof left) || !['number', 'string'].includes(typeof right)
      || String(left).trim() === '' || String(right).trim() === '') return false;
  const a = Number(left), b = Number(right);
  // Only for acknowledging an unchanged legacy insert: at most ~1 mm of
  // coordinate serialization noise. Never use this tolerance for normal edits.
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-8;
}

// Unlike the interactive writer, retries use the already persisted local identity.
export async function syncOfflineFinding({ record, evidence }: OfflineFindingWithEvidence, userId: string, employeeId: string) {
  const supabase = createClient();
  if (record.evidenceIds.some((id) => !evidence.some((item) => item.id === id))) {
    throw new Error("A referenced local evidence blob is missing. The finding remains pending.");
  }
  const knownServerId = record.serverId
    ?? (record.serverUpdatedAt ? record.internalId ?? (record.findingId.startsWith("internal-") ? record.findingId : undefined) : undefined)
    ?? (!record.internalId && record.findingId.startsWith("internal-") ? record.findingId : undefined);
  const localId = knownServerId ?? record.internalId ?? (record.kind === "manual"
    ? record.id.slice("manual:".length)
    : `internal-${record.inspectionId}-${record.findingId}`);
  const findExisting = async () => {
    let query = supabase.from("findings").select("*");
    query = !knownServerId && !record.internalId && record.kind === "checklist" && record.inspectionId && record.checklistItemId
      ? query.eq("source_inspection_id", record.inspectionId).eq("checklist_item_id", record.checklistItemId)
      : query.eq("id", localId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data;
  };
  let existing = await findExisting();
  // maybeSingle() only returns null here after a successful authenticated read;
  // Supabase/network/auth errors above still throw and remain retryable.
  if (knownServerId && !existing) throw new ConfirmedMissingLinkedFindingError(knownServerId);
  if (existing && (existing.source_inspection_id !== (record.inspectionId ?? null)
      || existing.checklist_item_id !== (record.checklistItemId ?? null))) {
    throw new Error(`Server finding ${existing.id} belongs to a different inspection/checklist item. Local data remains pending.`);
  }
  if (existing && !knownServerId && record.kind === "manual" && new Date(existing.created_at).getTime() !== new Date(record.createdAt).getTime()) {
    throw new Error(`Finding ID ${localId} already belongs to another record. Local data remains pending.`);
  }
  const values = {
    title: record.description.trim().slice(0, 120), description: record.description.trim(),
    category: record.category, severity: record.severity.toUpperCase(), location_name: record.area,
    latitude: record.gps?.latitude ?? null, longitude: record.gps?.longitude ?? null,
    gps_captured_at: record.gps?.capturedAt ?? null, inspector_remarks: record.remarks,
    source_inspection_id: record.inspectionId ?? null, checklist_item_id: record.checklistItemId ?? null,
    updated_at: record.updatedAt,
  };
  let serverUpdatedAt: string = existing?.updated_at ?? record.updatedAt;
  let findingCode: string = existing?.finding_code ?? record.findingCode ?? record.findingId;
  let reconciledLegacyInsert = false;
  if (!existing) {
    const inserted = await insertFindingWithUniqueCode({
      ...values, id: localId,
      source_finding_id: record.findingId, source: "INTERNAL_INSPECTION", status: "FINDING",
      created_by_employee_id: employeeId, created_at: record.createdAt,
    });
    existing = await findExisting();
    if (!existing) throw new Error("Inserted finding could not be verified. Local data remains pending.");
    serverUpdatedAt = inserted.updated_at;
    findingCode = inserted.finding_code;
  }
  if (existing) {
    // Preserve the existing Issues lifecycle status, assignee and original creator.
    const differingFields = Object.entries(values).filter(([key, value]) => {
      if (key === "updated_at") return false;
      if (key === "latitude" || key === "longitude") return !sameGpsCoordinate(existing[key], value);
      if (key === "gps_captured_at" && value && existing[key]) {
        return new Date(String(value)).getTime() !== new Date(existing[key]).getTime();
      }
      return existing[key] !== value;
    }).map(([key]) => key);
    const serverCreated = new Date(existing.created_at).getTime();
    const serverUpdated = new Date(existing.updated_at).getTime();
    reconciledLegacyInsert = !record.serverUpdatedAt
      && Number.isFinite(serverCreated) && serverCreated === serverUpdated
      && existing.source === "INTERNAL_INSPECTION" && existing.status === "FINDING"
      && differingFields.every((key) => (key === "latitude" || key === "longitude")
        && sameLegacyGpsCoordinate(existing[key], values[key as "latitude" | "longitude"]));
    if (differingFields.length && !reconciledLegacyInsert) {
      const serverChanged = record.serverUpdatedAt
        ? new Date(existing.updated_at).getTime() !== new Date(record.serverUpdatedAt).getTime()
        : new Date(existing.updated_at).getTime() > new Date(record.updatedAt).getTime();
      if (serverChanged) {
        throw new Error(`Finding ${existing.id} has newer server changes. Local changes remain pending for review. `
          + `Local record: ${record.id}; local saved: ${record.updatedAt}; local created: ${record.createdAt}; `
          + `server updated: ${existing.updated_at}; server created: ${existing.created_at}; `
          + `base server revision: ${record.serverUpdatedAt ?? "not recorded (legacy local snapshot)"}; `
          + `differing fields: ${differingFields.join(", ")}.`
          + differingFields.filter((key) => key === "latitude" || key === "longitude")
            .map((key) => ` ${key} delta (degrees): ${Math.abs(Number(existing[key]) - Number(values[key as "latitude" | "longitude"]))}.`).join(""));
      }
      const { data: updated, error } = await supabase.from("findings")
        .update({ ...values, updated_at: new Date().toISOString() }).eq("id", existing.id)
        .eq("updated_at", existing.updated_at).select("id, updated_at").single();
      if (error) throw error;
      serverUpdatedAt = updated.updated_at;
    }
  }
  const findingId = existing?.id ?? localId;
  // Older successful interactive writes leave local records pending. Reuse their
  // existing evidence only when its bytes match, rather than duplicating photos.
  const { data: existingEvidence, error: evidenceReadError } = await supabase.from("evidence")
    .select("id, storage_path, file_name, mime_type, file_size").eq("finding_id", findingId);
  if (evidenceReadError) throw evidenceReadError;
  const reusedEvidenceIds = new Set<string>();
  for (const item of evidence) {
    if (item.syncStatus === "synced") continue;
    const { data: stored, error: readError } = await supabase.from("evidence")
      .select("id, finding_id, file_name, mime_type, file_size").eq("id", item.id).maybeSingle();
    if (readError) throw readError;
    if (stored) {
      if (stored.finding_id !== findingId || stored.file_name !== item.fileName || stored.mime_type !== item.fileType || stored.file_size !== item.fileSize) {
        throw new Error(`Evidence ID ${item.id} conflicts with an existing upload. Local evidence remains pending.`);
      }
    } else {
      let matched = false;
      for (const candidate of existingEvidence ?? []) {
        if (reusedEvidenceIds.has(candidate.id) || candidate.file_name !== item.fileName || candidate.mime_type !== item.fileType
            || (candidate.file_size !== null && candidate.file_size !== item.fileSize)) continue;
        const { data: uploaded, error } = await supabase.storage.from(EVIDENCE_BUCKET).download(candidate.storage_path);
        if (error) throw error;
        if (uploaded && await sameContent(uploaded, item.blob)) {
          reusedEvidenceIds.add(candidate.id);
          matched = true;
          break;
        }
      }
      if (matched) {
        await markOfflineEvidenceSynced(item);
        continue;
      }
      const objectId = Array.from(new TextEncoder().encode(item.id), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const storagePath = `${userId}/${findingId}/${objectId}-${safeFileName(item.fileName)}`;
      const { error: uploadError } = await supabase.storage.from(EVIDENCE_BUCKET)
        .upload(storagePath, item.blob, { contentType: item.fileType, upsert: false });
      if (uploadError) {
        // A previous attempt may have uploaded the object before losing connectivity.
        // Verify its content instead of overwriting it (Storage UPDATE is not granted).
        const { data: uploaded, error: downloadError } = await supabase.storage.from(EVIDENCE_BUCKET).download(storagePath);
        if (downloadError || !uploaded) throw new Error(`Evidence upload to ${EVIDENCE_BUCKET} failed: ${uploadError.message}`);
        if (!await sameContent(uploaded, item.blob)) {
          throw new Error(`Stored evidence content conflicts with ${item.id}. Local evidence remains pending.`);
        }
      }
      const { error: metadataError } = await supabase.from("evidence").insert({
        id: item.id, finding_id: findingId, storage_path: storagePath, file_name: item.fileName,
        mime_type: item.fileType, file_size: item.fileSize, uploaded_by_employee_id: employeeId,
        created_at: item.createdAt,
      });
      if (metadataError) throw metadataError;
    }
    await markOfflineEvidenceSynced(item);
  }
  const historyId = `offline:${record.id}:${record.updatedAt}`;
  const { data: history, error: historyReadError } = await supabase.from("issue_history").select("id").eq("id", historyId).maybeSingle();
  if (historyReadError) throw historyReadError;
  if (!history) {
    const { error } = await supabase.from("issue_history").insert({
      id: historyId, finding_id: findingId, user_employee_id: employeeId,
      action: "Offline finding data synchronized", remarks: record.checklistItemTitle ?? "Manual finding",
      created_at: record.updatedAt,
    });
    if (error && error.code !== "23505") throw error;
  }
  if (reconciledLegacyInsert) {
    // Evidence work can take time. Do not acknowledge a server row that changed
    // after the legacy comparison; retain the local snapshot for a safe retry.
    const { data: current, error } = await supabase.from("findings")
      .select("id, created_at, updated_at").eq("id", findingId).single();
    if (error) throw error;
    if (current.updated_at !== serverUpdatedAt || current.created_at !== existing.created_at) {
      throw new Error(`Finding ${findingId} changed during legacy reconciliation. Local changes remain pending for review.`);
    }
  }
  return { id: findingId, serverUpdatedAt, findingCode };
}
