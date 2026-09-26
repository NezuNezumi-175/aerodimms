import type { FindingDraft, Inspection } from "@/lib/inspection-data";
import { createClient } from "@/lib/supabase/client";

const EVIDENCE_BUCKET = "finding-evidence";

export type FindingSyncIdentity = {
  findingId?: string;
  findingCode?: string;
  sourceFindingId?: string;
};

function safeFileName(fileName: string) {
  return fileName.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "image";
}

export async function saveFindingToSupabase(
  draft: FindingDraft,
  relatedInspection?: Pick<Inspection, "id" | "area">,
  checklistItemId?: string,
  existingFindingId?: string,
  syncIdentity?: FindingSyncIdentity,
) {
  const supabase = createClient();
  const { data: { session }, error: userError } = await supabase.auth.getSession();
  if (userError) throw userError;
  const user = session?.user ?? null;
  if (!user) throw new Error("Sign in before saving a finding to Supabase.");

  const idToken = crypto.randomUUID();
  const findingId = existingFindingId ?? syncIdentity?.findingId ?? `internal-${idToken}`;
  let sourceFindingId = syncIdentity?.sourceFindingId ?? idToken;
  let findingCode = syncIdentity?.findingCode ?? `F-MAN-${idToken.slice(0, 8).toUpperCase()}`;
  if (existingFindingId) {
    const { data, error } = await supabase.from("findings").select("finding_code, source_finding_id").eq("id", existingFindingId).single();
    if (error) throw error;
    findingCode = data.finding_code;
    sourceFindingId = data.source_finding_id ?? idToken;
  }
  const now = new Date().toISOString();
  const gps = draft.gps && Number.isFinite(draft.gps.latitude) && Number.isFinite(draft.gps.longitude)
    ? draft.gps
    : null;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("employee_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;

  const uploadedPaths: string[] = [];
  try {
    const evidenceRows = [];
    for (const attachment of draft.evidence) {
      const evidenceId = syncIdentity ? attachment.localId : crypto.randomUUID();
      const storagePath = `${user.id}/${findingId}/${safeFileName(evidenceId)}-${safeFileName(attachment.fileName)}`;
      const { error: uploadError } = await supabase.storage
        .from(EVIDENCE_BUCKET)
        .upload(storagePath, attachment.file, { contentType: attachment.fileType, upsert: Boolean(syncIdentity) });
      if (uploadError) throw uploadError;
      uploadedPaths.push(storagePath);
      evidenceRows.push({
        id: evidenceId,
        finding_id: findingId,
        file_name: attachment.fileName,
        storage_path: storagePath,
        mime_type: attachment.fileType,
        file_size: attachment.fileSize,
        uploaded_by_employee_id: profile?.employee_id ?? null,
        created_at: now,
      });
    }

    const findingValues = {
      title: draft.description.trim().slice(0, 120),
      description: draft.description.trim(),
      category: draft.category,
      severity: draft.severity.toUpperCase(),
      status: "FINDING",
      location_name: draft.area.trim() || relatedInspection?.area || "",
      latitude: gps?.latitude ?? null,
      longitude: gps?.longitude ?? null,
      gps_captured_at: gps?.capturedAt ?? null,
      inspector_remarks: draft.remarks.trim(),
      source_inspection_id: relatedInspection?.id ?? null,
      source_finding_id: sourceFindingId,
      checklist_item_id: checklistItemId ?? null,
      updated_at: now,
    };
    let findingExists = Boolean(existingFindingId);
    if (syncIdentity && !findingExists) {
      const { data, error } = await supabase.from("findings").select("id").eq("id", findingId).maybeSingle();
      if (error) throw error;
      findingExists = Boolean(data);
    }
    const findingResult = findingExists
      ? await supabase.from("findings").update(findingValues).eq("id", findingId)
      : await supabase.from("findings").insert({
          ...findingValues,
          id: findingId,
          finding_code: findingCode,
          source: "INTERNAL_INSPECTION",
          created_by_employee_id: profile?.employee_id ?? null,
          created_at: now,
        });
    const findingError = findingResult.error;
    if (findingError) throw findingError;

    if (evidenceRows.length) {
      const rowsToInsert = syncIdentity
        ? await (async () => {
            const { data, error } = await supabase.from("evidence").select("id").in("id", evidenceRows.map((row) => row.id));
            if (error) throw error;
            const existingIds = new Set((data ?? []).map((row) => row.id));
            return evidenceRows.filter((row) => !existingIds.has(row.id));
          })()
        : evidenceRows;
      const { error: evidenceError } = rowsToInsert.length
        ? await supabase.from("evidence").insert(rowsToInsert)
        : { error: null };
      if (evidenceError) throw evidenceError;
    }
  } catch (error) {
    if (uploadedPaths.length) await supabase.storage.from(EVIDENCE_BUCKET).remove(uploadedPaths);
    throw error;
  }

  return { id: findingId, findingCode };
}
