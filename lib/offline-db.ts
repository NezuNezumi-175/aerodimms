import type { GpsLocation, Inspection } from "@/lib/inspection-data";

export type SyncStatus = "pending" | "syncing" | "synced" | "failed";
export type OfflineFindingKind = "manual" | "checklist";

export type OfflineFindingRecord = {
  id: string;
  findingId: string;
  internalId?: string;
  findingCode?: string;
  kind: OfflineFindingKind;
  inspectionId?: string;
  checklistItemId?: string;
  checklistItemTitle?: string;
  description: string;
  category: string;
  severity: string;
  area: string;
  remarks: string;
  gps: GpsLocation | null;
  evidenceIds: string[];
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
  // Optional sync receipt; old IndexedDB records remain readable without migration.
  serverId?: string;
  serverUpdatedAt?: string;
};

export type OfflineEvidenceRecord = {
  id: string;
  findingRecordId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  blob: Blob;
  createdAt: string;
  syncStatus: SyncStatus;
};

export type OfflineEvidenceInput = Omit<OfflineEvidenceRecord, "createdAt" | "syncStatus">;

export type OfflineChecklistAnswer = {
  result?: "Pass" | "Fail" | "N/A";
  remark: string;
};

export type OfflineInspectionProgress = {
  inspectionId: string;
  inspection?: Inspection;
  answers: Record<string, OfflineChecklistAnswer>;
  findingRecordIds: string[];
  completionState: "IN_PROGRESS" | "COMPLETED";
  updatedAt: string;
  syncStatus: SyncStatus;
};

export type OfflineFindingWithEvidence = {
  record: OfflineFindingRecord;
  evidence: OfflineEvidenceRecord[];
};

const DATABASE_NAME = "aerodimms-offline";
const DATABASE_VERSION = 1;
const FINDINGS_STORE = "findings";
const PROGRESS_STORE = "inspectionProgress";
const EVIDENCE_STORE = "evidence";

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in this browser."));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(FINDINGS_STORE)) {
        const findings = database.createObjectStore(FINDINGS_STORE, { keyPath: "id" });
        findings.createIndex("inspectionId", "inspectionId", { unique: false });
      }
      if (!database.objectStoreNames.contains(PROGRESS_STORE)) {
        database.createObjectStore(PROGRESS_STORE, { keyPath: "inspectionId" });
      }
      if (!database.objectStoreNames.contains(EVIDENCE_STORE)) {
        const evidence = database.createObjectStore(EVIDENCE_STORE, { keyPath: "id" });
        evidence.createIndex("findingRecordId", "findingRecordId", { unique: false });
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("Unable to open local offline storage."));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error("Local offline storage is blocked by another open tab."));
    };
  });

  return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to read local offline storage."));
  });
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Local offline storage transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Local offline storage transaction was aborted."));
  });
}

export async function saveOfflineFinding(
  record: Omit<OfflineFindingRecord, "syncStatus" | "evidenceIds" | "updatedAt">,
  evidenceFiles: OfflineEvidenceInput[],
) {
  const database = await openDatabase();
  const transaction = database.transaction([FINDINGS_STORE, EVIDENCE_STORE], "readwrite");
  const done = transactionComplete(transaction);
  const findingsStore = transaction.objectStore(FINDINGS_STORE);
  const evidenceStore = transaction.objectStore(EVIDENCE_STORE);
  const evidenceIds = evidenceFiles.map((item) => item.id);
  const storedRecord: OfflineFindingRecord = {
    ...record,
    evidenceIds,
    updatedAt: new Date().toISOString(),
    syncStatus: "pending",
  };

  try {
    const previousRecord = findingsStore.get(record.id);
    previousRecord.onsuccess = () => {
      const previous: OfflineFindingRecord | undefined = previousRecord.result;
      storedRecord.serverId = record.serverId ?? previous?.serverId;
      storedRecord.serverUpdatedAt = record.serverUpdatedAt ?? previous?.serverUpdatedAt;
      findingsStore.put(storedRecord);
    };
    const existingEvidence = evidenceStore.index("findingRecordId").getAllKeys(record.id);
    existingEvidence.onsuccess = () => {
      existingEvidence.result.forEach((key) => evidenceStore.delete(key));
      evidenceFiles.forEach((item) => evidenceStore.put({
        ...item,
        createdAt: storedRecord.updatedAt,
        syncStatus: "pending",
      } satisfies OfflineEvidenceRecord));
    };
    await done;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // The transaction may already have completed or aborted.
    }
    throw error;
  }

  return storedRecord;
}

