import { loadDemoState, saveDemoState } from "@/lib/demo-data";
import type { CompletedInspectionRecord, InternalInspectionFinding } from "@/lib/inspection-data";

export function completeInspectionAndTransfer(record: CompletedInspectionRecord) {
  const state = loadDemoState();
  const existingRecord = state.completedInspectionRecords?.find(
    (item) => item.inspection.id === record.inspection.id,
  );
  const completedRecord = existingRecord ?? record;
  const existingFindings = state.internalInspectionFindings ?? [];
  const newFindings: InternalInspectionFinding[] = [];

  completedRecord.findings.forEach((finding) => {
    const duplicate = existingFindings.some(
      (item) =>
        item.sourceInspectionId === completedRecord.inspection.id &&
        item.sourceFindingId === finding.id,
    );
    if (duplicate) return;

    const findingId = `internal-${completedRecord.inspection.id}-${finding.id}`;
    const now = completedRecord.completedAt;
    newFindings.push({
      id: findingId,
      findingCode: `${completedRecord.inspection.id}-${finding.id}`,
      source: "INTERNAL_INSPECTION",
      sourceInspectionId: completedRecord.inspection.id,
      sourceFindingId: finding.id,
      checklistItemId: finding.checklistItemId,
      checklistItemTitle: finding.checklistItemTitle,
      title: finding.checklistItemTitle,
      description: finding.description,
      category: finding.category,
      severity: finding.severity.toUpperCase() as InternalInspectionFinding["severity"],
      status: "FINDING",
      locationName: finding.area,
      latitude: finding.gps?.latitude,
      longitude: finding.gps?.longitude,
      capturedAt: finding.gps?.capturedAt,
      gps: finding.gps,
      evidence: finding.evidence,
      inspectorRemarks: finding.remarks,
      createdAt: finding.createdAt,
      updatedAt: now,
    });
  });

  const transferHistory = newFindings.map((finding) => ({
    id: `history-${finding.id}`,
    findingId: finding.id,
    userId: "inspection-demo-user",
    action: "Internal Inspection Finding recorded",
    previousStatus: "",
    newStatus: "FINDING",
    remarks: `Source inspection: ${finding.sourceInspectionId}`,
    createdAt: completedRecord.completedAt,
  }));

  saveDemoState({
    ...state,
    completedInspectionRecords: existingRecord
      ? state.completedInspectionRecords
      : [...(state.completedInspectionRecords ?? []), completedRecord],
    internalInspectionFindings: [...existingFindings, ...newFindings],
    issueHistory: [...state.issueHistory, ...transferHistory],
  });

  return { completedRecord, transferredCount: newFindings.length };
}