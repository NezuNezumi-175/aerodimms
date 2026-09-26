import type { GpsLocation, Inspection } from "@/lib/inspection-data";

export type SyncStatus = "pending" | "syncing" | "synced" | "failed";
export type OfflineFindingKind = "manual" | "checklist";

export type OfflineFindingRecord = {
  id: string;
  findingId: string;
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
// Keep this at least as high as the schema previously used by this app.
// IndexedDB rejects an open request that asks for a version below the one
// already stored by the browser, even when this code only needs older stores.
const DATABASE_VERSION = 3;
const FINDINGS_STORE = "findings";
const PROGRESS_STORE = "inspectionProgress";
const EVIDENCE_STORE = "evidence";
const INSPECTIONS_STORE = "inspections";
const APP_STATE_STORE = "appState";

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
      if (!database.objectStoreNames.contains(INSPECTIONS_STORE)) {
        database.createObjectStore(INSPECTIONS_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(APP_STATE_STORE)) {
        database.createObjectStore(APP_STATE_STORE, { keyPath: "key" });
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
    findingsStore.put(storedRecord);
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
    transaction.objectStore(PROGRESS_STORE).put(storedProgress);
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

export async function getAllOfflineFindings() {
  const database = await openDatabase();
  const transaction = database.transaction(FINDINGS_STORE, "readonly");
  const done = transactionComplete(transaction);
  const request = transaction.objectStore(FINDINGS_STORE).getAll();
  const [records] = await Promise.all([requestResult<OfflineFindingRecord[]>(request), done]);
  return records;
}

export async function updateOfflineFindingSyncStatus(id: string, syncStatus: SyncStatus) {
  const database = await openDatabase();
  const transaction = database.transaction(FINDINGS_STORE, "readwrite");
  const done = transactionComplete(transaction);
  const store = transaction.objectStore(FINDINGS_STORE);
  const request = store.get(id);
  request.onsuccess = () => {
    if (request.result) store.put({ ...request.result, syncStatus, updatedAt: new Date().toISOString() });
  };
  await done;
}

export async function getAllOfflineInspectionProgress() {
  const database = await openDatabase();
  const transaction = database.transaction(PROGRESS_STORE, "readonly");
  const done = transactionComplete(transaction);
  const request = transaction.objectStore(PROGRESS_STORE).getAll();
  const [records] = await Promise.all([requestResult<OfflineInspectionProgress[]>(request), done]);
  return records;
}

export async function updateOfflineInspectionSyncStatus(inspectionId: string, syncStatus: SyncStatus) {
  const database = await openDatabase();
  const transaction = database.transaction(PROGRESS_STORE, "readwrite");
  const done = transactionComplete(transaction);
  const store = transaction.objectStore(PROGRESS_STORE);
  const request = store.get(inspectionId);
  request.onsuccess = () => {
    if (request.result) store.put({ ...request.result, syncStatus, updatedAt: new Date().toISOString() });
  };
  await done;
}

export async function cacheOfflineInspections(inspections: Inspection[]) {
  const database = await openDatabase();
  const transaction = database.transaction(INSPECTIONS_STORE, "readwrite");
  const done = transactionComplete(transaction);
  const store = transaction.objectStore(INSPECTIONS_STORE);
  inspections.forEach((inspection) => store.put(inspection));
  await done;
}

export async function getOfflineInspections() {
  const database = await openDatabase();
  const transaction = database.transaction(INSPECTIONS_STORE, "readonly");
  const done = transactionComplete(transaction);
  const request = transaction.objectStore(INSPECTIONS_STORE).getAll();
  const [records] = await Promise.all([requestResult<Inspection[]>(request), done]);
  return records;
}

export async function cacheOfflineAppState(state: unknown) {
  const database = await openDatabase();
  const transaction = database.transaction(APP_STATE_STORE, "readwrite");
  const done = transactionComplete(transaction);
  transaction.objectStore(APP_STATE_STORE).put({ key: "cloud", state, updatedAt: new Date().toISOString() });
  await done;
}

export async function getOfflineAppState<T>() {
  const database = await openDatabase();
  const transaction = database.transaction(APP_STATE_STORE, "readonly");
  const done = transactionComplete(transaction);
  const request = transaction.objectStore(APP_STATE_STORE).get("cloud");
  const [record] = await Promise.all([requestResult<{ state: T } | undefined>(request), done]);
  return record?.state;
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
