// Headline KPIs for the dashboard band. Pure code over pipeline output + human actions.
import type { Lead } from "./types";

export interface Kpi { id: string; label: string; value: string; sub: string; good?: boolean; bar?: number }
const CORRECTED = /removed|Contradiction|added by rule|upgraded|downgraded|capped/;

export function buildKpis(leads: Lead[], evalAgreement: number | null, approvedIds: Set<string>): Kpi[] {
  const unique = leads.filter((l) => l.column !== "merged");
  const merged = leads.length - unique.length;
  const relevant = unique.filter((l) => l.classify?.relevant);
  const hot = relevant.filter((l) => l.priority?.call_now || l.priority?.band === "high");
  const overdue = relevant.filter((l) => l.priority?.call_now).length;
  const scores = relevant.filter((l) => l.priority).map((l) => l.priority!.score);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const drafted = relevant.filter((l) => l.gates.some((g) => g.stage === "outreach" && g.pass)).length;
  const corrections = unique.reduce((n, l) => n + l.gates.filter((g) => g.pass && g.stage !== "human_approval" && CORRECTED.test(g.reason)).length, 0);
  const reviewQueue = unique.filter((l) => l.column === "needs_review").length;
  const approved = relevant.filter((l) => approvedIds.has(l.lead_id)).length;
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

  return [
    { id: "processed", label: "Leads processed", value: `${unique.length}`, sub: `from ${leads.length} rows, ${merged} duplicates merged` },
    { id: "qualified", label: "Qualified", value: `${relevant.length}`, sub: `${pct(relevant.length, unique.length)}% of unique leads` },
    { id: "hot", label: "Hot leads", value: `${hot.length}`, sub: `${overdue} overdue callback${overdue === 1 ? "" : "s"}`, good: hot.length > 0 },
    { id: "score", label: "Avg priority score", value: `${avg}`, sub: "out of 100 · High is 70+" },
    { id: "drafted", label: "Messages ready", value: `${drafted}`, sub: `${pct(drafted, relevant.length)}% passed every check` },
    { id: "accuracy", label: "AI accuracy", value: evalAgreement === null ? "–" : `${Math.round(evalAgreement * 100)}%`,
      sub: evalAgreement === null ? "no notes to compare" : `vs sales notes · target 90% ${evalAgreement >= 0.9 ? "✓" : "✗"}`, good: evalAgreement !== null && evalAgreement >= 0.9 },
    { id: "corrections", label: "AI mistakes caught", value: `${corrections}`, sub: `fixed by rules · ${reviewQueue} sent to review` },
    { id: "approved", label: "Approved by you", value: `${approved}/${relevant.length}`, sub: `${pct(approved, relevant.length)}% of qualified leads`, bar: pct(approved, relevant.length) },
  ];
}
