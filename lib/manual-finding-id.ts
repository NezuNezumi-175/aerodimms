import type { DemoState } from "@/lib/demo-data";

export function getNextManualFindingCode(state: DemoState) {
  const identifiers = [
    ...state.findings.flatMap((finding) => [finding.id, finding.findingCode]),
    ...(state.internalInspectionFindings ?? []).flatMap((finding) => [
      finding.id,
      finding.findingCode,
      finding.sourceFindingId,
    ]),
    ...(state.completedInspectionRecords ?? []).flatMap((record) =>
      record.findings.map((finding) => finding.id),
    ),
  ];
  const usedNumbers = new Set<number>();

  identifiers.forEach((identifier) => {
    const match = identifier.toUpperCase().match(/^F-(\d{3})$/);
    if (match) usedNumbers.add(Number(match[1]));
  });

  let nextNumber = Math.max(0, ...usedNumbers) + 1;
  while (nextNumber <= 999 && usedNumbers.has(nextNumber)) nextNumber += 1;
  if (nextNumber > 999) throw new Error("No unused three-digit Finding IDs remain.");

  return `F-${String(nextNumber).padStart(3, "0")}`;
}