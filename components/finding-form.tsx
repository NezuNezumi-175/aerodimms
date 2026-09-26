"use client";

import Image from "next/image";
import type { ChangeEvent, FormEvent } from "react";
import type {
  EvidenceAttachment,
  FindingDraft,
  FindingSeverity,
  Inspection,
} from "@/lib/inspection-data";

const findingCategories = [
  "Pavement / Surface",
  "FOD",
  "Lighting / AGL",
  "Markings",
  "Drainage",
  "Wildlife Hazard",
  "Facility / Infrastructure",
  "Other",
] as const;
const findingSeverities: FindingSeverity[] = ["Low", "Medium", "High", "Critical"];
const severityStyles: Record<FindingSeverity, string> = {
  Low: "border-emerald-600 bg-emerald-600 text-white",
  Medium: "border-amber-500 bg-amber-500 text-white",
  High: "border-orange-600 bg-orange-600 text-white",
  Critical: "border-red-700 bg-red-700 text-white",
};
const formControlClass =
  "mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:bg-white";

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function FindingForm({
  title,
  context,
  draft,
  onDraftChange,
  onSave,
  onCancel,
  onCaptureGps,
  gpsLoading,
  gpsError,
  evidenceError,
  formError,
  onAddEvidence,
  onRemoveEvidence,
  relatedInspections,
  selectedInspectionId,
  onRelatedInspectionChange,
}: {
  title: string;
  context: string;
  draft: FindingDraft;
  onDraftChange: (update: Partial<FindingDraft>) => void;
  onSave: (draft: FindingDraft) => void;
  onCancel: () => void;
  onCaptureGps: () => void;
  gpsLoading: boolean;
  gpsError: string;
  evidenceError: string;
  formError: string;
  onAddEvidence: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveEvidence: (localId: string) => void;
  relatedInspections?: Inspection[];
  selectedInspectionId?: string;
  onRelatedInspectionChange?: (inspectionId: string) => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave(draft);
  };

  return (
    <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/50 p-4 sm:p-5">
      <div className="mb-4 border-b border-sky-100 pb-3">
        <h4 className="font-semibold text-slate-900">{title}</h4>
        <p className="mt-1 text-xs text-slate-600">{context}</p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        {relatedInspections && onRelatedInspectionChange ? (
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Related Inspection</span>
            <select
              value={selectedInspectionId ?? ""}
              onChange={(event) => onRelatedInspectionChange(event.target.value)}
              className={formControlClass}
            >
              <option value="">No related inspection</option>
              {relatedInspections.map((inspection) => (
                <option key={inspection.id} value={inspection.id}>
                  {inspection.id} · {inspection.type} ({inspection.status})
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Finding Description <span className="text-red-600">*</span></span>
          <textarea
            required
            rows={3}
            maxLength={1000}
            value={draft.description}
            onChange={(event) => onDraftChange({ description: event.target.value })}
            className={formControlClass}
            placeholder="Describe the observed condition or hazard"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Category <span className="text-red-600">*</span></span>
            <select
              required
              value={draft.category}
              onChange={(event) => onDraftChange({ category: event.target.value as FindingDraft["category"] })}
              className={formControlClass}
            >
              <option value="">Select a category</option>
              {findingCategories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>

          <fieldset>
            <legend className="text-sm font-medium text-slate-700">
              Priority / Severity <span className="text-red-600">*</span>
            </legend>
            <div role="group" aria-label="Finding severity" className="mt-1.5 flex flex-wrap gap-2">
              {findingSeverities.map((severity) => {
                const selected = draft.severity === severity;
                return (
                  <button
                    key={severity}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onDraftChange({ severity })}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                      selected ? severityStyles[severity] : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {severity}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Location / Area</span>
          <input
            value={draft.area}
            onChange={(event) => onDraftChange({ area: event.target.value })}
            className={formControlClass}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <section aria-label="GPS location" className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <h5 className="text-sm font-semibold text-slate-700">GPS Location</h5>
              {draft.gps ? <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">Captured</span> : null}
            </div>
            {draft.gps ? (
              <dl className="mt-3 space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between gap-2"><dt>Latitude</dt><dd className="font-medium text-slate-800">{draft.gps.latitude.toFixed(6)}</dd></div>
                <div className="flex justify-between gap-2"><dt>Longitude</dt><dd className="font-medium text-slate-800">{draft.gps.longitude.toFixed(6)}</dd></div>
                <div><dt className="text-slate-500">Captured</dt><dd className="mt-0.5 font-medium text-slate-800">{new Date(draft.gps.capturedAt).toLocaleString()}</dd></div>
              </dl>
            ) : <p className="mt-1 text-sm text-slate-500">GPS location not captured yet</p>}
            {gpsError ? <p role="status" className="mt-2 text-xs text-amber-800">{gpsError}</p> : null}
            <button
              type="button"
              disabled={gpsLoading}
              onClick={onCaptureGps}
              className="mt-3 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
            >
              {gpsLoading ? "Capturing location..." : draft.gps ? "Update GPS Location" : "Capture GPS Location"}
            </button>
          </section>

          <section aria-label="Evidence" className="rounded-lg border border-slate-200 bg-white p-3">
            <h5 className="text-sm font-semibold text-slate-700">Photo / Evidence</h5>
            <label className="mt-2 block text-sm text-slate-600">
              <span className="sr-only">Add Photo / Evidence</span>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                capture="environment"
                multiple
                onChange={onAddEvidence}
                className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-700 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-sky-800"
              />
            </label>
            {draft.evidence.length ? (
              <ul className="mt-3 divide-y divide-slate-100">
                {draft.evidence.map((attachment: EvidenceAttachment) => (
                  <li key={attachment.localId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <Image
                      src={attachment.previewUrl}
                      alt={`Preview of ${attachment.fileName}`}
                      width={64}
                      height={64}
                      unoptimized
                      className="h-16 w-16 shrink-0 rounded-md border border-slate-200 object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="break-all text-xs font-medium text-slate-800">{attachment.fileName}</p>
                      <p className="mt-1 text-xs text-slate-500">{attachment.fileType} · {formatFileSize(attachment.fileSize)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveEvidence(attachment.localId)}
                      className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-slate-500">No evidence attached</p>}
            {evidenceError ? <p role="alert" className="mt-2 text-xs text-amber-800">{evidenceError}</p> : null}
          </section>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Remarks (optional)</span>
          <textarea
            rows={2}
            maxLength={500}
            value={draft.remarks}
            onChange={(event) => onDraftChange({ remarks: event.target.value })}
            className={formControlClass}
            placeholder="Additional context"
          />
        </label>

        {formError ? <p role="alert" className="text-sm font-medium text-red-700">{formError}</p> : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={gpsLoading}
            onClick={onCancel}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button type="submit" className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800">
            Save Finding
          </button>
        </div>
      </form>
    </div>
  );
}