export async function saveOfflineInspectionProgress(
  progress: Omit<OfflineInspectionProgress, "updatedAt" | "syncStatus">,
) {
  const database = await openDatabase();
  const transaction = database.transaction(PROGRESS_STORE, "readwrite");
  const done = transactionComplete(transaction);
  const storedProgress: OfflineInspectionProgress = {
    ...progress,
    updatedAt: new Date().toISOString(),
    syncStatus: "pending",
  };

  try {
    const store = transaction.objectStore(PROGRESS_STORE);
    const previous = store.get(progress.inspectionId);
    previous.onsuccess = () => {
      storedProgress.inspection = progress.inspection ?? previous.result?.inspection;
      store.put(storedProgress);
    };
    await done;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // The transaction may already have completed or aborted.
    }
    throw error;
  }

  return storedProgress;
}

export async function getOfflineInspectionProgress(inspectionId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(PROGRESS_STORE, "readonly");
  const done = transactionComplete(transaction);
  const request = transaction.objectStore(PROGRESS_STORE).get(inspectionId);
  const [record] = await Promise.all([
    requestResult<OfflineInspectionProgress | undefined>(request),
    done,
  ]);
  return record;
}

export async function getOfflineEvidenceForFinding(findingRecordId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(EVIDENCE_STORE, "readonly");
  const done = transactionComplete(transaction);
  const request = transaction.objectStore(EVIDENCE_STORE).index("findingRecordId").getAll(findingRecordId);
  const [evidence] = await Promise.all([
    requestResult<OfflineEvidenceRecord[]>(request),
    done,
  ]);
  return evidence;
}

export async function getOfflineInspectionFindings(inspectionId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(FINDINGS_STORE, "readonly");
  const done = transactionComplete(transaction);
  const request = transaction.objectStore(FINDINGS_STORE).index("inspectionId").getAll(inspectionId);
  const [records] = await Promise.all([
    requestResult<OfflineFindingRecord[]>(request),
    done,
  ]);
  const checklistRecords = records.filter((record) => record.kind === "checklist");

  return Promise.all(checklistRecords.map(async (record) => {
    const evidence = await getOfflineEvidenceForFinding(record.id);
    return { record, evidence } satisfies OfflineFindingWithEvidence;
  }));
}

// Metadata lives in the existing store; no database upgrade or record reset.
export async function cacheOfflineInspections(inspections: Inspection[]) {
  const database = await openDatabase();
  const transaction = database.transaction(PROGRESS_STORE, "readwrite");
  const done = transactionComplete(transaction);
  const store = transaction.objectStore(PROGRESS_STORE);
  for (const inspection of inspections) {
    const request = store.get(inspection.id);
    request.onsuccess = () => store.put({
      ...(request.result ?? {
        inspectionId: inspection.id, answers: {}, findingRecordIds: [],
        completionState: "IN_PROGRESS", updatedAt: new Date().toISOString(), syncStatus: "synced",
      }),
      inspection,
    });
  }
  await done;
}

export async function getCachedOfflineInspections(): Promise<Inspection[]> {
  const database = await openDatabase();
  const transaction = database.transaction(PROGRESS_STORE, "readonly");
  const done = transactionComplete(transaction);
  const [records] = await Promise.all([
    requestResult<OfflineInspectionProgress[]>(transaction.objectStore(PROGRESS_STORE).getAll()), done,
  ]);
  return records.flatMap((record) => record.inspection ? [{
    ...record.inspection,
    status: record.syncStatus !== "synced"
      ? record.completionState === "COMPLETED" ? "Completed" : "In Progress"
      : record.inspection.status,
  }] : []);
}

