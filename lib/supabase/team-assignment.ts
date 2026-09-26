import { createClient } from "@/lib/supabase/client";

export async function assignFindingTeam(findingId: string, team: string | null) {
  const { error } = await createClient().rpc("assign_finding_team", {
    p_finding_id: findingId,
    p_assigned_team: team,
  });
  if (error) throw error;
}

export async function deleteFinding(findingId: string) {
  const supabase = createClient();
  const { data: evidence, error: evidenceError } = await supabase
    .from("evidence")
    .select("storage_path")
    .eq("finding_id", findingId);
  if (evidenceError) throw evidenceError;

  const { error } = await supabase.rpc("delete_finding", { p_finding_id: findingId });
  if (error) throw error;

  const paths = (evidence ?? []).map((item) => item.storage_path);
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from("finding-evidence").remove(paths);
    if (storageError) return "Issue deleted, but some evidence files could not be removed from storage.";
  }
  return null;
}
