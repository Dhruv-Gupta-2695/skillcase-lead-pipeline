import "dotenv/config";
// Full run: CSV -> Clean -> AI pipeline -> eval -> data/results.json (the precomputed demo data)
import { readFileSync, writeFileSync } from "fs";
import { intake } from "../lib/clean";
import { processLead, flagRate } from "../lib/pipeline";
import { getAI } from "../lib/provider";
import { runEval } from "../lib/eval";

(async () => {
  const file = process.argv[2] ?? "data/leads.csv";
  const r = intake(readFileSync(file, "utf8"));
  if (!r.ok) throw new Error(r.error);
  const ai = getAI();
  const out = [];
  for (const l of r.leads) {
    process.stdout.write(`${l.lead_id} ... `);
    const res = await processLead(l, ai);
    out.push(res);
    console.log(res.column);
    // Pre-flight: stop immediately on auth/config errors instead of failing every lead
    const aiErr = res.gates.find((g) => /AI error/.test(g.reason) && /API.?key|API_KEY|PERMISSION_DENIED|not found|404/i.test(g.reason));
    if (aiErr) { console.error(`\nSTOPPED: ${aiErr.reason.slice(0, 300)}\nFix .env (key / model name) and rerun.`); process.exit(1); }
  }
  const evalResult = runEval(out);
  const fr = flagRate(out);
  writeFileSync("data/results.json", JSON.stringify({ run_date: process.env.RUN_DATE ?? new Date().toISOString().slice(0,10), leads: out, eval: evalResult, flag_rate: fr }, null, 2));
  console.log(`\nRelevance agreement: ${(evalResult.relevanceAgreement*100).toFixed(0)}% | Overall note agreement: ${(evalResult.overall*100).toFixed(0)}% | Duplicates: ${evalResult.duplicatesCaught} | Reviewer flag rate: ${(fr.rate*100).toFixed(0)}%${fr.alert ? " ALERT" : ""}`);
  for (const d of evalResult.disagreements) console.log(`  DISAGREE ${d.lead_id}: note="${d.note}" expected ${d.expected}`);
})();
