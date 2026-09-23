// Eval: compare pipeline output with the human `notes` column (never seen by the AI).
import type { Lead } from "./types";

type Expect = { dimension: "duplicate" | "relevance" | "intent" | "objection" | "missing" | "flag"; check: (l: Lead, all: Lead[]) => boolean; expected: string };

export function expectationFromNote(note: string): Expect | null {
  const n = note.toLowerCase();
  if (/duplicate/.test(n)) return { dimension: "duplicate", expected: "merged", check: (l) => l.column === "merged" };
  if (/irrelevant|wrong market|wrong audience|different profession/.test(n))
    return { dimension: "relevance", expected: "not relevant", check: (l) => l.classify?.relevant === false };
  if (/very high intent/.test(n)) return { dimension: "intent", expected: "call now or high", check: (l) => !!l.priority && (l.priority.call_now || l.priority.band === "high") };
  if (/high intent/.test(n)) return { dimension: "intent", expected: "high (or medium)", check: (l) => !!l.priority && l.priority.band !== "low" };
  if (/early stage/.test(n)) return { dimension: "intent", expected: "not high", check: (l) => !!l.priority && l.priority.band !== "high" && !l.priority.call_now };
  if (/price/.test(n)) return { dimension: "objection", expected: "price objection", check: (l) => !!l.enrich?.objections.some((o) => o.type === "price") };
  if (/confidence/.test(n)) return { dimension: "objection", expected: "confidence objection", check: (l) => !!l.enrich?.objections.some((o) => o.type === "confidence") };
  if (/timeline/.test(n)) return { dimension: "objection", expected: "timeline objection", check: (l) => !!l.enrich?.objections.some((o) => o.type === "timeline") };
  if (/qualification check|eligibility/.test(n)) return { dimension: "flag", expected: "eligibility flag/objection", check: (l) => !!(l.classify?.flags.some((f) => ["qualification_check", "readiness"].includes(f)) || l.enrich?.objections.some((o) => o.type === "eligibility")) };
  if (/expectation/.test(n)) return { dimension: "flag", expected: "expectation_risk flag", check: (l) => !!l.classify?.flags.includes("expectation_risk") };
  if (/missing/.test(n)) return { dimension: "missing", expected: "missing info listed", check: (l) => (l.enrich?.missing_info.length ?? 0) > 0 || l.clean.tags.some((t) => t.startsWith("missing_")) };
  if (/product fit|guidance|follow-up|very interested/.test(n)) return { dimension: "relevance", expected: "relevant", check: (l) => l.classify?.relevant === true };
  return null;
}

export function runEval(leads: Lead[]) {
  const rows = leads.map((l) => {
    const e = expectationFromNote(l.human_note);
    return { lead_id: l.lead_id, note: l.human_note, dimension: e?.dimension ?? "n/a", expected: e?.expected ?? "-", agree: e ? e.check(l, leads) : null };
  });
  const scored = rows.filter((r) => r.agree !== null);
  // Relevance agreement across all non-merged leads: notes that don't say "irrelevant" imply relevant
  const rel = leads.filter((l) => l.column !== "merged" && l.classify).map((l) => {
    const expectNot = /irrelevant|wrong market|wrong audience|different profession/i.test(l.human_note);
    return { lead_id: l.lead_id, agree: l.classify!.relevant === !expectNot, ai: l.classify!.relevant, note: l.human_note };
  });
  return {
    overall: scored.length ? scored.filter((r) => r.agree).length / scored.length : 0,
    relevanceAgreement: rel.length ? rel.filter((r) => r.agree).length / rel.length : 0,
    duplicatesCaught: `${rows.filter((r) => r.dimension === "duplicate" && r.agree).length}/${rows.filter((r) => r.dimension === "duplicate").length}`,
    disagreements: [...rows.filter((r) => r.agree === false), ...rel.filter((r) => !r.agree).map((r) => ({ lead_id: r.lead_id, note: r.note, dimension: "relevance", expected: r.ai ? "not relevant (per note)" : "relevant", agree: false }))],
    rows,
  };
}
