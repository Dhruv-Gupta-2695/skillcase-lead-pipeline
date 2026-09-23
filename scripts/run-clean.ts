import "dotenv/config";
import { readFileSync } from "fs";
import { intake } from "../lib/clean";
const r = intake(readFileSync("data/leads.csv", "utf8"));
if (!r.ok) { console.log("REJECTED:", r.error); process.exit(1); }
for (const l of r.leads) {
  const g = l.gates[l.gates.length-1];
  console.log(`${l.lead_id} | ${l.column.padEnd(12)} | ${l.clean.name.padEnd(15)} | ${l.clean.education}(${l.clean.education_category}) | exp=${l.clean.experience_months}m | ${l.clean.destination}/${l.clean.goal_type} | ${l.clean.german_level} | d=${l.clean.days_since_contact} | ${g.reason}`);
}
