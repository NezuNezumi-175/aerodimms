"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { assignFindingTeam, deleteFinding } from "@/lib/supabase/team-assignment";
import { isDemoMode, loadAppState } from "@/lib/app-data";
import { getStoredUser, loadDemoState, saveDemoState, type DemoState, type Finding } from "@/lib/demo-data";
import { useNetworkStatus } from "@/lib/use-network-status";
import { useSyncRefresh } from "@/lib/use-sync-refresh";

const teamSuggestions = ["AGL Maintenance", "Pavement Team", "Signage Team", "Security Works", "Marking Team", "Civil Works"];
const severityClass: Record<Finding["severity"], string> = {
  CRITICAL: "bg-red-100 text-red-800",
  HIGH: "bg-orange-100 text-orange-800",
  MEDIUM: "bg-amber-100 text-amber-800",
  LOW: "bg-sky-100 text-sky-800",
};

export function OperationManagerPanel() {
  const isOnline = useNetworkStatus();
  const syncRevision = useSyncRefresh();
  const [state, setState] = useState<DemoState | null>(null);
  const [draftTeams, setDraftTeams] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void loadAppState().then((data) => {
      if (!active) return;
      setState(data);
      setDraftTeams(Object.fromEntries(data.findings.map((finding) => [finding.id, finding.assignedTeam ?? ""])));
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Could not load issues.");
    });
    return () => { active = false; };
  }, [syncRevision]);

  const issues = useMemo(() => state ? [...state.findings].sort((a, b) => {
    const unassignedOrder = Number(Boolean(a.assignedTeam)) - Number(Boolean(b.assignedTeam));
    return unassignedOrder || b.updatedAt.localeCompare(a.updatedAt);
  }) : [], [state]);
  const unassignedCount = issues.filter((finding) => !finding.assignedTeam).length;
  const teams = useMemo(() => [...new Set([...teamSuggestions, ...issues.map((finding) => finding.assignedTeam).filter((team): team is string => Boolean(team))])], [issues]);

  async function saveTeam(finding: Finding) {
    if (!state) return;
    const nextTeam = draftTeams[finding.id]?.trim() ?? "";
    const normalizedTeam = nextTeam || null;
    if (normalizedTeam === (finding.assignedTeam ?? null)) return;
    setSavingId(finding.id);
    setError("");
    setNotice("");
    try {
      if (isDemoMode()) {
        const demoState = loadDemoState();
        const nextState = { ...demoState, findings: demoState.findings.map((item) => item.id === finding.id ? { ...item, assignedTeam: normalizedTeam ?? undefined, updatedAt: new Date().toISOString() } : item) };
        saveDemoState(nextState);
        setState(nextState);
      } else {
        if (!isOnline) throw new Error("Connect to the internet before assigning a team.");
        await assignFindingTeam(finding.id, normalizedTeam);
        const refreshed = await loadAppState();
        setState(refreshed);
      }
      setDraftTeams((current) => ({ ...current, [finding.id]: normalizedTeam ?? "" }));
      setNotice(`${finding.findingCode} team assignment saved.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the team assignment.");
    } finally {
      setSavingId(null);
    }
  }

  async function removeFinding(finding: Finding) {
    if (!state || !window.confirm(`Delete ${finding.findingCode} (${finding.title})? This cannot be undone.`)) return;
    setDeletingId(finding.id);
    setError("");
    setNotice("");
    try {
      if (isDemoMode()) {
        const demoState = loadDemoState();
        const nextState: DemoState = {
          ...demoState,
          findings: demoState.findings.filter((item) => item.id !== finding.id),
          workOrders: demoState.workOrders.filter((item) => item.findingId !== finding.id),
          evidence: demoState.evidence.filter((item) => item.findingId !== finding.id),
          issueHistory: demoState.issueHistory.filter((item) => item.findingId !== finding.id),
          internalInspectionFindings: demoState.internalInspectionFindings?.filter((item) => item.id !== finding.id),
        };
        saveDemoState(nextState);
        setState(nextState);
      } else {
        if (!isOnline) throw new Error("Connect to the internet before deleting an issue.");
        const cleanupWarning = await deleteFinding(finding.id);
        setState((current) => current ? {
          ...current,
          findings: current.findings.filter((item) => item.id !== finding.id),
          workOrders: current.workOrders.filter((item) => item.findingId !== finding.id),
          evidence: current.evidence.filter((item) => item.findingId !== finding.id),
          issueHistory: current.issueHistory.filter((item) => item.findingId !== finding.id),
        } : current);
        if (cleanupWarning) setError(cleanupWarning);
      }
      setNotice(`${finding.findingCode} deleted.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete the issue.");
    } finally {
      setDeletingId(null);
    }
  }

  const user = getStoredUser();
  if (user && user.role !== "OPERATIONS_MANAGER") return <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">Only Operation Managers can assign teams.</div>;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Operation Manager</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Issue Team Assignment</h1>
          <p className="mt-1 text-sm text-slate-600">Assign a responsible maintenance team to each issue.</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Needs assignment</p>
          <p className="mt-1 text-2xl font-bold text-amber-950">{unassignedCount}</p>
        </div>
      </header>

      {notice ? <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div><h2 className="font-semibold text-slate-900">Issues</h2><p className="mt-0.5 text-xs text-slate-500">{issues.length} total</p></div>
          <Link href="/issues" className="text-sm font-semibold text-sky-700 hover:text-sky-900">View issue list →</Link>
        </div>
        {!state ? <p className="p-6 text-sm text-slate-500">Loading issues…</p> : issues.length === 0 ? <p className="p-6 text-sm text-slate-500">No issues found.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Issue</th><th className="px-5 py-3">Severity</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Location</th><th className="px-5 py-3">Responsible team</th><th className="px-5 py-3">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {issues.map((finding) => {
                  const draft = draftTeams[finding.id] ?? finding.assignedTeam ?? "";
                  const changed = draft.trim() !== (finding.assignedTeam ?? "");
                  return <tr key={finding.id} className="align-top hover:bg-slate-50/70">
                    <td className="px-5 py-4"><Link href={`/issues/${encodeURIComponent(finding.id)}`} className="font-semibold text-sky-800 hover:underline">{finding.findingCode}</Link><p className="mt-1 max-w-sm text-slate-700">{finding.title}</p></td>
                    <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${severityClass[finding.severity]}`}>{finding.severity}</span></td>
                    <td className="px-5 py-4 text-slate-700">{finding.status.replaceAll("_", " ")}</td>
                    <td className="px-5 py-4 text-slate-700">{finding.locationName}</td>
                    <td className="px-5 py-4"><input list={`teams-${finding.id}`} value={draft} onChange={(event) => setDraftTeams((current) => ({ ...current, [finding.id]: event.target.value }))} placeholder="Select or enter a team" className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" /><datalist id={`teams-${finding.id}`}>{teams.map((team) => <option key={team} value={team} />)}</datalist></td>
                    <td className="px-5 py-4"><div className="flex items-center gap-2"><button type="button" onClick={() => void saveTeam(finding)} disabled={!changed || savingId === finding.id || deletingId === finding.id || (!isDemoMode() && !isOnline)} className="rounded-lg bg-sky-700 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300">{savingId === finding.id ? "Saving…" : "Save"}</button><button type="button" onClick={() => void removeFinding(finding)} disabled={deletingId === finding.id || savingId === finding.id || (!isDemoMode() && !isOnline)} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50">{deletingId === finding.id ? "Deleting…" : "Delete"}</button></div></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
