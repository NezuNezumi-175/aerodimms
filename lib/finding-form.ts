import type { EvidenceAttachment, GpsLocation } from "@/lib/inspection-data";

const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function getImageType(file: File): string | null {
  if (acceptedImageTypes.has(file.type)) return file.type;

  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return null;
}

export function createFindingEvidence(
  files: File[],
  registerPreviewUrl: (previewUrl: string) => void,
) {
  const attachments: EvidenceAttachment[] = [];
  let rejectedCount = 0;

  files.forEach((file) => {
    const fileType = getImageType(file);
    if (!fileType) {
      rejectedCount += 1;
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    registerPreviewUrl(previewUrl);
    attachments.push({
      localId: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `evidence-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      file,
      fileName: file.name,
      fileType,
      fileSize: file.size,
      previewUrl,
    });
  });

  return { attachments, rejectedCount };
}

export function requestFindingGps(
  onCaptured: (gps: GpsLocation) => void,
  onUnavailable: () => void,
) {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    onUnavailable();
    return;
  }

  try {
    navigator.geolocation.getCurrentPosition(
      (position) => onCaptured({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        capturedAt: new Date().toISOString(),
      }),
      onUnavailable,
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  } catch {
    onUnavailable();
  }
}
