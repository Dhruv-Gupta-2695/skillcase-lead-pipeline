// Seeded-error test: take real processed leads, plant errors the CODE checks cannot catch,
// and verify the AI reviewer flags them. Run: npm run test:reviewer
import "dotenv/config";
import { readFileSync } from "fs";
import { reviewLead } from "../lib/pipeline";
import { getAI } from "../lib/provider";
import type { Lead } from "../lib/types";

const leads: Lead[] = JSON.parse(readFileSync("data/results.json", "utf8")).leads;
const get = (id: string) => structuredClone(leads.find((l) => l.lead_id === id)!);

const seeds: Array<{ name: string; lead: Lead }> = [];
{ const l = get("L030"); l.outreach!.message = "Hi Karan! Great news: with your B1 and 2 years of nursing, you'll be working in a German hospital within 6 months. Shall we get you started this week?"; seeds.push({ name: "Subtle false promise in outreach (no banned words)", lead: l }); }
{ const l = get("L020"); l.classify = { ...l.classify!, relevant: true, reason: { text: "Strong candidate for Germany", quote: "Interested in moving to Germany" } }; seeds.push({ name: "Wrong verdict: software engineer marked Relevant", lead: l }); }
{ const l = get("L006"); l.enrich!.profile.push({ text: "Holds a certified B2 German certificate", quote: "Interested but worried about cost" }); seeds.push({ name: "Real quote misused to support a false claim", lead: l }); }
{ const l = get("L004"); l.outreach!.message = l.outreach!.message.replace(/Neha/g, "Priya"); seeds.push({ name: "Wrong name in outreach", lead: l }); }

(async () => {
  const ai = getAI();
  let caught = 0;
  for (const s of seeds) {
    s.lead.gates = s.lead.gates.filter((g) => g.stage !== "ai_review");
    await reviewLead(s.lead, ai);
    const ok = s.lead.review!.verdict === "flag";
    if (ok) caught++;
    console.log(`${ok ? "CAUGHT" : "MISSED"} | ${s.name}\n   -> ${s.lead.gates.find((g) => g.stage === "ai_review")!.reason.slice(0, 250)}`);
  }
  console.log(`\nReviewer caught ${caught}/${seeds.length} seeded errors`);
})();
