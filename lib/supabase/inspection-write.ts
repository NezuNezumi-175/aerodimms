import {
  checklistByInspectionType,
  type CompletedInspectionRecord,
  type EvidenceAttachment,
  type FindingCategory,
  type FindingDraft,
  type FindingSeverity,
  type Inspection,
  type InspectionStatus,
} from "@/lib/inspection-data";
import { createClient } from "@/lib/supabase/client";
import { EVIDENCE_BUCKET, saveFindingToSupabase } from "@/lib/supabase/finding-write";
import { cacheOfflineInspections, getOfflineSyncQueue } from "@/lib/offline-db";

export type ChecklistAnswerValue = { result?: "Pass" | "Fail" | "N/A"; remark: string };
export type CreateSupabaseInspectionInput = {
  id: string;
  inspectorEmployeeId?: string;
  inspectorName: string;
  type: Inspection["type"];
  area: string;
  scheduledDate: string;
};
export type InspectionFindingForSupabase = {
  checklistItemId: string;
  description: string;
  category: FindingCategory;
  severity: FindingSeverity;
  area: string;
  remarks: string;
  gps: FindingDraft["gps"];
  evidence: EvidenceAttachment[];
};

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

export async function loadSupabaseInspections(): Promise<Inspection[]> {
  const supabase = createClient();
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("inspections")
      .select("*")
      .order("scheduled_date")
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }

  const inspections: Inspection[] = rows.map((row) => ({
    id: row.id,
    inspector: row.inspector_name,
    inspectorEmployeeId: row.inspector_employee_id ?? undefined,
    type: row.inspection_type as Inspection["type"],
    area: row.area,
    date: displayDate(row.scheduled_date),
    status: row.status as InspectionStatus,
  }));
  await cacheOfflineInspections(inspections);
  return inspections;
}

export async function createSupabaseInspection(input: CreateSupabaseInspectionInput): Promise<Inspection> {
  const { data, error } = await createClient()
    .from("inspections")
    .insert({
      id: input.id,
      inspector_employee_id: input.inspectorEmployeeId ?? null,
      inspector_name: input.inspectorName,
      inspection_type: input.type,
      area: input.area,
      scheduled_date: input.scheduledDate,
      status: "Scheduled",
    })
    .select("id, inspector_employee_id, inspector_name, inspection_type, area, scheduled_date, status")
    .single();
  if (error) throw error;

  const inspection: Inspection = {
    id: data.id,
    inspector: data.inspector_name,
    inspectorEmployeeId: data.inspector_employee_id ?? undefined,
    type: data.inspection_type as Inspection["type"],
    area: data.area,
    date: displayDate(data.scheduled_date),
    status: data.status as InspectionStatus,
  };
  await cacheOfflineInspections([inspection]);
  return inspection;
}

