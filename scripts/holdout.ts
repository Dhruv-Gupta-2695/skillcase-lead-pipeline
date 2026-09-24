// Holdout test: run the pipeline on 10 leads it has never seen and score against answers written beforehand.
import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { intake } from "../lib/clean";
import { processLead } from "../lib/pipeline";
import { getAI } from "../lib/provider";

type Exp = { why: string; columns: string[]; relevant?: boolean; flags?: string[] };
(async () => {
  const expected = JSON.parse(readFileSync("data/holdout-expected.json", "utf8")) as Record<string, Exp>;
  const r = intake(readFileSync("data/holdout-leads.csv", "utf8"));
  if (!r.ok) throw new Error(r.error);
  const ai = getAI();
  const out = [];
  let pass = 0;
  for (const l of r.leads) {
    const res = await processLead(l, ai);
    out.push(res);
    const e = expected[res.lead_id];
    const problems: string[] = [];
    if (!e.columns.includes(res.column)) problems.push(`column ${res.column} (expected ${e.columns.join("/")})`);
    if (e.relevant !== undefined && res.classify && res.classify.relevant !== e.relevant) problems.push(`relevant=${res.classify.relevant}`);
    for (const f of e.flags ?? []) if (!res.classify?.flags.includes(f as never)) problems.push(`missing flag ${f}`);
    if (!problems.length) pass++;
    console.log(`${problems.length ? "MISS" : "PASS"} ${res.lead_id} ${res.column.padEnd(12)} ${e.why}${problems.length ? `  -> ${problems.join("; ")}` : ""}`);
  }
  writeFileSync("data/holdout-results.json", JSON.stringify(out, null, 2));
  console.log(`\nHoldout (unseen leads): ${pass}/${r.leads.length} correct`);
})();
