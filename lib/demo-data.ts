import type { CompletedInspectionRecord, Inspection, InternalInspectionFinding } from "@/lib/inspection-data";

export type Role = "INSPECTOR" | "MAINTENANCE_ENGINEER" | "OPERATIONS_MANAGER";
export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type FindingStatus =
  | "FINDING"
  | "ASSIGNED"
  | "WORK_ORDER"
  | "IN_PROGRESS"
  | "PENDING_VERIFICATION"
  | "CLOSED";
export type SourceType = "INTERNAL_INSPECTION" | "REGULATORY";

export interface Profile {
  id: string;
  employee_id: string;
  full_name: string;
  role: Role;
  airport: string;
  created_at: string;
  updated_at: string;
}

export interface Asset {
  id: string;
  assetCode: string;
  name: string;
  assetType: string;
  status: string;
  locationName: string;
  latitude: number;
  longitude: number;
}

export interface Finding {
  id: string;
  findingCode: string;
  source: SourceType;
  title: string;
  description: string;
  severity: Severity;
  status: FindingStatus;
  locationName: string;
  latitude: number | null;
  longitude: number | null;
  assetId?: string;
  airportStandCode?: string;
  assignedTo?: string;
  assignedTeam?: string;
  targetCompletionDate?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  category?: string;
  inspectorRemarks?: string;
  gpsCapturedAt?: string;
  sourceInspectionId?: string;
  checklistItemId?: string;
}

