import { z } from "zod";

const claim = z.object({
  text: z.string().describe("The claim in plain words"),
  quote: z.string().describe("Exact text copied from the lead's row that supports the claim, or KB:<id> for a knowledge-base fact"),
});

export const FLAGS = ["qualification_check", "readiness", "role_fit_check", "market_check", "expectation_risk"] as const;
export const OBJECTION_TYPES = ["price", "eligibility", "timeline", "confidence", "lack_of_info", "expectation"] as const;

// AI 1: Classify + Enrich (one call)
export const AnalysisSchema = z.object({
  relevant: z.boolean(),
  reason: claim,
  confidence: z.number().min(0).max(1),
  track: z.enum(["placement", "course_only"]),
  flags: z.array(z.enum(FLAGS)),
  german_certified: z.boolean().describe("true ONLY if the row explicitly says the lead holds a certificate / is certified"),
  profile: z.array(claim),
  intent_category: z.enum(["ready_or_call_requested", "asked_jobs_or_process", "exploring"]),
  intent: claim,
  needs: z.array(claim),
  objections: z.array(claim.extend({ type: z.enum(OBJECTION_TYPES) })),
  missing_info: z.array(z.string()),
  opportunity: claim,
  next_step: z.string(),
  call_requested: claim.nullable().describe("Only if the lead explicitly asked for a call"),
  blocker: z.enum(["none", "soft", "hard"]).describe("hard = cannot proceed now (e.g. cannot afford now); soft = worry/question"),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

// AI 2: Outreach
export const OutreachSchema = z.object({
  subject: z.string().nullable().describe("Email subject; null for WhatsApp"),
  message: z.string(),
  talking_points: z.array(z.string()).nullable().describe("3 bullets for Call Now leads, else null"),
  facts_used: z.array(z.object({ fact: z.string(), quote: z.string() })).describe("Lead-specific facts used, each with exact supporting quote"),
});
export type Outreach = z.infer<typeof OutreachSchema>;

// AI 3: Reviewer (blind first, then compare)
export const ReviewSchema = z.object({
  blind: z.object({
    relevant: z.boolean(),
    call_now: z.boolean(),
    main_objection: z.string(),
  }).describe("Your own judgement formed from the source row ONLY, before looking at the pipeline output"),
  verdict: z.enum(["approve", "flag"]),
  issues: z.array(z.object({
    stage: z.enum(["classify", "enrich", "prioritize", "outreach"]),
    problem: z.string(),
    severity: z.enum(["low", "high"]).describe("high = would cause a wrong action or harm (wrong relevance, false promise, wrong name, missed Call Now); low = style"),
  })),
});
export type Review = z.infer<typeof ReviewSchema>;

export const toolSchema = (s: z.ZodTypeAny) => {
  const { $schema, ...rest } = z.toJSONSchema(s) as Record<string, unknown>;
  return rest;
};
