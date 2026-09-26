import { createClient } from "@/lib/supabase/client";

export async function assignFindingTeam(findingId: string, team: string | null) {
  const { error } = await createClient().rpc("assign_finding_team", {
    p_finding_id: findingId,
    p_assigned_team: team,
  });
  if (error) throw error;
}
