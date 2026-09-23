// All tunable rules live here. Changing a rule = editing one line.

export const REQUIRED_COLUMNS = [
  "lead_id", "name", "phone", "email", "city", "education", "experience",
  "goal", "german_level", "source", "last_contacted", "conversation", "notes",
];

// Fields hidden from every AI step
export const AI_HIDDEN_FIELDS = ["notes"];

export const PHONE_REGEX = /^\+91[6-9]\d{9}$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Truncation validator
export const TRUNCATION = {
  terminalPunctuation: /[.!?)"']$/,
  suspiciousLengths: [100, 255, 500, 1000],
};

// Education normalization: pattern -> [normalized label, category]
export type EduCategory = "nursing_degree" | "nursing_diploma" | "allied_health" | "non_healthcare" | "unknown";
export const EDUCATION_MAP: Array<[RegExp, string, EduCategory]> = [
  [/^b\.?\s?sc\.?\s*nursing$/i, "BSc Nursing", "nursing_degree"],
  [/^m\.?\s?sc\.?\s*nursing$/i, "MSc Nursing", "nursing_degree"],
  [/^gnm$/i, "GNM", "nursing_diploma"],
  [/^anm$/i, "ANM", "nursing_diploma"],
  [/^b\.?\s?pharm/i, "BPharm", "allied_health"],
  [/physio|bpt/i, "Physiotherapy", "allied_health"],
  [/lab tech|mlt|dmlt/i, "Lab Technician", "allied_health"],
  [/^bba$|^mba$|^b\.?com/i, "Business", "non_healthcare"],
  [/engineer|b\.?tech|b\.?e\.?$/i, "Engineering", "non_healthcare"],
];
// Values that are professions, not degrees -> field_type_mismatch tag
export const PROFESSION_NOT_DEGREE = [/^engineer$/i, /^nurse$/i, /^pharmacist$/i];

// Destinations
export const EUROPE = ["germany", "uk", "united kingdom", "ireland", "netherlands", "austria", "switzerland", "france", "belgium", "europe"];
export const NON_EUROPE = ["canada", "usa", "us", "united states", "australia", "new zealand", "uae", "dubai", "saudi", "qatar", "singapore"];

// Rule-based "obvious irrelevant" pre-filter (structured fields only)
export const PREFILTER = {
  nonEuropeDestination: true,
  nonHealthcareEducation: true,
};

// Classification
export const CLASSIFY = {
  passConfidence: 0.7,
  capIfKeyFieldMissing: 0.6, // education or goal missing
  capIfFlagged: 0.8,
};

// Prioritization weights
export const SCORE = {
  intent: { ready_or_call_requested: 35, asked_jobs_or_process: 25, exploring: 10 },
  german: { B2: 20, C1: 20, C2: 20, B1: 12, A2: 6, A1: 3, unknown: 4, certifiedBonus: 5 },
  eligibility: { strong: 20, conditional: 10, unknown: 5 },
  recency: { within3: 10, within7: 6, older: 2 },
  blockers: { none: 10, soft: 5, hard: 0 },
  bands: { high: 70, medium: 45 },
  exploringToNurtureBelow: 70, // 'just exploring' leads go to Nurture unless they score High
  hardBlockerPattern: /can.?t afford|cannot afford|not able to (pay|afford)|no budget|can.?t pay/i,
};

// Outreach
export const OUTREACH = {
  maxWords: { whatsapp: 80, email: 150 },
  minLeadFacts: 2,
  maxRetries: 1,
  bannedPhrases: [/guarantee/i, /\bassured\b/i, /100\s?%/, /\bsurely\b/i, /\bdefinitely get\b/i, /₹\s?\d/, /\brs\.?\s?\d/i, /\binr\b/i, /\beuro?s?\s?\d/i, /€\s?\d/, /salary of/i],
};

// AI models (change here to swap)
export const PROVIDER = (process.env.LLM_PROVIDER ?? "gemini") as "gemini" | "anthropic";
const MODEL_SETS = {
  // Free tier: Flash-Lite models have the largest daily quota. Reviewer is a different model version for independence.
  gemini: { worker: process.env.WORKER_MODEL ?? "gemini-3.5-flash-lite", reviewer: process.env.REVIEWER_MODEL ?? "gemini-3.1-flash-lite", minDelayMs: 4500 },
  anthropic: { worker: "claude-sonnet-5", reviewer: "claude-haiku-4-5-20251001", minDelayMs: 0 },
};
export const MODELS = { ...MODEL_SETS[PROVIDER], temperature: 0 };

export const REVIEW = { maxFlagRate: 0.3 };

// Run date used for recency / overdue logic. Override for reproducible runs.
export const RUN_DATE = process.env.RUN_DATE ?? new Date().toISOString().slice(0, 10);
