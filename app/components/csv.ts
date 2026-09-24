import type { Lead } from "@/lib/types";
import type { HumanAction } from "./Drawer";

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// approvedOnly = HubSpot-importable list of leads a person approved; otherwise a full audit trail of every row.
export function toCsv(leads: Lead[], human: Record<string, HumanAction>, approvedOnly: boolean) {
  const rows = leads.filter((l) => {
    if (!approvedOnly) return true;
    const h = human[l.lead_id];
    return !!h && h.action !== "reject" && !(h.action === "override" && h.override === "not_relevant");
  });
  const header = approvedOnly
    ? ["First Name", "Last Name", "Phone Number", "Email", "City", "Lifecycle Stage", "Lead Status", "Priority Score", "Priority Band",
       "Call Now", "Education", "German Level", "Intent", "Objections", "Missing Info", "Next Step", "Flags", "Outreach Channel",
       "Outreach Message", "Approved By", "Approved At", "Human Action", "Human Reason", "Lead ID"]
    : ["lead_id", "board_column", "duplicate_of", "relevant", "confidence", "reason", "flags", "score", "band", "call_now",
       "intent", "objections", "missing_info", "next_step", "outreach", "reviewer_verdict", "reviewer_issues", "human_action",
       "human_reason", "human_reviewer", "sales_note", "gates"];
  const out = rows.map((l) => {
    const h = human[l.lead_id];
    const [first, ...rest] = l.clean.name.split(" ");
    const msg = h?.edited_message ?? l.outreach?.message ?? "";
    return approvedOnly
      ? [first, rest.join(" "), l.clean.phone, l.clean.email, l.clean.city, "lead",
         l.priority?.call_now ? "Call now" : h?.override ? h.override : "Open", l.priority?.score, l.priority?.band,
         l.priority?.call_now ? "yes" : "no", l.clean.education, l.clean.german_level, l.enrich?.intent.text,
         l.enrich?.objections.map((o) => o.type).join("; "), l.enrich?.missing_info.join("; "), l.enrich?.next_step,
         l.classify?.flags.join("; "), l.outreach?.channel, msg, h?.reviewer, h?.timestamp, h?.action, h?.reason, l.lead_id]
      : [l.lead_id, l.column, l.duplicate_of, l.classify?.relevant, l.classify?.confidence, l.classify?.reason.text,
         l.classify?.flags.join("; "), l.priority?.score, l.priority?.band, l.priority?.call_now, l.enrich?.intent.text,
         l.enrich?.objections.map((o) => `${o.type}: ${o.text}`).join("; "), l.enrich?.missing_info.join("; "), l.enrich?.next_step,
         msg, l.review?.verdict, l.review?.issues.map((i) => `${i.severity}/${i.stage}: ${i.problem}`).join("; "),
         h?.action, h?.reason, h?.reviewer, l.human_note, l.gates.map((g) => `${g.pass ? "PASS" : "FAIL"} ${g.stage}: ${g.reason}`).join(" || ")];
  });
  return [header, ...out].map((r) => r.map(esc).join(",")).join("\n");
}

export function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
