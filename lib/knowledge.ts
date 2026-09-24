// The ONLY external facts the AI may use. Each has an id the AI must cite (e.g. "KB:K1").
// Individuals are never looked up online (privacy decision) — enrichment uses these domain facts only.

export interface KnowledgeFact { id: string; fact: string; source: string; url: string; checked: string; signals?: RegExp }

export const KNOWLEDGE: KnowledgeFact[] = [
  {
    id: "K1",
    signals: /\\bB2\\b[^.]{0,80}(recogni|registration|licen)|(recogni|registration|licen)[^.]{0,80}\\bB2\\b/i,
    fact: "For professional recognition as a nurse in Germany, German at CEFR level B2 is required.",
    source: "Make it in Germany (German Federal Government portal) — Nursing professionals",
    url: "https://www.make-it-in-germany.com/en/working-in-germany/professions-in-demand/nursing",
    checked: "2026-09-24",
  },
  {
    id: "K2",
    signals: /recognition (procedure|process)|anerkennung|adaptation (course|measure)|responsible (german )?authority|trained outside the eu|qualification (is )?(accepted|recogni)/i,
    fact: "Recognition depends on where the qualification was obtained; nurses trained outside the EU go through a recognition procedure (Anerkennung) with the responsible German authority, which may require an adaptation course or exam.",
    source: "Make it in Germany — Nursing professionals",
    url: "https://www.make-it-in-germany.com/en/working-in-germany/professions-in-demand/nursing",
    checked: "2026-09-24",
  },
  {
    id: "K3",
    signals: /recognition partnership|\\bA2\\b[^.]{0,60}contract|contract[^.]{0,60}\\bA2\\b/i,
    fact: "Under a recognition partnership, a nurse with a German employment contract and German at A2 can enter Germany and complete recognition while working.",
    source: "Make it in Germany — Nursing professionals (visa section)",
    url: "https://www.make-it-in-germany.com/en/jobs/professions-in-demand/nursing",
    checked: "2026-09-24",
  },
  {
    id: "K4",
    signals: /medical fitness|good conduct|police (clearance|certificate)/i,
    fact: "Recognition also requires proof of medical fitness and a certificate of good conduct.",
    source: "Make it in Germany — Nursing professionals",
    url: "https://www.make-it-in-germany.com/en/working-in-germany/professions-in-demand/nursing",
    checked: "2026-09-24",
  },
  {
    id: "S1",
    fact: "Skillcase connects Indian healthcare professionals (nurses and allied health workers) with jobs in Germany and Europe, supporting language training, documentation, relocation and onboarding.",
    source: "Skillcase company description (provided by Skillcase)",
    url: "internal",
    checked: "2026-09-24",
  },
  {
    id: "S2",
    fact: "Skillcase pricing, installment options and placement timelines are NOT published — they must be shared by a counselor, never stated in outreach.",
    source: "Product decision (no public pricing found)",
    url: "internal",
    checked: "2026-09-24",
  },
];

export const knowledgeText = () =>
  KNOWLEDGE.map((k) => `[KB:${k.id}] ${k.fact}`).join("\n");

// Attribution: which public facts does this lead's output rely on?
// 1) explicit KB:<id> citations by the AI, 2) rule-based matching of domain facts in the generated text.
export function sourcesForLead(l: { enrich?: { knowledge_refs: string[]; opportunity: { text: string }; next_step: string; missing_info: string[] }; outreach?: { message: string; talking_points?: string[]; facts_used?: Array<{ quote: string }> } }) {
  const ids = new Set((l.enrich?.knowledge_refs ?? []).map((r) => r.replace(/^KB:/i, "")));
  for (const f of l.outreach?.facts_used ?? []) if (/^KB:/i.test(f.quote)) ids.add(f.quote.replace(/^KB:/i, ""));
  const text = [l.enrich?.opportunity.text, l.enrich?.next_step, ...(l.enrich?.missing_info ?? []), l.outreach?.message, ...(l.outreach?.talking_points ?? [])].join(" \n ");
  for (const k of KNOWLEDGE) if (k.signals?.test(text)) ids.add(k.id);
  return KNOWLEDGE.filter((k) => ids.has(k.id) && k.url.startsWith("http"));
}
