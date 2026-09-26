import {
  checklistByInspectionType,
  type CompletedInspectionRecord,
  type Inspection,
  type InspectionStatus,
} from "@/lib/inspection-data";
import { createClient } from "@/lib/supabase/client";

export type ChecklistAnswerValue = { result?: "Pass" | "Fail" | "N/A"; remark: string };

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

export async function loadSupabaseInspections(): Promise<Inspection[]> {
  const { data, error } = await createClient().from("inspections").select("*").order("scheduled_date");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    inspector: row.inspector_name,
    type: row.inspection_type as Inspection["type"],
    area: row.area,
    date: displayDate(row.scheduled_date),
    status: row.status as InspectionStatus,
  }));
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
    evidence: [],
    createdAt: row.created_at,
  }));

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
  if (inspection.status !== "Scheduled") return;
  const { error } = await createClient().from("inspections").update({ status: "In Progress", updated_at: new Date().toISOString() }).eq("id", inspection.id);
  if (error) throw error;
}

export async function completeSupabaseInspection(inspection: Inspection, answers: Record<string, ChecklistAnswerValue>) {
  await saveSupabaseChecklistAnswers(inspection, answers);
  const completedAt = new Date().toISOString();
  const { error } = await createClient().from("inspections").update({ status: "Completed", completed_at: completedAt, updated_at: completedAt }).eq("id", inspection.id);
  if (error) throw error;
  return completedAt;
}
