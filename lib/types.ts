import type { EduCategory } from "./config";

export type StageName =
  | "intake" | "clean" | "classify" | "enrich" | "prioritize" | "outreach" | "ai_review" | "human_approval";

export type Column = "call_now" | "needs_review" | "ready" | "nurture" | "not_a_fit" | "merged" | "approved";

export interface Gate { stage: StageName; pass: boolean; reason: string }

export type SourceRow = Record<string, string>; // original row, notes removed

export interface CleanFields {
  name: string;
  first_name: string;
  phone: string | null;
  email: string | null;
  city: string;
  education: string;
  education_category: EduCategory;
  experience_months: number | null;
  destination: string | null;       // Germany, Canada, UK, Abroad (unspecified), null
  goal_type: "placement" | "course" | "exploring" | "unknown";
  german_level: string | null;       // A1..C2
  source_channel: string;
  last_contacted: string | null;
  days_since_contact: number | null;
  conversation: string;
  tags: string[];                    // missing_email, field_type_mismatch, ...
  merged_ids: string[];
  prefilter: { not_a_fit: boolean; reason: string | null };
}

export interface Claim { text: string; quote: string; verified?: boolean }

export interface Lead {
  lead_id: string;
  source: SourceRow;
  human_note: string;       // never sent to AI
  clean: CleanFields;
  classify?: {
    relevant: boolean; reason: Claim; confidence: number; confidence_raw: number;
    track: "placement" | "course_only"; flags: string[];
  };
  enrich?: {
    profile: Claim[]; intent_category: "ready_or_call_requested" | "asked_jobs_or_process" | "exploring";
    intent: Claim; needs: Claim[]; objections: Array<Claim & { type: string }>;
    missing_info: string[]; opportunity: Claim; next_step: string;
    german_certified: boolean; call_requested: Claim | null;
    blocker: "none" | "soft" | "hard"; knowledge_refs: string[];
  };
  priority?: { score: number; band: "high" | "medium" | "low"; reasons: string[]; call_now: boolean; incomplete: boolean };
  outreach?: { channel: "whatsapp" | "email"; subject?: string; message: string; talking_points?: string[]; facts_used?: Array<{ fact: string; quote: string; verified: boolean }>; attempts: number };
  review?: { verdict: "approve" | "flag"; blind_verdict?: string; issues: Array<{ stage: string; problem: string; severity: "low" | "high" }> };
  human?: { action: "approve" | "edit_approve" | "override" | "reject"; reason?: string; reviewer: string; timestamp: string };
  gates: Gate[];
  column: Column;
  duplicate_of?: string;
}
