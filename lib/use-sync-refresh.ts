"use client";

import { useEffect, useState } from "react";

export const OFFLINE_SYNC_COMPLETED = "aerodimms:sync-completed";

export function useSyncRefresh() {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener(OFFLINE_SYNC_COMPLETED, refresh);
    return () => window.removeEventListener(OFFLINE_SYNC_COMPLETED, refresh);
  }, []);
  return revision;
}
