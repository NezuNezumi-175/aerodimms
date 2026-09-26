import Image from "next/image";
import Link from "next/link";
import type { CompletedInspectionRecord } from "@/lib/inspection-data";

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function CompletedInspectionView({
  record,
  transferredCount,
}: {
  record: CompletedInspectionRecord;
  transferredCount: number;
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 sm:p-6">
        <p className="text-lg font-bold text-emerald-900">Inspection completed successfully.</p>
        {transferredCount > 0 ? (
          <p className="mt-1 text-sm text-emerald-800">
            {transferredCount} {transferredCount === 1 ? "finding was" : "findings were"} added to Issues &amp; Actions.
          </p>
        ) : null}
        <p className="mt-2 text-xs text-emerald-800">Completed {new Date(record.completedAt).toLocaleString()}</p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">{record.inspection.id}</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">{record.inspection.type}</h1>
          </div>
          <span className="w-fit rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">Completed</span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div><dt className="text-xs text-slate-500">Inspector</dt><dd className="mt-1 text-sm font-semibold text-slate-800">{record.inspection.inspector}</dd></div>
          <div><dt className="text-xs text-slate-500">Area</dt><dd className="mt-1 text-sm font-semibold text-slate-800">{record.inspection.area}</dd></div>
          <div><dt className="text-xs text-slate-500">Inspection Date</dt><dd className="mt-1 text-sm font-semibold text-slate-800">{record.inspection.date}</dd></div>
          <div><dt className="text-xs text-slate-500">Completed At</dt><dd className="mt-1 text-sm font-semibold text-slate-800">{new Date(record.completedAt).toLocaleString()}</dd></div>
        </dl>
      </section>

      <section aria-labelledby="completed-checklist-heading">
        <h2 id="completed-checklist-heading" className="mb-3 text-xl font-semibold text-slate-900">Checklist Results</h2>
        <div className="space-y-3">
          {record.checklist.map((item) => (
            <article key={item.checklistItemId} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs text-slate-500">{item.checklistItemId}</p>
                  <h3 className="mt-1 font-semibold text-slate-900">{item.checklistItemTitle}</h3>
                </div>
                <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${
                  item.result === "Pass" ? "bg-emerald-100 text-emerald-800" : item.result === "Fail" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"
                }`}>{item.result}</span>
              </div>
              {item.remark ? <p className="mt-3 text-sm text-slate-600">Inspector remark: {item.remark}</p> : null}
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="completed-findings-heading">
        <h2 id="completed-findings-heading" className="mb-3 text-xl font-semibold text-slate-900">Findings ({record.findings.length})</h2>
        {record.findings.length ? (
          <div className="space-y-3">
            {record.findings.map((finding) => (
              <article key={finding.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{finding.findingCode ?? finding.id} · {finding.checklistItemId}</p>
                    <h3 className="mt-1 font-semibold text-slate-900">{finding.checklistItemTitle}</h3>
                    <p className="mt-2 text-sm text-slate-700">{finding.description}</p>
                  </div>
                  <span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{finding.severity}</span>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-slate-500">Category</dt><dd className="mt-1 text-slate-800">{finding.category}</dd></div>
                  <div><dt className="text-xs text-slate-500">Area</dt><dd className="mt-1 text-slate-800">{finding.area}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Remarks</dt><dd className="mt-1 text-slate-800">{finding.remarks || "None"}</dd></div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-slate-500">GPS</dt>
                    <dd className="mt-1 text-slate-800">
                      {finding.gps
                        ? `${finding.gps.latitude.toFixed(6)}, ${finding.gps.longitude.toFixed(6)} · ${new Date(finding.gps.capturedAt).toLocaleString()}`
                        : "Not captured"}
                    </dd>
                  </div>
                </dl>
                {finding.evidence.length ? (
                  <ul className="mt-4 flex flex-wrap gap-3">
                    {finding.evidence.map((evidence) => (
                      <li key={evidence.localId} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-xs text-slate-600">
                        {evidence.previewUrl ? <Image src={evidence.previewUrl} alt={`Preview of ${evidence.fileName}`} width={48} height={48} unoptimized className="h-12 w-12 rounded object-cover" /> : null}
                        <span>{evidence.fileName} · {formatFileSize(evidence.fileSize)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-4 text-sm text-slate-500">No evidence attached.</p>}
              </article>
            ))}
          </div>
        ) : <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">No Findings were recorded.</p>}
      </section>

      <div className="flex flex-wrap gap-3">
        <Link href="/inspections" className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Back to Inspections</Link>
        <Link href="/issues" className="rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800">View Issues</Link>
      </div>
    </div>
  );
}