export interface WorkOrder {
  id: string;
  workOrderCode: string;
  findingId: string;
  assignedTo?: string;
  assignedTeam?: string;
  correctiveAction: string;
  targetCompletionDate?: string;
  remarks?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceItem {
  id: string;
  findingId: string;
  fileName: string;
  storagePath: string;
  previewUrl?: string;
  mimeType: string;
  uploadedBy: string;
  createdAt: string;
}

export interface IssueHistoryEntry {
  id: string;
  findingId: string;
  userId: string;
  action: string;
  previousStatus?: string;
  newStatus?: string;
  remarks?: string;
  createdAt: string;
}

export interface DemoState {
  assets: Asset[];
  findings: Finding[];
  workOrders: WorkOrder[];
  evidence: EvidenceItem[];
  issueHistory: IssueHistoryEntry[];
  completedInspectionRecords?: CompletedInspectionRecord[];
  internalInspectionFindings?: InternalInspectionFinding[];
  adHocInspections?: Inspection[];
}

export const STORAGE_KEY = "aerodimms-demo-state";

export const assets: Asset[] = [
  { id: "asset-1", assetCode: "AGL-001", name: "Runway Edge Light 04-A", assetType: "Aeronautical Ground Light", status: "Operational", locationName: "Runway 04", latitude: 5.298179, longitude: 100.274163 },
  { id: "asset-2", assetCode: "AGL-002", name: "Runway Edge Light 04-B", assetType: "Aeronautical Ground Light", status: "Operational", locationName: "Runway 04", latitude: 5.29879, longitude: 100.273973 },
  { id: "asset-3", assetCode: "AGL-003", name: "Runway Edge Light 22-A", assetType: "Aeronautical Ground Light", status: "Operational", locationName: "Runway 22", latitude: 5.29584, longitude: 100.27628 },
  { id: "asset-4", assetCode: "RUNWAY-LIGHT-001", name: "Runway Centerline Light", assetType: "Runway Lighting", status: "Operational", locationName: "Runway 04", latitude: 5.297827, longitude: 100.275256 },
  { id: "asset-5", assetCode: "RUNWAY-LIGHT-002", name: "Threshold Lighting", assetType: "Runway Lighting", status: "Operational", locationName: "Runway 22", latitude: 5.295213, longitude: 100.275766 },
  { id: "asset-6", assetCode: "TAXIWAY-SIGN-001", name: "Taxiway A Sign", assetType: "Airfield Signage", status: "Operational", locationName: "Taxiway A", latitude: 5.299211, longitude: 100.277181 },
  { id: "asset-7", assetCode: "APRON-LIGHT-001", name: "Apron Flood Light 2", assetType: "Apron Lighting", status: "Degraded", locationName: "Apron South", latitude: 5.300819, longitude: 100.279716 },
  { id: "asset-8", assetCode: "FENCE-001", name: "Perimeter Fence Segment", assetType: "Security Fence", status: "Operational", locationName: "Northern Boundary", latitude: 5.302563, longitude: 100.27257 },
  { id: "asset-9", assetCode: "RUNWAY-SIGN-003", name: "Runway 04 Holding Mark", assetType: "Surface Marking", status: "Operational", locationName: "Holding Bay", latitude: 5.29712, longitude: 100.272838 },
  { id: "asset-10", assetCode: "APRON-SURFACE-010", name: "Apron Surface Panel", assetType: "Surface Asset", status: "Monitoring", locationName: "Apron East", latitude: 5.301357, longitude: 100.28182 },
];

export const findings: Finding[] = [
  { id: "f-101", findingCode: "F-101", source: "INTERNAL_INSPECTION", title: "Parking Bay Guidance Light Defect", description: "Critical guidance light failure at Parking Bay 1L requires immediate replacement.", severity: "CRITICAL", status: "IN_PROGRESS", locationName: "Parking Bay 1L", latitude: 33.60118, longitude: 130.44456, assetId: "asset-1", airportStandCode: "1L", assignedTo: "PEN12345", assignedTeam: "AGL Maintenance", targetCompletionDate: "2026-09-27", createdBy: "PEN23456", createdAt: "2026-09-15T08:42:00Z", updatedAt: "2026-09-25T15:15:00Z" },
  { id: "f-102", findingCode: "F-102", source: "INTERNAL_INSPECTION", title: "Parking Bay Surface Marking Faded", description: "Faded surface marking at Parking Bay 2 needs repainting during the next maintenance window.", severity: "HIGH", status: "ASSIGNED", locationName: "Parking Bay 2", latitude: 33.60058, longitude: 130.44513, assetId: "asset-6", airportStandCode: "2", assignedTo: "PEN12345", assignedTeam: "Pavement Team", targetCompletionDate: "2026-09-29", createdBy: "PEN23456", createdAt: "2026-09-14T09:05:00Z", updatedAt: "2026-09-25T13:50:00Z" },
  { id: "f-103", findingCode: "F-103", source: "INTERNAL_INSPECTION", title: "Taxiway Pavement Pothole", description: "Pavement damage detected on Taxiway A requiring maintenance attention.", severity: "CRITICAL", status: "ASSIGNED", locationName: "Taxiway A", latitude: 33.599367, longitude: 130.443789, assignedTeam: "Pavement Team", createdBy: "PEN23456", createdAt: "2026-09-18T10:15:00Z", updatedAt: "2026-09-25T10:37:00Z" },
  { id: "f-104", findingCode: "F-104", source: "INTERNAL_INSPECTION", title: "Apron Light Failure", description: "Floodlight near apron stand is not delivering full illumination.", severity: "MEDIUM", status: "FINDING", locationName: "Apron South", latitude: 5.30074, longitude: 100.27974, assetId: "asset-7", createdBy: "PEN23456", createdAt: "2026-09-16T14:12:00Z", updatedAt: "2026-09-25T11:00:00Z" },
  { id: "f-105", findingCode: "F-105", source: "INTERNAL_INSPECTION", title: "Runway Sign Damage", description: "Runway signage at holding bay requires replacement.", severity: "MEDIUM", status: "WORK_ORDER", locationName: "Holding Bay", latitude: 5.29712, longitude: 100.27285, assetId: "asset-9", assignedTo: "PEN12345", assignedTeam: "Signage Team", targetCompletionDate: "2026-09-30", createdBy: "PEN23456", createdAt: "2026-09-11T07:18:00Z", updatedAt: "2026-09-25T12:25:00Z" },
  { id: "f-106", findingCode: "F-106", source: "INTERNAL_INSPECTION", title: "Perimeter Fence Crack", description: "Fence segment along northern boundary has a damaged section.", severity: "LOW", status: "ASSIGNED", locationName: "Northern Boundary", latitude: 5.30254, longitude: 100.27262, assetId: "asset-8", assignedTeam: "Security Works", createdBy: "PEN23456", createdAt: "2026-09-12T15:40:00Z", updatedAt: "2026-09-25T08:04:00Z" },
  { id: "f-107", findingCode: "F-107", source: "INTERNAL_INSPECTION", title: "Apron Surface Crack", description: "Minor apron surface defect requires further inspection.", severity: "LOW", status: "CLOSED", locationName: "Apron East", latitude: 5.30132, longitude: 100.28191, assetId: "asset-10", assignedTeam: "Pavement Team", createdBy: "PEN23456", createdAt: "2026-09-08T09:30:00Z", updatedAt: "2026-09-20T17:30:00Z" },
  { id: "f-108", findingCode: "F-108", source: "REGULATORY", title: "Runway 22 Threshold Marking", description: "Threshold paint visibility needs review.", severity: "MEDIUM", status: "IN_PROGRESS", locationName: "Runway 22", latitude: 5.29577, longitude: 100.27595, assignedTo: "PEN12345", assignedTeam: "Marking Team", targetCompletionDate: "2026-09-28", createdBy: "PEN34567", createdAt: "2026-09-20T11:08:00Z", updatedAt: "2026-09-25T09:16:00Z" },
  { id: "f-109", findingCode: "F-109", source: "INTERNAL_INSPECTION", title: "Taxiway Sign Misalignment", description: "Taxiway sign panel is leaning and needs alignment repair.", severity: "HIGH", status: "FINDING", locationName: "Taxiway A", latitude: 5.29916, longitude: 100.27703, assetId: "asset-6", createdBy: "PEN23456", createdAt: "2026-09-19T17:25:00Z", updatedAt: "2026-09-25T07:30:00Z" },
  { id: "f-110", findingCode: "F-110", source: "INTERNAL_INSPECTION", title: "Apron Drainage Check", description: "Water drainage issue near Apron South needs follow-up.", severity: "HIGH", status: "WORK_ORDER", locationName: "Apron South", latitude: 5.30072, longitude: 100.2798, assignedTo: "PEN12345", assignedTeam: "Civil Works", targetCompletionDate: "2026-09-26", createdBy: "PEN23456", createdAt: "2026-09-17T13:12:00Z", updatedAt: "2026-09-25T14:55:00Z" },
];

export const workOrders: WorkOrder[] = [
  { id: "wo-201", workOrderCode: "WO-201", findingId: "f-101", assignedTo: "PEN12345", assignedTeam: "AGL Maintenance", correctiveAction: "Replace damaged runway edge light.", targetCompletionDate: "2026-09-27", remarks: "Use replacement kit 04-A.", status: "In Progress", createdAt: "2026-09-15T09:15:00Z", updatedAt: "2026-09-25T15:15:00Z" },
  { id: "wo-202", workOrderCode: "WO-202", findingId: "f-102", assignedTo: "PEN12345", assignedTeam: "Pavement Team", correctiveAction: "Repair surface spalling at Taxiway A.", targetCompletionDate: "2026-09-29", status: "Assigned", createdAt: "2026-09-14T10:05:00Z", updatedAt: "2026-09-25T13:50:00Z" },
  { id: "wo-203", workOrderCode: "WO-203", findingId: "f-105", assignedTo: "PEN12345", assignedTeam: "Signage Team", correctiveAction: "Replace damaged runway sign and inspect fasteners.", targetCompletionDate: "2026-09-30", status: "In Progress", createdAt: "2026-09-11T08:00:00Z", updatedAt: "2026-09-25T12:25:00Z" },
  { id: "wo-204", workOrderCode: "WO-204", findingId: "f-110", assignedTo: "PEN12345", assignedTeam: "Civil Works", correctiveAction: "Clear blocked drain and inspect apron grading.", targetCompletionDate: "2026-09-26", status: "In Progress", createdAt: "2026-09-17T14:00:00Z", updatedAt: "2026-09-25T14:55:00Z" },
  { id: "wo-205", workOrderCode: "WO-205", findingId: "f-108", assignedTo: "PEN12345", assignedTeam: "Marking Team", correctiveAction: "Evaluate and reapply threshold markings.", targetCompletionDate: "2026-09-28", status: "In Progress", createdAt: "2026-09-20T12:00:00Z", updatedAt: "2026-09-25T09:16:00Z" },
];

export const evidence: EvidenceItem[] = [
  { id: "ev-1", findingId: "f-101", fileName: "before-repair.jpg", storagePath: "evidence/f-101/before-repair.jpg", mimeType: "image/jpeg", uploadedBy: "PEN23456", createdAt: "2026-09-15T09:40:00Z" },
  { id: "ev-2", findingId: "f-101", fileName: "after-repair.jpg", storagePath: "evidence/f-101/after-repair.jpg", mimeType: "image/jpeg", uploadedBy: "PEN12345", createdAt: "2026-09-25T15:10:00Z" },
  { id: "ev-3", findingId: "f-103", fileName: "wildlife-record.pdf", storagePath: "evidence/f-103/wildlife-record.pdf", mimeType: "application/pdf", uploadedBy: "PEN34567", createdAt: "2026-09-18T10:45:00Z" },
  { id: "ev-4", findingId: "f-110", fileName: "drainage-check.jpg", storagePath: "evidence/f-110/drainage-check.jpg", mimeType: "image/jpeg", uploadedBy: "PEN12345", createdAt: "2026-09-17T14:25:00Z" },
  { id: "ev-5", findingId: "f-105", fileName: "signage-before.jpg", storagePath: "evidence/f-105/signage-before.jpg", mimeType: "image/jpeg", uploadedBy: "PEN23456", createdAt: "2026-09-11T08:30:00Z" },
];

export const issueHistory: IssueHistoryEntry[] = [
  { id: "h-1", findingId: "f-101", userId: "PEN23456", action: "Finding created", previousStatus: "", newStatus: "FINDING", createdAt: "2026-09-15T08:42:00Z" },
  { id: "h-2", findingId: "f-101", userId: "PEN23456", action: "Finding assigned to AGL Team", previousStatus: "FINDING", newStatus: "ASSIGNED", createdAt: "2026-09-15T09:25:00Z" },
  { id: "h-3", findingId: "f-101", userId: "PEN12345", action: "Work Order WO-201 created", previousStatus: "ASSIGNED", newStatus: "WORK_ORDER", createdAt: "2026-09-15T09:42:00Z" },
  { id: "h-4", findingId: "f-101", userId: "PEN12345", action: "Corrective action started", previousStatus: "WORK_ORDER", newStatus: "IN_PROGRESS", createdAt: "2026-09-16T10:30:00Z" },
  { id: "h-5", findingId: "f-101", userId: "PEN12345", action: "Evidence uploaded", previousStatus: "IN_PROGRESS", newStatus: "IN_PROGRESS", remarks: "after-repair.jpg", createdAt: "2026-09-25T15:10:00Z" },
  { id: "h-6", findingId: "f-101", userId: "PEN34567", action: "Submitted for verification", previousStatus: "IN_PROGRESS", newStatus: "PENDING_VERIFICATION", createdAt: "2026-09-25T15:35:00Z" },
  { id: "h-7", findingId: "f-103", userId: "PEN34567", action: "Finding created", previousStatus: "", newStatus: "FINDING", createdAt: "2026-09-18T10:15:00Z" },
  { id: "h-8", findingId: "f-103", userId: "PEN34567", action: "Submitted for verification", previousStatus: "IN_PROGRESS", newStatus: "PENDING_VERIFICATION", createdAt: "2026-09-25T10:37:00Z" },
  { id: "h-9", findingId: "f-107", userId: "PEN12345", action: "Finding closed", previousStatus: "PENDING_VERIFICATION", newStatus: "CLOSED", createdAt: "2026-09-20T17:30:00Z" },
];

export const defaultState: DemoState = {
  assets,
  findings,
  workOrders,
  evidence,
  issueHistory,
  completedInspectionRecords: [],
  internalInspectionFindings: [],
  adHocInspections: [],
};

export const openFindingStatuses = new Set<FindingStatus>([
  "FINDING",
  "ASSIGNED",
  "WORK_ORDER",
  "IN_PROGRESS",
  "PENDING_VERIFICATION",
]);

export const severityOrder: Record<Severity, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export const severityColors: Record<Severity, string> = {
  CRITICAL: "#ef4444",
  HIGH: "#f97316",
  MEDIUM: "#facc15",
  LOW: "#60a5fa",
};

export function loadDemoState(): DemoState {
  if (typeof window === "undefined") {
    return defaultState;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState));
    return defaultState;
  }

  try {
    const storedState = JSON.parse(raw) as DemoState;
    const employeeIdFor = (value?: string) => {
      if (value === "u-1") return "PEN12345";
      if (value === "u-2") return "PEN23456";
      if (value === "u-3") return "PEN34567";
      return value;
    };

    return {
      ...storedState,
      completedInspectionRecords: storedState.completedInspectionRecords ?? [],
      internalInspectionFindings: storedState.internalInspectionFindings ?? [],
      adHocInspections: storedState.adHocInspections ?? [],
      findings: storedState.findings.map((finding) => {
        const demoFinding = defaultState.findings.find(
          (item) => item.id === finding.id && (item.airportStandCode || item.id === "f-103"),
        );

        return {
          ...finding,
          ...(demoFinding
            ? {
                title: demoFinding.title,
                description: demoFinding.description,
                locationName: demoFinding.locationName,
                severity: demoFinding.severity,
                status: demoFinding.status,
                assignedTeam: demoFinding.assignedTeam,
                airportStandCode: demoFinding.airportStandCode,
                latitude: demoFinding.latitude,
                longitude: demoFinding.longitude,
              }
            : {}),
          assignedTo: employeeIdFor(finding.assignedTo),
          createdBy: employeeIdFor(finding.createdBy),
        };
      }),
      workOrders: storedState.workOrders.map((workOrder) => ({
        ...workOrder,
        assignedTo: employeeIdFor(workOrder.assignedTo),
      })),
      evidence: storedState.evidence.map((item) => ({
        ...item,
        uploadedBy: employeeIdFor(item.uploadedBy) ?? "",
      })),
      issueHistory: storedState.issueHistory.map((entry) => ({
        ...entry,
        userId: employeeIdFor(entry.userId) ?? "",
      })),
    };
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState));
    return defaultState;
  }
}

export function saveDemoState(state: DemoState) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

export function getStoredUser(): Profile | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem("aerodimms-user");
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Profile;
  } catch {
    return null;
  }
}

export function setStoredUser(user: Profile | null) {
  if (typeof window === "undefined") return;

  if (!user) {
    window.localStorage.removeItem("aerodimms-user");
    return;
  }

  window.localStorage.setItem("aerodimms-user", JSON.stringify(user));
}
