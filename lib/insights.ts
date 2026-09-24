// Deduced, actionable insights for the salesperson. Pure code over pipeline output: no extra AI calls.
import type { Lead } from "./types";

export interface Insight { id: string; tone: "urgent" | "action" | "info"; text: string; leadIds: string[] }

const ADVICE: Record<string, string> = {
  price: "Prepare payment-option answers before calling.",
  confidence: "Lead with a structured, step-by-step learning path.",
  eligibility: "Keep the recognition checklist ready.",
  timeline: "Prepare realistic timeline ranges.",
  expectation: "Be clear on what is and isn't included.",
  lack_of_info: "Send the full process overview first.",
};
const LABEL: Record<string, string> = {
  price: "Price", confidence: "Confidence about learning German", eligibility: "Eligibility",
  timeline: "Timeline", expectation: "Expectations", lack_of_info: "Lack of information",
};
const first = (l: Lead) => l.clean.first_name;

export function buildInsights(leads: Lead[], isDone: (id: string) => boolean): Insight[] {
  const live = leads.filter((l) => l.column !== "merged");
  const relevant = live.filter((l) => l.classify?.relevant);
  const out: Insight[] = [];

  // 1. Overdue callbacks
  const calls = relevant.filter((l) => l.priority?.call_now && !isDone(l.lead_id))
    .sort((a, b) => (b.clean.days_since_contact ?? 0) - (a.clean.days_since_contact ?? 0));
  if (calls.length)
    out.push({ id: "calls", tone: "urgent", leadIds: calls.map((l) => l.lead_id),
      text: `${calls.length} promised callback${calls.length > 1 ? "s are" : " is"} overdue (${calls.map((l) => `${first(l)}, ${l.clean.days_since_contact} days`).join("; ")}). Call ${calls.length > 1 ? "them" : "them"} first.` });

  // 2. Review queue
  const review = live.filter((l) => l.column === "needs_review" && !isDone(l.lead_id));
  if (review.length)
    out.push({ id: "review", tone: "action", leadIds: review.map((l) => l.lead_id),
      text: `${review.length} lead${review.length > 1 ? "s need" : " needs"} your decision before the system can proceed.` });

  // 3. Most common objection
  const byType = new Map<string, Lead[]>();
  for (const l of relevant) for (const t of new Set(l.enrich?.objections.map((o) => o.type))) byType.set(t, [...(byType.get(t) ?? []), l]);
  const top = [...byType.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (top && top[1].length >= 2)
    out.push({ id: "objection", tone: "action", leadIds: top[1].map((l) => l.lead_id),
      text: `${LABEL[top[0]] ?? top[0]} is the most common concern (${top[1].length} leads). ${ADVICE[top[0]] ?? ""}` });

  // 4. German readiness (the product opportunity)
  const b2 = relevant.filter((l) => ["B2", "C1", "C2"].includes(l.clean.german_level ?? ""));
  const below = relevant.filter((l) => !["B2", "C1", "C2"].includes(l.clean.german_level ?? ""));
  if (relevant.length)
    out.push({ id: "german", tone: "info", leadIds: below.map((l) => l.lead_id),
      text: `Only ${b2.length} of ${relevant.length} relevant leads have B2, the level Germany requires for nurse recognition (Make it in Germany). For the other ${below.length}, the German course is the main offer.` });

  // 5. Missing information to collect
  const noLevel = relevant.filter((l) => !l.clean.german_level);
  const noExp = relevant.filter((l) => l.clean.experience_months === null);
  const missing = [...new Set([...noLevel, ...noExp])];
  if (missing.length)
    out.push({ id: "missing", tone: "action", leadIds: missing.map((l) => l.lead_id),
      text: `${missing.length} lead${missing.length > 1 ? "s haven't" : " hasn't"} shared ${noLevel.length && noExp.length ? "their German level or experience" : noLevel.length ? "their German level" : "their experience"}. Ask on first contact; their score is incomplete until then.` });

  // 6. Best source (highest average score, at least 2 scored leads)
  const bySrc = new Map<string, number[]>();
  for (const l of relevant) if (l.priority) bySrc.set(l.clean.source_channel, [...(bySrc.get(l.clean.source_channel) ?? []), l.priority.score]);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const all = relevant.filter((l) => l.priority).map((l) => l.priority!.score);
  const best = [...bySrc.entries()].filter(([, s]) => s.length >= 2).sort((a, b) => avg(b[1]) - avg(a[1]))[0];
  if (best && all.length)
    out.push({ id: "source", tone: "info", leadIds: relevant.filter((l) => l.clean.source_channel === best[0]).map((l) => l.lead_id),
      text: `${best[0]} leads score highest (average ${Math.round(avg(best[1]))} vs ${Math.round(avg(all))} overall). Worth prioritising that channel.` });

  return out;
}
