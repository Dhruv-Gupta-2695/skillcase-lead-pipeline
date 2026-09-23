import "dotenv/config";
// Offline test of QC + scoring + pipeline using a scripted fake AI (no API key needed).
import { readFileSync } from "fs";
import { intake } from "../lib/clean";
import { processLead } from "../lib/pipeline";
import type { AIClient } from "../lib/ai";

const leads = intake(readFileSync("data/leads.csv", "utf8")).leads;
const L = (id: string) => leads.find((l) => l.lead_id === id)!;

const analysis = (over: object) => ({
  relevant: true, reason: { text: "Nurse wanting Germany", quote: "Interested in Germany" }, confidence: 0.9, track: "placement", flags: [],
  german_certified: false, profile: [{ text: "BSc Nursing, 2 years", quote: "BSc Nursing" }], intent_category: "asked_jobs_or_process",
  intent: { text: "Work in Germany", quote: "Work in Germany" }, needs: [{ text: "Eligibility clarity", quote: "Asked about eligibility" }],
  objections: [{ type: "price", text: "Cost concern", quote: "total cost" }], missing_info: ["exam date"],
  opportunity: { text: "B2 path", quote: "KB:K1" }, next_step: "Call", call_requested: null, blocker: "soft", ...over,
});
function fake(an: object, outreachMsgs: string[], review: object): AIClient {
  let o = 0;
  return { async call({ toolName }) {
    if (toolName === "lead_analysis") return an as any;
    if (toolName === "outreach") return { subject: null, message: outreachMsgs[Math.min(o++, outreachMsgs.length-1)], talking_points: null,
      facts_used: [{ fact: "B1", quote: "Has B1" }, { fact: "cost", quote: "total cost" }] } as any;
    return review as any;
  } };
}
const okReview = { blind: { relevant: true, call_now: false, main_objection: "price" }, verdict: "approve", issues: [] };
const good = "Hi Priya! You have B1 and asked about eligibility and total cost. Our counselor can walk you through the Germany path and costs on a quick call. Does tomorrow evening work?";

(async () => {
  console.log("\n=== 1. Seeded errors in AI 1 (L001): fake 'certified', invented quote ===");
  let r = await processLead(L("L001"), fake(analysis({ german_certified: true,
    needs: [{ text: "Wants to start next month", quote: "wants to start next month" }] }), [good], okReview));
  r.gates.forEach((g) => console.log(`  ${g.pass ? "✓" : "✗"} ${g.stage}: ${g.reason}`));
  console.log("  column:", r.column, "| score:", r.priority?.score);

  console.log("\n=== 2. Outreach promises a job (L030) -> retry -> still bad ===");
  r = await processLead(L("L030"), fake(analysis({ reason: { text: "x", quote: "guarantees a job" }, flags: ["expectation_risk"] }),
    ["Hi Karan, yes we guarantee a job in Germany!", "Hi Karan, you will surely get placed."], okReview));
  r.gates.filter(g=>["outreach","ai_review"].includes(g.stage)).forEach((g) => console.log(`  ${g.pass ? "✓" : "✗"} ${g.stage}: ${g.reason}`));
  console.log("  column:", r.column);

  console.log("\n=== 3. AI says Relevant for L012 (Canada) -> rule conflict ===");
  r = await processLead(L("L012"), fake(analysis({ reason: { text: "nurse", quote: "BSc Nursing" } }), [good.replace("Priya","Rohan")], okReview));
  r.gates.filter(g=>g.stage==="classify").forEach((g) => console.log(`  ${g.pass ? "✓" : "✗"} ${g.stage}: ${g.reason}`));
  console.log("  column:", r.column);

  console.log("\n=== 4. GNM lead (L014), AI forgets flag -> added by rule ===");
  r = await processLead(L("L014"), fake(analysis({ reason: { text: "GNM B2", quote: "Has B2" } }), [good.replace("Priya","Sanjay")], okReview));
  console.log("  ", r.gates.find(g=>g.stage==="classify")!.reason, "| flags:", r.classify!.flags);

  console.log("\n=== 5. Kavya (L013) asked for a call -> Call Now ===");
  r = await processLead(L("L013"), fake(analysis({ intent_category: "ready_or_call_requested", blocker: "none",
    call_requested: { text: "wants a call", quote: "wants a call tomorrow" } }),
    ["Hi Kavya! You're ready to start and asked about documents. Let's talk today."], { ...okReview, blind: { relevant: true, call_now: true, main_objection: "" } }));
  console.log("  ", r.priority?.reasons.join("\n   "), "\n   column:", r.column, "| outreach gate:", r.gates.find(g=>g.stage==="outreach")!.reason);

  console.log("\n=== 6. Reviewer crashes -> fail closed ===");
  const crash: AIClient = { async call(o) { if (o.toolName === "review") throw new Error("timeout"); return fake(analysis({}), [good], okReview).call(o); } };
  r = await processLead(L("L001"), crash);
  console.log("  ", r.gates.find(g=>g.stage==="ai_review")!.reason, "| column:", r.column);
})();
