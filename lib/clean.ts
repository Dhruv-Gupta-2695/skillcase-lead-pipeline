import Papa from "papaparse";
import {
  REQUIRED_COLUMNS, AI_HIDDEN_FIELDS, PHONE_REGEX, EMAIL_REGEX, TRUNCATION, EDUCATION_MAP,
  PROFESSION_NOT_DEGREE, EUROPE, NON_EUROPE, PREFILTER, RUN_DATE,
} from "./config";
import type { CleanFields, Lead } from "./types";

export interface IntakeResult { ok: boolean; error?: string; leads: Lead[] }

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function normEducation(raw: string, tags: string[]) {
  const v = raw.trim();
  if (!v) { tags.push("missing_education"); return { education: "", category: "unknown" as const }; }
  if (PROFESSION_NOT_DEGREE.some((r) => r.test(v))) tags.push("field_type_mismatch:education_is_profession");
  for (const [re, label, cat] of EDUCATION_MAP) if (re.test(v)) return { education: label, category: cat };
  tags.push("unrecognized_education");
  return { education: v, category: "unknown" as const };
}

function normExperience(raw: string, tags: string[]): number | null {
  const v = raw.trim().toLowerCase();
  if (!v) { tags.push("missing_experience"); return null; }
  const m = v.match(/^(\d+(?:\.\d+)?)\s*(years?|yrs?|months?|mos?)?$/);
  if (!m) { tags.push("unparseable_experience"); return null; }
  const n = parseFloat(m[1]);
  if (!m[2]) { tags.push("experience_unit_assumed_years"); return Math.round(n * 12); }
  return m[2].startsWith("m") ? Math.round(n) : Math.round(n * 12);
}

function normGoal(raw: string, tags: string[]) {
  const v = raw.trim().toLowerCase();
  if (!v) { tags.push("missing_goal"); return { destination: null, goal_type: "unknown" as const }; }
  const dest =
    [...EUROPE, ...NON_EUROPE].find((c) => new RegExp(`\\b${c}\\b`).test(v)) ?? null;
  const destination = dest ? (dest.length <= 3 ? dest.toUpperCase() : titleCase(dest))
    : /abroad/.test(v) ? "Abroad (unspecified)" : null;
  const goal_type = /prep|course|practice|exam/.test(v) ? "course"
    : /explore|option|checking/.test(v) ? "exploring"
    : /work|move|job|settle/.test(v) || dest ? "placement" : "unknown";
  if (!destination) tags.push("destination_unspecified");
  return { destination, goal_type: goal_type as CleanFields["goal_type"] };
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

function checkTruncation(field: string, text: string, tags: string[]) {
  if (!text) return;
  const t = text.trim();
  if (!TRUNCATION.terminalPunctuation.test(t)) tags.push(`possible_truncation:${field}`);
  if (TRUNCATION.suspiciousLengths.includes(t.length)) tags.push(`suspicious_length:${field}`);
}

export function intake(csvText: string): IntakeResult {
  const parsed = Papa.parse<Record<string, string>>(csvText.trim(), { header: true, skipEmptyLines: true });
  const header = parsed.meta.fields ?? [];
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) return { ok: false, error: `Missing columns: ${missing.join(", ")}`, leads: [] };
  if (!parsed.data.length) return { ok: false, error: "File has no rows", leads: [] };

  const badRows = new Set(parsed.errors.filter((e) => e.row !== undefined).map((e) => e.row));

  const leads: Lead[] = parsed.data.map((raw, i) => {
    const row: Record<string, string> = {};
    for (const k of header) row[k] = (raw[k] ?? "").trim(); // trim every field

    const source: Record<string, string> = { ...row };
    for (const h of AI_HIDDEN_FIELDS) delete source[h];

    const tags: string[] = [];
    const { education, category } = normEducation(row.education, tags);
    const { destination, goal_type } = normGoal(row.goal, tags);
    const phone = row.phone.replace(/[\s-]/g, "") || null;
    const email = row.email.toLowerCase() || null;
    if (!email) tags.push("missing_email");
    else if (!EMAIL_REGEX.test(email)) tags.push("invalid_email");
    if (!phone) tags.push("missing_phone");
    else if (!PHONE_REGEX.test(phone)) tags.push("invalid_phone");
    const lvl = row.german_level.toUpperCase().match(/^(A1|A2|B1|B2|C1|C2)$/)?.[1] ?? null;
    if (!lvl) tags.push(row.german_level ? "invalid_german_level" : "missing_german_level");
    const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(row.last_contacted) && !isNaN(Date.parse(row.last_contacted));
    if (!dateOk) tags.push("invalid_or_missing_date");
    if (row.name && row.name === row.name.toUpperCase()) tags.push("name_case_normalized");
    checkTruncation("conversation", row.conversation, tags);
    if (!row.conversation) tags.push("empty_conversation");
    if (badRows.has(i)) tags.push("column_count_mismatch");

    const name = titleCase(row.name);
    const clean: CleanFields = {
      name, first_name: name.split(/\s+/)[0] ?? "",
      phone: phone && PHONE_REGEX.test(phone) ? phone : null,
      email: email && EMAIL_REGEX.test(email) ? email : null,
      city: titleCase(row.city), education, education_category: category,
      experience_months: normExperience(row.experience, tags),
      destination, goal_type, german_level: lvl, source_channel: row.source,
      last_contacted: dateOk ? row.last_contacted : null,
      days_since_contact: dateOk ? daysBetween(row.last_contacted, RUN_DATE) : null,
      conversation: row.conversation, tags, merged_ids: [],
      prefilter: { not_a_fit: false, reason: null },
    };

    // Rule-based pre-filter on structured fields only (AI double-checks later)
    if (PREFILTER.nonEuropeDestination && destination && NON_EUROPE.includes(destination.toLowerCase()))
      clean.prefilter = { not_a_fit: true, reason: `Target country is ${destination} (outside Europe)` };
    else if (PREFILTER.nonHealthcareEducation && category === "non_healthcare")
      clean.prefilter = { not_a_fit: true, reason: `Non-healthcare background (${row.education})` };

    return {
      lead_id: row.lead_id, source, human_note: row.notes, clean,
      gates: [{ stage: "intake", pass: !badRows.has(i), reason: badRows.has(i) ? "Column count mismatch" : "Row parsed" }],
      column: "ready",
    } as Lead;
  });

  dedupe(leads);

  for (const l of leads) {
    if (l.column === "merged") continue;
    const blockers: string[] = [];
    if (!l.clean.phone && !l.clean.email) blockers.push("no valid phone or email");
    if (l.clean.tags.includes("empty_conversation")) blockers.push("empty conversation");
    if (l.clean.tags.some((t) => t.startsWith("possible_truncation") || t.startsWith("suspicious_length"))) blockers.push("conversation may be truncated");
    if (l.clean.tags.includes("column_count_mismatch")) blockers.push("column count mismatch");
    if (l.clean.tags.includes("needs_review:possible_duplicate")) blockers.push("possible duplicate (partial match, different name)");
    if (blockers.length) { l.column = "needs_review"; l.gates.push({ stage: "clean", pass: false, reason: blockers.join("; ") }); }
    else if (l.clean.prefilter.not_a_fit) { l.column = "not_a_fit"; l.gates.push({ stage: "clean", pass: true, reason: `Rule pre-filter: ${l.clean.prefilter.reason}` + (l.clean.tags.length ? ` | tags: ${l.clean.tags.join(", ")}` : "") }); }
    else l.gates.push({ stage: "clean", pass: true, reason: l.clean.tags.length ? `Passed with tags: ${l.clean.tags.join(", ")}` : "Clean" });
  }
  return { ok: true, leads };
}

