import { InspectionExecutionPanel } from "@/components/inspection-execution-panel";

export default async function InspectionExecutionPage({
  params,
}: {
  params: Promise<{ inspectionId: string }>;
}) {
  const { inspectionId } = await params;
  return <InspectionExecutionPanel key={inspectionId} inspectionId={inspectionId} />;
}