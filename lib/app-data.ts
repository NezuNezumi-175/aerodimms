import {
  loadDemoState,
  type Asset,
  type DemoState,
  type EvidenceItem,
  type Finding,
  type IssueHistoryEntry,
  type WorkOrder,
} from "@/lib/demo-data";
import { createClient } from "@/lib/supabase/client";
import { cacheOfflineAppState, getAllOfflineFindings, getOfflineAppState, getOfflineEvidenceForFinding } from "@/lib/offline-db";
import type { InternalInspectionFinding } from "@/lib/inspection-data";

export function isDemoMode() {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}

type SupabaseAsset = {
  id: string;
  asset_code: string;
  name: string;
  asset_type: string;
  status: string;
  location_name: string;
  latitude: number;
  longitude: number;
};

type SupabaseFinding = {
  id: string;
  finding_code: string;
  source: Finding["source"];
  title: string;
  description: string;
  severity: Finding["severity"];
  status: Finding["status"];
  location_name: string;
  latitude: number | null;
  longitude: number | null;
  asset_id: string | null;
  airport_stand_code: string | null;
  assigned_to_employee_id: string | null;
  assigned_team: string | null;
  target_completion_date: string | null;
  created_by_employee_id: string | null;
  created_at: string;
  updated_at: string;
  category: string | null;
  inspector_remarks: string;
  gps_captured_at: string | null;
  source_inspection_id: string | null;
  checklist_item_id: string | null;
};

type SupabaseWorkOrder = {
  id: string;
  work_order_code: string;
  finding_id: string;
  assigned_to_employee_id: string | null;
  assigned_team: string | null;
  corrective_action: string;
  target_completion_date: string | null;
  remarks: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type SupabaseEvidence = {
  id: string;
  finding_id: string;
  phase: "BEFORE" | "AFTER" | null;
  file_name: string;
  storage_path: string;
  mime_type: string;
  uploaded_by_employee_id: string | null;
  created_at: string;
};

type SupabaseHistory = {
  id: string;
  finding_id: string;
  user_employee_id: string | null;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  remarks: string | null;
  created_at: string;
};

const optional = (value: string | null) => value ?? undefined;

function mapAsset(row: SupabaseAsset): Asset {
  return { id: row.id, assetCode: row.asset_code, name: row.name, assetType: row.asset_type, status: row.status, locationName: row.location_name, latitude: row.latitude, longitude: row.longitude };
}

function mapFinding(row: SupabaseFinding): Finding {
  return { id: row.id, findingCode: row.finding_code, source: row.source, title: row.title, description: row.description, severity: row.severity, status: row.status, locationName: row.location_name, latitude: row.latitude, longitude: row.longitude, assetId: optional(row.asset_id), airportStandCode: optional(row.airport_stand_code), assignedTo: optional(row.assigned_to_employee_id), assignedTeam: optional(row.assigned_team), targetCompletionDate: optional(row.target_completion_date), createdBy: optional(row.created_by_employee_id), createdAt: row.created_at, updatedAt: row.updated_at, category: optional(row.category), inspectorRemarks: row.inspector_remarks, gpsCapturedAt: optional(row.gps_captured_at), sourceInspectionId: optional(row.source_inspection_id), checklistItemId: optional(row.checklist_item_id) };
}

function mapWorkOrder(row: SupabaseWorkOrder): WorkOrder {
  return { id: row.id, workOrderCode: row.work_order_code, findingId: row.finding_id, assignedTo: optional(row.assigned_to_employee_id), assignedTeam: optional(row.assigned_team), correctiveAction: row.corrective_action, targetCompletionDate: optional(row.target_completion_date), remarks: optional(row.remarks), status: row.status, createdAt: row.created_at, updatedAt: row.updated_at };
}

function mapEvidence(row: SupabaseEvidence): EvidenceItem {
  return { id: row.id, findingId: row.finding_id, phase: row.phase ?? undefined, fileName: row.file_name, storagePath: row.storage_path, mimeType: row.mime_type, uploadedBy: row.uploaded_by_employee_id ?? "", createdAt: row.created_at };
}

function mapHistory(row: SupabaseHistory): IssueHistoryEntry {
  return { id: row.id, findingId: row.finding_id, userId: row.user_employee_id ?? "", action: row.action, previousStatus: optional(row.previous_status), newStatus: optional(row.new_status), remarks: optional(row.remarks), createdAt: row.created_at };
}

export async function loadAppState(): Promise<DemoState> {
  if (isDemoMode()) return loadDemoState();

  const withPendingLocalFindings = async (state: DemoState) => {
    const pending = (await getAllOfflineFindings().catch(() => [])).filter((record) => record.syncStatus !== "synced");
    const localFindings: InternalInspectionFinding[] = await Promise.all(pending.map(async (record) => {
      const evidence = await getOfflineEvidenceForFinding(record.id).catch(() => []);
      const severity = record.severity.toUpperCase() as InternalInspectionFinding["severity"];
      return {
        id: record.findingId,
        findingCode: `F-${record.findingId.replace(/[^a-zA-Z0-9]/g, "").slice(-12).toUpperCase()}`,
        source: "INTERNAL_INSPECTION",
        sourceInspectionId: record.inspectionId,
        sourceFindingId: record.findingId,
        checklistItemId: record.checklistItemId,
        checklistItemTitle: record.checklistItemTitle,
        title: record.description.slice(0, 120),
        description: record.description,
        category: record.category,
        severity,
        status: "FINDING",
        locationName: record.area,
        latitude: record.gps?.latitude,
        longitude: record.gps?.longitude,
        capturedAt: record.gps?.capturedAt,
        gps: record.gps,
        evidence: evidence.map((item) => ({ localId: item.id, fileName: item.fileName, fileType: item.fileType, fileSize: item.fileSize })),
        inspectorRemarks: record.remarks,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };
    }));
    const localIds = new Set(localFindings.map((item) => item.id));
    return {
      ...state,
      internalInspectionFindings: [
        ...(state.internalInspectionFindings ?? []).filter((item) => !localIds.has(item.id)),
        ...localFindings,
      ],
    };
  };

  const supabase = createClient();
  const [assets, findings, workOrders, evidence, issueHistory] = await Promise.all([
    supabase.from("assets").select("*").order("id"),
    supabase.from("findings").select("*").order("created_at", { ascending: false }),
    supabase.from("work_orders").select("*").order("created_at", { ascending: false }),
    supabase.from("evidence").select("*").order("created_at", { ascending: false }),
    supabase.from("issue_history").select("*").order("created_at", { ascending: false }),
  ]);

  const result = [assets, findings, workOrders, evidence, issueHistory].find((query) => query.error);
  if (result?.error) {
    const cachedState = await getOfflineAppState<DemoState>().catch(() => undefined);
    if (cachedState) return withPendingLocalFindings(cachedState);
    throw result.error;
  }

  const cloudState: DemoState = {
    assets: (assets.data ?? []).map((row) => mapAsset(row as SupabaseAsset)),
    findings: (findings.data ?? []).map((row) => mapFinding(row as SupabaseFinding)),
    workOrders: (workOrders.data ?? []).map((row) => mapWorkOrder(row as SupabaseWorkOrder)),
    evidence: (evidence.data ?? []).map((row) => mapEvidence(row as SupabaseEvidence)),
    issueHistory: (issueHistory.data ?? []).map((row) => mapHistory(row as SupabaseHistory)),
  };
  await cacheOfflineAppState(cloudState).catch(() => undefined);
  return withPendingLocalFindings(cloudState);
}
