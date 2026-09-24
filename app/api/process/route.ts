import { processLead } from "@/lib/pipeline";
import { getAI } from "@/lib/provider";
import type { Lead } from "@/lib/types";

export const maxDuration = 60; // one lead per request keeps each call under Vercel's function limit

// Steps 2-6 for ONE lead: Classify+Enrich -> Prioritize -> Outreach -> AI Review.
export async function POST(req: Request) {
  const passcode = process.env.DEMO_PASSCODE;
  if (passcode && req.headers.get("x-demo-passcode") !== passcode)
    return Response.json({ error: "Live runs need the demo passcode." }, { status: 401 });
  const lead = (await req.json()) as Lead;
  if (!lead?.lead_id || !lead.clean) return Response.json({ error: "Invalid lead payload" }, { status: 400 });
  try {
    return Response.json(await processLead(lead, getAI()));
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
