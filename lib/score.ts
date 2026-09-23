import { SCORE } from "./config";
import type { Lead } from "./types";

export function scoreLead(l: Lead) {
  const e = l.enrich!;
  const c = l.clean;
  const reasons: string[] = [];
  let incomplete = false;

  const intent = SCORE.intent[e.intent_category];
  reasons.push(`Intent (${e.intent_category.replace(/_/g, " ")}): +${intent}`);

  const lvl = (c.german_level ?? "unknown") as keyof typeof SCORE.german;
  let german = SCORE.german[lvl] as number;
  if (!c.german_level) incomplete = true;
  reasons.push(`German ${c.german_level ?? "unknown"}${e.german_certified ? " (certified +5)" : c.german_level ? " (claimed, not certified)" : ""}: +${german + (e.german_certified ? SCORE.german.certifiedBonus : 0)}`);
  if (e.german_certified) german += SCORE.german.certifiedBonus;

  let elig: number, eligWhy: string;
  if (c.education_category === "unknown" || (c.education_category === "nursing_degree" && c.experience_months === null)) {
    elig = SCORE.eligibility.unknown; eligWhy = "unknown"; incomplete = true;
  } else if (c.education_category === "nursing_degree" && (c.experience_months ?? 0) >= 12) {
    elig = SCORE.eligibility.strong; eligWhy = `${c.education}, ${Math.round((c.experience_months ?? 0) / 12)} yr`;
  } else { elig = SCORE.eligibility.conditional; eligWhy = `conditional (${c.education}${c.experience_months !== null ? `, ${c.experience_months} months` : ""})`; }
  reasons.push(`Eligibility ${eligWhy}: +${elig}`);

  const d = c.days_since_contact;
  const rec = d === null ? SCORE.recency.older : d <= 3 ? SCORE.recency.within3 : d <= 7 ? SCORE.recency.within7 : SCORE.recency.older;
  reasons.push(`Recency (${d ?? "?"} days since contact): +${rec}`);

  const blk = SCORE.blockers[e.blocker];
  reasons.push(`Blockers (${e.blocker}): +${blk}`);

  const score = intent + german + elig + rec + blk;
  const band = score >= SCORE.bands.high ? "high" : score >= SCORE.bands.medium ? "medium" : "low";
  // Call Now: lead asked for a call and no contact has happened since that conversation
  const call_now = !!e.call_requested && (d ?? 0) >= 1;
  if (call_now) reasons.push(`CALL NOW: lead asked for a call ${d} days ago — not yet done`);
  if (e.blocker === "hard") reasons.push("Hard blocker → Nurture regardless of score");
  if (incomplete) reasons.push("Incomplete score: some inputs unknown — collect missing info");

  return { score, band: band as "high" | "medium" | "low", reasons, call_now, incomplete };
}