export async function loadSupabaseInspectionExecution(inspection: Inspection) {
  const supabase = createClient();
  const [answersResult, findingsResult, inspectionResult] = await Promise.all([
    supabase.from("inspection_checklist_answers").select("*").eq("inspection_id", inspection.id),
    supabase.from("findings").select("*").eq("source_inspection_id", inspection.id),
    supabase.from("inspections").select("status, completed_at").eq("id", inspection.id).single(),
  ]);
  const failed = [answersResult, findingsResult, inspectionResult].find((result) => result.error);
  if (failed?.error) throw failed.error;
  if (!inspectionResult.data) throw new Error(`Inspection ${inspection.id} was not found.`);

  const answerMap: Record<string, ChecklistAnswerValue> = {};
  for (const row of answersResult.data ?? []) {
    answerMap[row.checklist_item_id] = { result: row.result, remark: row.remark ?? "" };
  }
  const findings = (findingsResult.data ?? []).map((row) => ({
    id: row.id,
    findingCode: row.finding_code,
    internalId: row.id,
    inspectionId: inspection.id,
    checklistItemId: row.checklist_item_id ?? "",
    checklistItemTitle: checklistByInspectionType[inspection.type].find((item) => item.id === row.checklist_item_id)?.label ?? "",
    description: row.description,
    category: row.category ?? "Other",
    severity: String(row.severity).toLowerCase().replace(/^./, (letter) => letter.toUpperCase()) as "Low" | "Medium" | "High" | "Critical",
    area: row.location_name,
    remarks: row.inspector_remarks ?? "",
    gps: row.latitude !== null && row.longitude !== null
      ? { latitude: row.latitude, longitude: row.longitude, capturedAt: row.gps_captured_at ?? row.created_at }
      : null,
    evidence: [] as EvidenceAttachment[],
    createdAt: row.created_at,
    serverId: row.id,
    serverUpdatedAt: row.updated_at,
  }));

  if (inspectionResult.data.status !== "Completed" && findings.length) {
    const { data: evidenceRows, error } = await supabase.from("evidence").select("*")
      .in("finding_id", findings.map((finding) => finding.id));
    if (error) throw error;
    for (const row of evidenceRows ?? []) {
      const finding = findings.find((item) => item.id === row.finding_id);
      if (!finding) continue;
      const [download, preview] = await Promise.all([
        supabase.storage.from(EVIDENCE_BUCKET).download(row.storage_path),
        supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(row.storage_path, 3600),
      ]);
      if (download.error) throw download.error;
      if (preview.error) throw preview.error;
      const file = new File([download.data], row.file_name, { type: row.mime_type });
      finding.evidence.push({
        localId: row.id, file, fileName: row.file_name, fileType: row.mime_type,
        fileSize: row.file_size ?? file.size, previewUrl: preview.data.signedUrl,
      });
    }
  }

  let completedRecord: CompletedInspectionRecord | null = null;
  if (inspectionResult.data.status === "Completed") {
    const evidenceResult = findings.length
      ? await supabase.from("evidence").select("*").in("finding_id", findings.map((item) => item.id))
      : { data: [], error: null };
    if (evidenceResult.error) throw evidenceResult.error;
    const evidenceByFinding = new Map<string, NonNullable<typeof evidenceResult.data>>();
    for (const item of evidenceResult.data ?? []) {
      evidenceByFinding.set(item.finding_id, [...(evidenceByFinding.get(item.finding_id) ?? []), item]);
    }
    const checklist = checklistByInspectionType[inspection.type].flatMap((item) => {
      const answer = answerMap[item.id];
      return answer?.result ? [{ checklistItemId: item.id, checklistItemTitle: item.label, result: answer.result, remark: answer.remark }] : [];
    });
    completedRecord = {
      inspection: { ...inspection, status: "Completed" },
      completedAt: inspectionResult.data.completed_at ?? new Date().toISOString(),
      checklist,
      findings: findings.map((item) => ({
        id: item.id,
        findingCode: item.findingCode,
        inspectionId: inspection.id,
        checklistItemId: item.checklistItemId,
        checklistItemTitle: item.checklistItemTitle,
        description: item.description,
        category: item.category,
        severity: item.severity,
        area: item.area,
        remarks: item.remarks,
        createdAt: item.createdAt,
        gps: item.gps,
        evidence: (evidenceByFinding.get(item.id) ?? []).map((row) => ({
          localId: row.id,
          fileName: row.file_name,
          fileType: row.mime_type,
          fileSize: row.file_size ?? 0,
        })),
      })),
    };
  }

  return { answers: answerMap, findings, completedRecord };
}

export async function saveSupabaseChecklistAnswers(inspection: Inspection, answers: Record<string, ChecklistAnswerValue>) {
  const checklist = checklistByInspectionType[inspection.type];
  const rows = checklist.flatMap((item) => {
    const answer = answers[item.id];
    if (!answer?.result) return [];
    return [{
      id: `${inspection.id}:${item.id}`,
      inspection_id: inspection.id,
      checklist_item_id: item.id,
      checklist_item_title: item.label,
      result: answer.result,
      remark: answer.remark,
      updated_at: new Date().toISOString(),
    }];
  });
  if (!rows.length) return;
  const { error } = await createClient().from("inspection_checklist_answers").upsert(rows, { onConflict: "inspection_id,checklist_item_id" });
  if (error) throw error;
}

export async function markSupabaseInspectionInProgress(inspection: Inspection) {
  const { error } = await createClient().from("inspections")
    .update({ status: "In Progress", updated_at: new Date().toISOString() })
    .eq("id", inspection.id)
    .eq("status", "Scheduled");
  if (error) throw error;
}

export async function completeSupabaseInspection(
  inspection: Inspection,
  answers: Record<string, ChecklistAnswerValue>,
  findings: InspectionFindingForSupabase[] = [],
) {
  const supabase = createClient();
  for (const finding of findings) {
    const { data: existingFinding, error } = await supabase
      .from("findings")
      .select("id")
      .eq("source_inspection_id", inspection.id)
      .eq("checklist_item_id", finding.checklistItemId)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (existingFinding) continue;

    const draft: FindingDraft = {
      description: finding.description,
      category: finding.category,
      severity: finding.severity,
      area: finding.area,
      remarks: finding.remarks,
      gps: finding.gps,
      evidence: finding.evidence,
    };
    await saveFindingToSupabase(draft, inspection, finding.checklistItemId);
  }

  await saveSupabaseChecklistAnswers(inspection, answers);
  await assertInspectionDependenciesSynced(inspection.id);
  const completedAt = new Date().toISOString();
  const { error } = await createClient().from("inspections").update({ status: "Completed", completed_at: completedAt, updated_at: completedAt }).eq("id", inspection.id);
  if (error) throw error;
  return completedAt;
}

export async function assertInspectionDependenciesSynced(inspectionId: string) {
  const queue = await getOfflineSyncQueue();
  if (queue.findings.some(({ record }) => record.inspectionId === inspectionId)) {
    throw new Error("Related findings or evidence are still pending. Allow synchronization before completing this inspection in Supabase.");
  }
}
