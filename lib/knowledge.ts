// The ONLY external facts the AI may use. Each has an id the AI must cite (e.g. "KB:K1").
// Individuals are never looked up online (privacy decision) — enrichment uses these domain facts only.

export interface KnowledgeFact { id: string; fact: string; source: string; url: string; checked: string }

export const KNOWLEDGE: KnowledgeFact[] = [
  {
    id: "K1",
    fact: "For professional recognition as a nurse in Germany, German at CEFR level B2 is required.",
    source: "Make it in Germany (German Federal Government portal) — Nursing professionals",
    url: "https://www.make-it-in-germany.com/en/working-in-germany/professions-in-demand/nursing",
    checked: "2026-09-24",
  },
  {
    id: "K2",
    fact: "Recognition depends on where the qualification was obtained; nurses trained outside the EU go through a recognition procedure (Anerkennung) with the responsible German authority, which may require an adaptation course or exam.",
    source: "Make it in Germany — Nursing professionals",
    url: "https://www.make-it-in-germany.com/en/working-in-germany/professions-in-demand/nursing",
    checked: "2026-09-24",
  },
  {
    id: "K3",
    fact: "Under a recognition partnership, a nurse with a German employment contract and German at A2 can enter Germany and complete recognition while working.",
    source: "Make it in Germany — Nursing professionals (visa section)",
    url: "https://www.make-it-in-germany.com/en/jobs/professions-in-demand/nursing",
    checked: "2026-09-24",
  },
  {
    id: "K4",
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
