import { IssueDetailPanel } from "@/components/issue-detail-panel";

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <IssueDetailPanel findingCode={id} />;
}
