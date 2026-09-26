"use client";

import { useEffect, useState } from "react";

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    let active = true;
    let checking = false;
    const checkConnection = async () => {
      if (!navigator.onLine) {
        setIsOnline(false);
        return;
      }
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseKey) {
        if (active) setIsOnline(navigator.onLine);
        return;
      }
      if (checking) {
        return;
      }
      checking = true;
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 4000);
      try {
        const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/health`, {
          method: "GET",
          headers: { apikey: supabaseKey },
          cache: "no-store",
          signal: controller.signal,
        });
        if (active) setIsOnline(response.ok);
      } catch {
        if (active) setIsOnline(false);
      } finally {
        window.clearTimeout(timeout);
        checking = false;
      }
    };
    const updateOnlineStatus = () => { void checkConnection(); };
    const handleOffline = () => setIsOnline(false);

    void checkConnection();
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", updateOnlineStatus);
    const interval = window.setInterval(updateOnlineStatus, 5000);

    return () => {
      active = false;
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", updateOnlineStatus);
      window.clearInterval(interval);
    };
  }, []);

  return isOnline;
}
