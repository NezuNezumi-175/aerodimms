import { loadDemoState, saveDemoState } from "@/lib/demo-data";
import type { FindingDraft, Inspection } from "@/lib/inspection-data";
import type { CompletedInspectionRecord, InternalInspectionFinding } from "@/lib/inspection-data";
import { getNextManualFindingCode } from "@/lib/manual-finding-id";
import { saveOfflineFinding } from "@/lib/offline-db";

function hasValidGps(gps: FindingDraft["gps"]): gps is NonNullable<FindingDraft["gps"]> {
  return Boolean(
    gps &&
      Number.isFinite(gps.latitude) &&
      Number.isFinite(gps.longitude) &&
      gps.latitude >= -90 &&
      gps.latitude <= 90 &&
      gps.longitude >= -180 &&
      gps.longitude <= 180,
  );
}

export async function saveManualFinding(
  draft: FindingDraft,
  relatedInspection?: Inspection,
) {
  const state = loadDemoState();
  const existingFindings = state.internalInspectionFindings ?? [];
  const findingCode = getNextManualFindingCode(state);

  const now = new Date().toISOString();
  const gps = hasValidGps(draft.gps) ? draft.gps : null;
  const finding: InternalInspectionFinding = {
    id: `internal-${findingCode}`,
    findingCode,
    source: "INTERNAL_INSPECTION",
    ...(relatedInspection ? {
      sourceInspectionId: relatedInspection.id,
      relatedInspectionType: relatedInspection.type,
      relatedInspector: relatedInspection.inspector,
      relatedInspectionArea: relatedInspection.area,
    } : {}),
    sourceFindingId: findingCode,
    title: draft.description.trim().slice(0, 120),
    description: draft.description.trim(),
    category: draft.category,
    severity: draft.severity.toUpperCase() as InternalInspectionFinding["severity"],
    status: "FINDING",
    locationName: draft.area.trim() || relatedInspection?.area || "",
    ...(gps ? { latitude: gps.latitude, longitude: gps.longitude, capturedAt: gps.capturedAt } : {}),
    gps,
    evidence: draft.evidence.map((item) => ({
      localId: item.localId,
      fileName: item.fileName,
      fileType: item.fileType,
      fileSize: item.fileSize,
    })),
    inspectorRemarks: draft.remarks.trim(),
    createdAt: now,
    updatedAt: now,
  };
  const historyEntry = {
    id: `history-${finding.id}`,
    findingId: finding.id,
    userId: "inspection-demo-user",
    action: "Manual Internal Inspection Finding recorded",
    previousStatus: "",
    newStatus: "FINDING",
    remarks: relatedInspection ? `Related inspection: ${relatedInspection.id}` : "No related inspection",
    createdAt: now,
  };

  const offlineRecordId = `manual:${finding.id}`;
  await saveOfflineFinding({
    id: offlineRecordId,
    findingId: finding.findingCode,
    kind: "manual",
    inspectionId: relatedInspection?.id,
    description: finding.description,
    category: finding.category,
    severity: finding.severity,
    area: finding.locationName,
    remarks: finding.inspectorRemarks,
    gps: finding.gps,
    createdAt: finding.createdAt,
  }, draft.evidence.map((item) => ({
    id: `${offlineRecordId}:${item.localId}`,
    findingRecordId: offlineRecordId,
    fileName: item.fileName,
    fileType: item.fileType,
    fileSize: item.fileSize,
    blob: item.file,
  })));

  saveDemoState({
    ...state,
    internalInspectionFindings: [...existingFindings, finding],
    issueHistory: [...state.issueHistory, historyEntry],
  });
  return finding;
}

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