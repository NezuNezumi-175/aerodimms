"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/app-data";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(isDemoMode() || getStoredUser() ? "/dashboard" : "/login");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center  bg-slate-100 text-slate-700">
      Redirecting to AeroDIMMS…
    </div>
  );
}
