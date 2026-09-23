import type { AIClient } from "./ai";
import { MODELS, OUTREACH, REVIEW, SCORE } from "./config";
import { AnalysisSchema, OutreachSchema, ReviewSchema, type Review } from "./schemas";
import { ANALYSIS_SYSTEM, analysisUser, OUTREACH_SYSTEM, outreachUser, REVIEW_SYSTEM, reviewUser } from "./prompts";
import { qcClassify, qcEnrich, qcOutreach, verifyQuote } from "./qc";
import { scoreLead } from "./score";
import type { Lead } from "./types";

const closeOut = (l: Lead) =>
  `Hi ${l.clean.first_name}, thank you for your interest in Skillcase. We currently focus on helping healthcare professionals build careers in Germany and Europe, so we may not be the right fit for your goals right now. We wish you all the best, and you're welcome to reach out if your plans change.`;

export async function processLead(input: Lead, ai: AIClient): Promise<Lead> {
  const l: Lead = structuredClone(input);
  if (l.column === "merged") return l;
  const cleanFailed = l.gates.some((g) => g.stage === "clean" && !g.pass);

  // ---- AI 1: Classify + Enrich (one call) ----
  let a;
  try {
    a = await ai.call({ model: MODELS.worker, system: ANALYSIS_SYSTEM, user: analysisUser(l), toolName: "lead_analysis", schema: AnalysisSchema });
  } catch (err) {
    l.gates.push({ stage: "classify", pass: false, reason: `AI error (fail closed): ${(err as Error).message}` });
    l.column = "needs_review";
    return l;
  }

  const qc1 = qcClassify(l, a);
  l.classify = {
    relevant: qc1.relevant, reason: a.reason, confidence: qc1.confidence, confidence_raw: a.confidence,
    track: a.track, flags: qc1.flags,
  };
  l.gates.push({
    stage: "classify", pass: qc1.pass,
    reason: `${qc1.relevant ? "Relevant" : "Not Relevant"} (confidence ${qc1.confidence.toFixed(2)}${qc1.confidence !== a.confidence ? `, capped from ${a.confidence.toFixed(2)}` : ""})` +
      (qc1.issues.length ? ` | ${qc1.issues.join(" | ")}` : ""),
  });

  const qc2 = qcEnrich(l, a);
  l.enrich = qc2.enrich;
  l.gates.push({ stage: "enrich", pass: qc2.pass, reason: qc2.issues.length ? qc2.issues.join(" | ") : "All claims verified against source" });

  // ---- Prioritize (code) ----
  if (l.classify.relevant) {
    l.priority = scoreLead(l);
    l.gates.push({ stage: "prioritize", pass: true, reason: `Score ${l.priority.score} (${l.priority.band})${l.priority.call_now ? " + CALL NOW" : ""}` });
  }

  // ---- AI 2: Outreach (relevant only) ----
  if (l.classify.relevant) {
    const channel = !l.clean.phone && l.clean.email ? "email" : "whatsapp";
    const tone = l.enrich.blocker === "hard" || l.priority?.band === "low" || (l.enrich.intent_category === "exploring" && (l.priority?.score ?? 0) < SCORE.exploringToNurtureBelow) ? "soft" : "direct";
    let feedback: string | undefined;
    let problems: string[] = [];
    for (let attempt = 1; attempt <= OUTREACH.maxRetries + 1; attempt++) {
      try {
        const o = await ai.call({ model: MODELS.worker, system: OUTREACH_SYSTEM, user: outreachUser(l, channel, tone, feedback), toolName: "outreach", schema: OutreachSchema });
        problems = qcOutreach(l, o, channel);
        l.outreach = { channel, subject: o.subject ?? undefined, message: o.message, talking_points: o.talking_points ?? undefined, facts_used: o.facts_used.map((f) => ({ ...f, verified: verifyQuote(l, f.quote) })), attempts: attempt };
        if (!problems.length) break;
        feedback = problems.map((p) => `- ${p}`).join("\n");
      } catch (err) { problems = [`AI error: ${(err as Error).message}`]; }
    }
    l.gates.push({ stage: "outreach", pass: !problems.length, reason: problems.length ? `Failed after retry: ${problems.join("; ")}` : `Passed checks (attempt ${l.outreach?.attempts})` });
  } else {
    l.outreach = { channel: !l.clean.phone && l.clean.email ? "email" : "whatsapp", message: closeOut(l), attempts: 0 };
    l.gates.push({ stage: "outreach", pass: true, reason: "Not a Fit: template close-out (no AI)" });
  }

  // ---- AI 3: Reviewer (blind first, fail closed) ----
  await reviewLead(l, ai);

  l.gates.push({ stage: "human_approval", pass: false, reason: "Waiting for human" });

  // ---- Board column ----
  const failed = cleanFailed || l.gates.some((g) => !g.pass && g.stage !== "human_approval");
  if (!l.classify.relevant) l.column = failed ? "needs_review" : "not_a_fit";
  else if (failed) l.column = "needs_review";
  else if (l.priority?.call_now) l.column = "call_now";
  else if (l.enrich.blocker === "hard" || l.priority?.band === "low" ||
    (l.enrich.intent_category === "exploring" && (l.priority?.score ?? 0) < SCORE.exploringToNurtureBelow)) l.column = "nurture";
  else l.column = "ready";
  return l;
}

