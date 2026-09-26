export type InspectionStatus = "Scheduled" | "In Progress" | "Completed";

export type InspectionType =
  | "Runway Surface Inspection"
  | "Airfield Lighting Inspection"
  | "Pavement Condition Inspection"
  | "Taxiway Safety Inspection"
  | "Apron Operations Inspection";

export type Inspection = {
  id: string;
  inspector: string;
  type: InspectionType;
  area: string;
  date: string;
  status: InspectionStatus;
};

export type ChecklistItem = {
  id: string;
  label: string;
  guidance: string;
};

export type ChecklistResult = "Pass" | "Fail" | "N/A";

export type InspectionEvidenceSnapshot = {
  localId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  previewUrl?: string;
};

export type CompletedChecklistAnswer = {
  checklistItemId: string;
  checklistItemTitle: string;
  result: ChecklistResult;
  remark: string;
};

export type CompletedInspectionFinding = {
  id: string;
  inspectionId: string;
  checklistItemId: string;
  checklistItemTitle: string;
  description: string;
  category: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  area: string;
  remarks: string;
  createdAt: string;
  gps: { latitude: number; longitude: number; capturedAt: string } | null;
  evidence: InspectionEvidenceSnapshot[];
};

export type CompletedInspectionRecord = {
  inspection: Inspection & { status: "Completed" };
  completedAt: string;
  checklist: CompletedChecklistAnswer[];
  findings: CompletedInspectionFinding[];
};

export type InternalInspectionFinding = {
  id: string;
  findingCode: string;
  source: "INTERNAL_INSPECTION";
  sourceInspectionId: string;
  sourceFindingId: string;
  checklistItemId: string;
  checklistItemTitle: string;
  title: string;
  description: string;
  category: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  status: "FINDING";
  locationName: string;
  latitude?: number;
  longitude?: number;
  capturedAt?: string;
  gps: { latitude: number; longitude: number; capturedAt: string } | null;
  evidence: InspectionEvidenceSnapshot[];
  inspectorRemarks: string;
  assignedTo?: string;
  assignedTeam?: string;
  targetCompletionDate?: string;
  createdAt: string;
  updatedAt: string;
};

export const scheduledInspections: Inspection[] = [
  {
    id: "INSP-2026-09-27-01",
    inspector: "Aiko Tanaka",
    type: "Runway Surface Inspection",
    area: "Runway 04/22",
    date: "27 Sep 2026",
    status: "Scheduled",
  },
  {
    id: "INSP-2026-09-28-02",
    inspector: "Kenji Sato",
    type: "Airfield Lighting Inspection",
    area: "Taxiway A",
    date: "28 Sep 2026",
    status: "Scheduled",
  },
];

export const inProgressInspections: Inspection[] = [
  {
    id: "INSP-2026-09-26-01",
    inspector: "Yuki Nakamura",
    type: "Pavement Condition Inspection",
    area: "Runway 04/22",
    date: "26 Sep 2026",
    status: "In Progress",
  },
  {
    id: "INSP-2026-09-26-02",
    inspector: "Hiroshi Mori",
    type: "Taxiway Safety Inspection",
    area: "Taxiway A",
    date: "26 Sep 2026",
    status: "In Progress",
  },
  {
    id: "INSP-2026-09-25-03",
    inspector: "Aiko Tanaka",
    type: "Apron Operations Inspection",
    area: "Apron North",
    date: "25 Sep 2026",
    status: "In Progress",
  },
];

export const completedInspections: Inspection[] = [
  {
    id: "INSP-2026-09-15-01",
    inspector: "Kenji Sato",
    type: "Runway Surface Inspection",
    area: "Runway 04/22",
    date: "15 Sep 2026",
    status: "Completed",
  },
  {
    id: "INSP-2026-09-15-02",
    inspector: "Yuki Nakamura",
    type: "Airfield Lighting Inspection",
    area: "Taxiway A",
    date: "15 Sep 2026",
    status: "Completed",
  },
  {
    id: "INSP-2026-09-14-03",
    inspector: "Hiroshi Mori",
    type: "Apron Operations Inspection",
    area: "Apron North",
    date: "14 Sep 2026",
    status: "Completed",
  },
];

