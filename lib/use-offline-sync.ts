"use client";

import { useEffect, useState } from "react";
import { synchronizeOfflineData } from "@/lib/offline-sync";

export function useOfflineSync(isOnline: boolean, userId: string | undefined, enabled: boolean) {
  const [state, setState] = useState<{ syncing: boolean; error: string }>({ syncing: false, error: "" });
  useEffect(() => {
    if (!enabled || !isOnline || !userId) return;
    let active = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const sync = async () => {
      if (!active || !navigator.onLine) return;
      setState({ syncing: true, error: "" });
      const result = await synchronizeOfflineData();
      if (!active) return;
      setState({ syncing: result.pending && !result.errors.length, error: result.errors.join("; ") });
      if (result.pending) retry = setTimeout(() => { void sync(); }, result.errors.length ? 15000 : 1000);
    };
    queueMicrotask(() => { void sync(); });
    return () => {
      active = false;
      if (retry) clearTimeout(retry);
    };
  }, [enabled, isOnline, userId]);
  return state;
}
