// Final dataset: data/results.json -> data/final-leads.csv (all 30 rows, one per lead, readable in Excel/Sheets)
import { readFileSync, writeFileSync } from "fs";
import { sourcesForLead } from "../lib/knowledge";
import type { Lead, Claim } from "../lib/types";

const { leads, run_date } = JSON.parse(readFileSync("data/results.json", "utf8")) as { leads: Lead[]; run_date: string };
const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const claims = (cs?: Claim[]) => (cs ?? []).map((c) => c.text).filter(Boolean).join("; ");
const COLUMN_LABEL: Record<string, string> = { call_now: "Call now", needs_review: "Needs review", ready: "Ready", nurture: "Nurture", not_a_fit: "Not a fit", merged: "Merged duplicate" };

const header = ["Lead ID", "Name", "Phone", "Email", "City", "Board Column", "Duplicate Of", "Relevant", "Reason", "Confidence",
  "Flags", "Profile", "Intent", "Needs", "Objections", "Missing Information", "Opportunity", "Priority Score", "Priority",
  "Call Now", "Priority Reasons", "Next Action", "Outreach Channel", "Outreach", "Call Talking Points", "AI Review", "Review Issues",
  "Public Sources Used", "Data Quality Tags", "Gates Failed", "Sales Note (not seen by AI)"];

const rows = leads.map((l) => {
  const kb = sourcesForLead(l).map((k) => `${k.id}: ${k.source} ${k.url}`).join("; ");
  const merged = l.column === "merged";
  return [l.lead_id, l.clean.name, l.clean.phone, l.clean.email, l.clean.city, COLUMN_LABEL[l.column] ?? l.column, l.duplicate_of,
    merged ? "" : l.classify ? (l.classify.relevant ? "Relevant" : "Not relevant") : "Not processed",
    merged ? `Duplicate of ${l.duplicate_of}` : l.classify?.reason.text, l.classify?.confidence?.toFixed(2),
    l.classify?.flags.join("; "), claims(l.enrich?.profile), l.enrich?.intent.text, claims(l.enrich?.needs),
    (l.enrich?.objections ?? []).map((o) => `${o.type}: ${o.text}`).join("; "), l.enrich?.missing_info.join("; "),
    l.enrich?.opportunity.text, l.priority?.score, l.priority?.band, l.priority?.call_now ? "Yes" : "", l.priority?.reasons.join("; "),
    l.enrich?.next_step, l.outreach?.channel, l.outreach?.message, l.outreach?.talking_points?.join("; "), l.review?.verdict,
    l.review?.issues.map((i) => `${i.severity}: ${i.problem}`).join("; "), kb, l.clean.tags.join("; "),
    l.gates.filter((g) => !g.pass && g.stage !== "human_approval").map((g) => `${g.stage}: ${g.reason}`).join(" | "), l.human_note];
});
writeFileSync("data/final-leads.csv", [header, ...rows].map((r) => r.map(esc).join(",")).join("\n"));
console.log(`Wrote data/final-leads.csv: ${rows.length} rows (run date ${run_date})`);
