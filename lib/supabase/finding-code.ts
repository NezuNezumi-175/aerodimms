import { createClient } from "@/lib/supabase/client";

// The existing UNIQUE finding_code constraint is the final concurrency guard.
export async function insertFindingWithUniqueCode(values: Record<string, unknown>) {
  const supabase = createClient();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let highest = 0;
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from("findings").select("finding_code")
        .order("id").range(offset, offset + 999);
      if (error) throw error;
      for (const row of data ?? []) {
        const match = /^F-(\d{3})$/.exec(row.finding_code);
        if (match) highest = Math.max(highest, Number(match[1]));
      }
      if ((data ?? []).length < 1000) break;
    }
    if (highest >= 999) throw new Error("No unused three-digit Finding codes remain.");
    const findingCode = `F-${String(highest + 1).padStart(3, "0")}`;
    const { data, error } = await supabase.from("findings")
      .insert({ ...values, finding_code: findingCode }).select("id, updated_at, finding_code").single();
    if (!error) return data;
    if (error.code !== "23505") throw error;
    // A lost response may mean this stable identity was already inserted.
    const existing = await supabase.from("findings").select("id, updated_at, finding_code")
      .eq("id", values.id).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return existing.data;
    // Another writer won the code. Re-read the maximum and retry the same ID.
  }
  throw new Error("Finding code allocation is busy. Local data remains pending; retry shortly.");
}
