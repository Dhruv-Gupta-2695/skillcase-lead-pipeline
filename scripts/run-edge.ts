import "dotenv/config";
import { readFileSync } from "fs";
import { intake } from "../lib/clean";
const csv = readFileSync("data/leads.csv","utf8").split(/\r?\n/).slice(0,2).join("\n") + "\n" + readFileSync("data/test-edge-cases.csv","utf8").split("\n").slice(1).join("\n");
const r = intake(csv);
for (const l of r.leads) console.log(`${l.lead_id} | ${l.column} | ${l.gates.at(-1)!.reason} | tags=${l.clean.tags.join(",")}`);
console.log(intake("a,b\n1,2").error);
