import { KNOWLEDGE } from "./knowledge";
import { CLASSIFY, EUROPE, NON_EUROPE, OUTREACH, SCORE } from "./config";
import type { Claim, Lead } from "./types";
import type { Analysis, Outreach } from "./schemas";

const norm = (s: string) => s.toLowerCase().replace(/[“”"'’]/g, "").replace(/[^a-z0-9% ]/g, " ").replace(/\s+/g, " ").trim();

// Does the quote really exist in this lead's row (or is it a valid KB citation)?
// Accepts plain text ("worried about cost"), field-style ("education: GNM") and multi-part ("a; b") quotes.
export function verifyQuote(l: Lead, quote: string): boolean {
  const q = quote.trim();
  if (!q) return false;
  if (/^KB:/i.test(q)) return KNOWLEDGE.some((k) => `KB:${k.id}`.toLowerCase() === q.toLowerCase());
  const parts = q.split(/\s*;\s*|\s*\|\s*/).filter(Boolean);
  const fieldLines = Object.entries(l.source).map(([k, v]) => norm(`${k}: ${v}`));
  const values = norm(Object.values(l.source).join(" | "));
  return parts.every((part) => {
    const m = part.match(/^([a-z_]+)\s*:\s*(.+)$/i);
    if (m && m[1].toLowerCase() in l.source) {
      // field-style quote: the value must appear in THAT field
      return norm(l.source[m[1].toLowerCase()] ?? "").includes(norm(m[2]));
    }
    const n = norm(part);
    return n.length >= 2 && (values.includes(n) || fieldLines.some((f) => f.includes(n)));
  });
}

export interface QCResult { issues: string[]; removed: number }

// Classify: code rules always win over the AI.
export function qcClassify(l: Lead, a: Analysis) {
  const issues: string[] = [];
  const flags = new Set(a.flags);
  const c = l.clean;

  // Hard rules
  let ruleRelevant: boolean | null = null;
  if (c.education_category === "non_healthcare") ruleRelevant = false;
  if (c.destination && NON_EUROPE.includes(c.destination.toLowerCase())) ruleRelevant = false;
  const conflict = ruleRelevant === false && a.relevant;
  if (conflict) issues.push(`AI says Relevant but rule says Not a Fit (${c.prefilter.reason ?? "hard rule"})`);

  // Flags the AI must not miss (added by rule if missing)
  const must: Array<[boolean, (typeof a.flags)[number]]> = [
    [c.education_category === "nursing_diploma", "qualification_check"],
    [c.experience_months !== null && c.experience_months < 12, "readiness"],
    [c.education_category === "allied_health", "role_fit_check"],
    [!!c.destination && EUROPE.includes(c.destination.toLowerCase()) && c.destination.toLowerCase() !== "germany", "market_check"],
  ];
  for (const [cond, f] of must) if (cond && !flags.has(f)) { flags.add(f); issues.push(`Flag "${f}" added by rule (AI missed it)`); }

  // Rule and AI agree it's Not a Fit -> confident, no caps; market_check only applies to European targets
  if (ruleRelevant === false && !a.relevant) {
    flags.delete("market_check");
    const reasonOk = verifyQuote(l, a.reason.quote);
    if (!reasonOk) issues.push(`Reason quote not found in source: "${a.reason.quote}"`);
    return { relevant: false, confidence: Math.max(a.confidence, 0.95), flags: [...flags], pass: reasonOk, conflict: false, issues: [...issues, "AI agrees with hard rule"] };
  }
  // Confidence caps
  let conf = a.confidence;
  if (!c.education || c.goal_type === "unknown") conf = Math.min(conf, CLASSIFY.capIfKeyFieldMissing);
  if (flags.size) conf = Math.min(conf, CLASSIFY.capIfFlagged);
  if (flags.has("market_check")) conf = Math.min(conf, CLASSIFY.capIfKeyFieldMissing);

  const reasonOk = verifyQuote(l, a.reason.quote);
  if (!reasonOk) issues.push(`Reason quote not found in source: "${a.reason.quote}"`);

  const relevant = ruleRelevant === false ? false : a.relevant;
  const pass = !conflict && reasonOk && conf >= CLASSIFY.passConfidence;
  return { relevant, confidence: conf, flags: [...flags], pass, conflict, issues };
}

// Enrich: every claim must be backed by a real quote; contradictions are caught.
export function qcEnrich(l: Lead, a: Analysis) {
  const issues: string[] = [];
  let removed = 0;
  const keep = (cl: Claim, label: string) => {
    const ok = verifyQuote(l, cl.quote);
    if (!ok) { removed++; issues.push(`${label}: unsupported claim removed — "${cl.text}" (quote not in source: "${cl.quote}")`); }
    return ok;
  };
  const profile = a.profile.filter((c) => keep(c, "profile"));
  const needs = a.needs.filter((c) => keep(c, "needs"));
  const objections = a.objections.filter((c) => keep(c, "objection"));
  const intentOk = keep(a.intent, "intent");
  const oppOk = keep(a.opportunity, "opportunity");
  const callReq = a.call_requested && keep(a.call_requested, "call_requested") ? a.call_requested : null;

  // Contradiction: certified claim vs source
  const conv = l.clean.conversation.toLowerCase();
  let certified = a.german_certified;
  const examNotTaken = /hasn.?t taken|not taken|without (the )?exam/.test(conv);
  if (certified && !/certif/.test(conv) && !examNotTaken) {
    certified = false;
    issues.push(`Contradiction: AI marked German as certified, but the source never mentions a certificate`);
  }
  if (examNotTaken && a.german_certified) {
    certified = false;
    issues.push(`Contradiction: source says exam not taken — German level stored as claimed, not certified`);
  }
  // Contradiction: a profile claim naming a different CEFR level than the structured field
  const lvl = l.clean.german_level;
  for (const p of profile) {
    const m = p.text.match(/\b(A1|A2|B1|B2|C1|C2)\b/);
    if (m && lvl && m[1] !== lvl && !/goal|target|prepar|aim/i.test(p.text))
      issues.push(`Contradiction: profile says ${m[1]} but german_level field is ${lvl}`);
  }
  // Hard blocker must be evidenced by an objection quote; rule upgrades obvious hard blockers the AI called soft
  let blocker = a.blocker;
  const hardEvidence = objections.find((o) => SCORE.hardBlockerPattern.test(`${o.text} ${o.quote}`)) ?? (SCORE.hardBlockerPattern.test(conv) ? true : null);
  if (blocker !== "hard" && hardEvidence) { blocker = "hard"; issues.push(`Blocker upgraded to hard by rule (source says the lead cannot afford it now)`); }
  if (blocker === "hard" && !objections.length) { blocker = "soft"; issues.push("Hard blocker downgraded: no verified objection supports it"); }

  const pass = removed <= 2 && !issues.some((i) => i.startsWith("Contradiction: profile"));
  return {
    pass, issues, removed,
    enrich: {
      profile, needs, objections, intent: intentOk ? a.intent : { text: a.intent.text, quote: "", verified: false },
      intent_category: intentOk ? a.intent_category : "exploring" as const,
      missing_info: a.missing_info, opportunity: oppOk ? a.opportunity : { text: "", quote: "" },
      next_step: a.next_step, german_certified: certified, call_requested: callReq, blocker,
      knowledge_refs: [a.reason, a.opportunity, ...a.profile].map((c) => c.quote).filter((q) => /^KB:/i.test(q)),
    },
  };
}

// Outreach checks
export function qcOutreach(l: Lead, o: Outreach, channel: "whatsapp" | "email") {
  const problems: string[] = [];
  const text = `${o.subject ?? ""} ${o.message} ${(o.talking_points ?? []).join(" ")}`;
  for (const re of OUTREACH.bannedPhrases) {
    if (re.source === "guarantee") {
      // Honest negations are allowed ("no one can promise a guaranteed outcome"); affirmative promises are not.
      const bad = [...text.matchAll(/guarantee\w*/gi)].some((m) => !/(no one|nobody|can.?t|cannot|not|never|no|without)\b[\w\s,]{0,30}$/i.test(text.slice(Math.max(0, m.index! - 40), m.index)));
      if (bad) problems.push(`Banned phrase: affirmative "guarantee"`);
    } else if (re.test(text)) problems.push(`Banned phrase matched ${re}`);
  }
  const words = o.message.trim().split(/\s+/).length;
  if (words > OUTREACH.maxWords[channel]) problems.push(`Too long: ${words} words (max ${OUTREACH.maxWords[channel]})`);
  if (!o.message.includes(l.clean.first_name)) problems.push(`Lead's first name "${l.clean.first_name}" not used`);
  const verified = o.facts_used.filter((f) => !/^KB:/i.test(f.quote) && verifyQuote(l, f.quote)); // KB facts don't count as lead-specific
  if (verified.length < OUTREACH.minLeadFacts) problems.push(`Only ${verified.length} verified lead-specific facts (need ${OUTREACH.minLeadFacts})`);
  if (channel === "email" && !o.subject) problems.push("Email needs a subject line");
  if (l.priority?.call_now && (o.talking_points?.length ?? 0) !== 3) problems.push("Call Now lead needs exactly 3 talking points");
  return problems;
}