export function flagRate(leads: Lead[]) {
  const reviewed = leads.filter((l) => l.review);
  const rate = reviewed.length ? reviewed.filter((l) => l.review!.verdict === "flag").length / reviewed.length : 0;
  return { rate, alert: rate > REVIEW.maxFlagRate };
}

// Reviewer step, exported so seeded-error tests can call it directly.
export async function reviewLead(l: Lead, ai: AIClient) {
  let review: Review;
  try {
    review = await ai.call({ model: MODELS.reviewer, system: REVIEW_SYSTEM, user: reviewUser(l), toolName: "review", schema: ReviewSchema });
  } catch (err) {
    review = { blind: { relevant: l.classify!.relevant, call_now: false, main_objection: "" }, verdict: "flag", issues: [{ stage: "classify", problem: `Reviewer error (fail closed): ${(err as Error).message}`, severity: "high" }] };
  }
  // Calibration rule (from the first real run): the reviewer over-flagged "Call Now" on leads that never asked for a call.
  // A Call Now complaint only blocks if the source actually mentions a call; otherwise it is downgraded to low.
  const askedForCall = /\b(call|callback|phone|ring me)\b/i.test(l.clean.conversation);
  for (const i of review.issues)
    if (i.stage === "prioritize" && /call/i.test(i.problem) && !askedForCall && i.severity === "high") {
      i.severity = "low"; i.problem += " [downgraded by rule: no call request in source]";
    }
  if (review.blind.relevant !== l.classify!.relevant)
    review.issues.push({ stage: "classify", problem: `Blind reviewer judged relevant=${review.blind.relevant}, pipeline said ${l.classify!.relevant}`, severity: "high" });
  if (l.classify!.relevant && review.blind.call_now && !l.priority?.call_now && askedForCall)
    review.issues.push({ stage: "prioritize", problem: "Reviewer thinks this lead needs a call now; pipeline did not flag Call Now", severity: "high" });
  const high = review.issues.some((i) => i.severity === "high");
  l.review = { verdict: high ? "flag" : "approve", blind_verdict: JSON.stringify(review.blind), issues: review.issues };
  l.gates.push({ stage: "ai_review", pass: !high, reason: high ? review.issues.filter((i) => i.severity === "high").map((i) => `${i.stage}: ${i.problem}`).join(" | ") : `Approved${review.issues.length ? ` (${review.issues.length} low-severity notes)` : ""}` });

}
