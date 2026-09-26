import type { FindingDraft, Inspection } from "@/lib/inspection-data";
import { createClient } from "@/lib/supabase/client";

const EVIDENCE_BUCKET = "finding-evidence";

function safeFileName(fileName: string) {
  return fileName.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "image";
}

export async function saveFindingToSupabase(
  draft: FindingDraft,
  relatedInspection?: Inspection,
  checklistItemId?: string,
  existingFindingId?: string,
) {
  const supabase = createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error("Sign in before saving a finding to Supabase.");

  const idToken = crypto.randomUUID();
  const findingId = existingFindingId ?? `internal-${idToken}`;
  let sourceFindingId = idToken;
  let findingCode = `F-MAN-${idToken.slice(0, 8).toUpperCase()}`;
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
      const evidenceId = crypto.randomUUID();
      const storagePath = `${user.id}/${findingId}/${evidenceId}-${safeFileName(attachment.fileName)}`;
      const { error: uploadError } = await supabase.storage
        .from(EVIDENCE_BUCKET)
        .upload(storagePath, attachment.file, { contentType: attachment.fileType, upsert: false });
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
    const findingResult = existingFindingId
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
      const { error: evidenceError } = await supabase.from("evidence").insert(evidenceRows);
      if (evidenceError) throw evidenceError;
    }
  } catch (error) {
    if (uploadedPaths.length) await supabase.storage.from(EVIDENCE_BUCKET).remove(uploadedPaths);
    throw error;
  }

  return { id: findingId, findingCode };
}