// Duplicates: both phone+email match -> auto-merge into earliest lead.
// Only one matches and first names differ -> needs review.
function dedupe(leads: Lead[]) {
  const completeness = (l: Lead) => Object.values(l.source).filter(Boolean).length;
  for (let i = 0; i < leads.length; i++) {
    const a = leads[i];
    if (a.column === "merged") continue;
    for (let j = i + 1; j < leads.length; j++) {
      const b = leads[j];
      if (b.column === "merged") continue;
      const phoneMatch = !!a.clean.phone && a.clean.phone === b.clean.phone;
      const emailMatch = !!a.clean.email && a.clean.email === b.clean.email;
      if (phoneMatch && emailMatch) {
        // keep the earliest id; fill gaps from the duplicate
        for (const k of Object.keys(a.source)) if (!a.source[k] && b.source[k]) a.source[k] = b.source[k];
        if (completeness(b) > completeness(a)) a.clean.tags.push(`duplicate_${b.lead_id}_was_more_complete`);
        a.clean.merged_ids.push(b.lead_id);
        b.column = "merged"; b.duplicate_of = a.lead_id;
        b.gates.push({ stage: "clean", pass: false, reason: `Duplicate of ${a.lead_id} (phone + email match)` });
      } else if (phoneMatch || emailMatch) {
        const sameFirst = a.clean.first_name.toLowerCase() === b.clean.first_name.toLowerCase();
        if (!sameFirst) {
          for (const l of [a, b]) l.clean.tags.push("needs_review:possible_duplicate");
        } else {
          a.clean.merged_ids.push(b.lead_id);
          b.column = "merged"; b.duplicate_of = a.lead_id;
          b.gates.push({ stage: "clean", pass: false, reason: `Duplicate of ${a.lead_id} (${phoneMatch ? "phone" : "email"} + first name match)` });
        }
      }
    }
  }
}
