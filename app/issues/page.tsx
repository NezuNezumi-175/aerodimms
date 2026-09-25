import { Suspense } from "react";
import { IssuesPanel } from "@/components/issues-panel";

export default function IssuesPage() {
  return (
    <Suspense fallback={<div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-600">Loading issues…</div>}>
      <IssuesPanel />
    </Suspense>
  );
}
