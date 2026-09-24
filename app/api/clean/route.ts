import { intake } from "@/lib/clean";

// Step 1 (no AI): parse, validate, normalize, dedupe, rule pre-filter.
export async function POST(req: Request) {
  const csv = await req.text();
  if (csv.length > 2_000_000) return Response.json({ ok: false, error: "File too large (max 2 MB)" }, { status: 413 });
  const result = intake(csv);
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