export const allInspections = [
  ...scheduledInspections,
  ...inProgressInspections,
  ...completedInspections,
];

export const checklistByInspectionType: Record<InspectionType, ChecklistItem[]> = {
  "Runway Surface Inspection": [
    { id: "surface", label: "Runway surface condition", guidance: "Check the pavement for loose material, deformation, or surface deterioration." },
    { id: "fod", label: "Foreign Object Debris (FOD)", guidance: "Check the runway and shoulders for debris that could damage an aircraft." },
    { id: "cracks", label: "Pavement cracks or damage", guidance: "Look for cracks, spalling, settlement, or other visible pavement damage." },
    { id: "markings", label: "Runway markings visibility", guidance: "Confirm markings are visible, legible, and not significantly worn." },
    { id: "drainage", label: "Drainage and standing water", guidance: "Check for blocked drainage and standing water on the runway surface." },
    { id: "edge", label: "Runway edge condition", guidance: "Inspect runway edges and shoulders for deterioration or loose material." },
  ],
  "Pavement Condition Inspection": [
    { id: "surface", label: "Runway surface condition", guidance: "Check the pavement for loose material, deformation, or surface deterioration." },
    { id: "fod", label: "Foreign Object Debris (FOD)", guidance: "Check the runway and shoulders for debris that could damage an aircraft." },
    { id: "cracks", label: "Pavement cracks or damage", guidance: "Look for cracks, spalling, settlement, or other visible pavement damage." },
    { id: "markings", label: "Runway markings visibility", guidance: "Confirm markings are visible, legible, and not significantly worn." },
    { id: "drainage", label: "Drainage and standing water", guidance: "Check for blocked drainage and standing water on the runway surface." },
    { id: "edge", label: "Runway edge condition", guidance: "Inspect runway edges and shoulders for deterioration or loose material." },
  ],
  "Airfield Lighting Inspection": [
    { id: "lights", label: "Taxiway and runway lights", guidance: "Check that required lights are present, clean, and visibly operational." },
    { id: "lenses", label: "Light lenses and housings", guidance: "Look for cracked lenses, damaged housings, or water ingress." },
    { id: "signs", label: "Illuminated airfield signs", guidance: "Confirm signs are legible, illuminated, and correctly positioned." },
    { id: "obstructions", label: "Light fixture obstructions", guidance: "Check for debris, vegetation, or equipment obscuring light output." },
    { id: "surface", label: "Fixture and pavement condition", guidance: "Check fixture seating and adjacent pavement for damage or movement." },
  ],
  "Taxiway Safety Inspection": [
    { id: "surface", label: "Taxiway surface condition", guidance: "Check the taxiway pavement for damage, loose material, or settlement." },
    { id: "fod", label: "Foreign Object Debris (FOD)", guidance: "Inspect the taxiway and shoulders for debris or loose objects." },
    { id: "markings", label: "Taxiway markings and signs", guidance: "Confirm centerline markings and taxiway signs are visible and legible." },
    { id: "lights", label: "Taxiway lighting", guidance: "Check taxiway centerline and edge lights for damage or obstruction." },
    { id: "clearance", label: "Clearance and obstructions", guidance: "Check the taxiway strip for equipment or objects affecting clearance." },
    { id: "drainage", label: "Drainage and surface water", guidance: "Look for blocked drains, ponding, or water affecting the taxiway." },
  ],
  "Apron Operations Inspection": [
    { id: "surface", label: "Apron pavement condition", guidance: "Check stand and apron pavement for cracks, settlement, or loose material." },
    { id: "fod", label: "Foreign Object Debris (FOD)", guidance: "Inspect stands and aircraft movement areas for loose objects or debris." },
    { id: "markings", label: "Stand and lead-in markings", guidance: "Confirm stand markings and guidance lines are clear and visible." },
    { id: "equipment", label: "Ground equipment clearances", guidance: "Check that equipment is in designated areas and clear of movement paths." },
    { id: "spill", label: "Spill and drainage condition", guidance: "Look for fluid spills, blocked drains, or standing water on the apron." },
    { id: "safety-zone", label: "Apron safety zones", guidance: "Check safety zones and access routes for obstructions." },
  ],
};