export async function getOfflineSyncQueue() {
  const database = await openDatabase();
  const transaction = database.transaction([FINDINGS_STORE, PROGRESS_STORE, EVIDENCE_STORE], "readonly");
  const done = transactionComplete(transaction);
  const [findings, progress, evidence] = await Promise.all([
    requestResult<OfflineFindingRecord[]>(transaction.objectStore(FINDINGS_STORE).getAll()),
    requestResult<OfflineInspectionProgress[]>(transaction.objectStore(PROGRESS_STORE).getAll()),
    requestResult<OfflineEvidenceRecord[]>(transaction.objectStore(EVIDENCE_STORE).getAll()),
    done,
  ]);
  return {
    findings: findings.filter((record) => record.syncStatus !== "synced" || evidence.some((item) => item.findingRecordId === record.id && item.syncStatus !== "synced"))
      .map((record) => ({ record, evidence: evidence.filter((item) => item.findingRecordId === record.id) })),
    progress: progress.filter((record) => record.syncStatus !== "synced"),
  };
}

// Compare the uploaded revision before marking it; edits made during an upload stay pending.
async function markRevisionSynced(storeName: string, key: string, revision: string, revisionField: "updatedAt" | "createdAt", snapshot: OfflineFindingRecord | OfflineEvidenceRecord | OfflineInspectionProgress) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  const done = transactionComplete(transaction);
  const store = transaction.objectStore(storeName);
  const request = store.get(key);
  request.onsuccess = () => {
    const current = request.result;
    const unchanged = current && Object.entries(snapshot).every(([field, value]) =>
      field === "syncStatus" || field === "blob" || JSON.stringify(current[field]) === JSON.stringify(value));
    if (unchanged && current[revisionField] === revision) store.put({ ...current, syncStatus: "synced" });
  };
  await done;
}

export function markOfflineFindingSynced(record: OfflineFindingRecord) {
  return markRevisionSynced(FINDINGS_STORE, record.id, record.updatedAt, "updatedAt", record);
}

export async function acknowledgeOfflineFindingSync(record: OfflineFindingRecord, serverId: string, serverUpdatedAt: string, findingCode?: string) {
  const database = await openDatabase();
  const transaction = database.transaction([FINDINGS_STORE, EVIDENCE_STORE], "readwrite");
  const done = transactionComplete(transaction);
  const findings = transaction.objectStore(FINDINGS_STORE);
  const evidence = transaction.objectStore(EVIDENCE_STORE);
  const request = findings.get(record.id);
  request.onsuccess = () => {
    const current: OfflineFindingRecord | undefined = request.result;
    if (!current || current.inspectionId !== record.inspectionId || current.checklistItemId !== record.checklistItemId) return;
    const unchanged = Object.entries(record).every(([field, value]) =>
      field === "syncStatus" || field === "serverId" || field === "serverUpdatedAt" || field === "findingCode"
      || JSON.stringify(current[field as keyof OfflineFindingRecord]) === JSON.stringify(value));
    findings.put({ ...current, serverId, serverUpdatedAt, findingCode: findingCode ?? current.findingCode, syncStatus: unchanged ? "synced" : "pending" });
    if (!unchanged) return;
    for (const id of record.evidenceIds) {
      const photo = evidence.get(id);
      photo.onsuccess = () => {
        const item: OfflineEvidenceRecord | undefined = photo.result;
        if (item && item.createdAt === record.updatedAt) evidence.put({ ...item, syncStatus: "synced" });
      };
    }
  };
  await done;
}

export function markOfflineEvidenceSynced(record: OfflineEvidenceRecord) {
  return markRevisionSynced(EVIDENCE_STORE, record.id, record.createdAt, "createdAt", record);
}

export function markOfflineProgressSynced(record: OfflineInspectionProgress) {
  return markRevisionSynced(PROGRESS_STORE, record.inspectionId, record.updatedAt, "updatedAt", record);
}
