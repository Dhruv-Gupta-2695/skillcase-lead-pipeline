import "dotenv/config";
import { readFileSync } from "fs";
import { intake } from "../lib/clean";
import { verifyQuote } from "../lib/qc";
const L = Object.fromEntries(intake(readFileSync("data/leads.csv","utf8")).leads.map(l=>[l.lead_id,l]));
const cases: [string,string,boolean][] = [
  ["L002","education: GNM",true],["L013","education: BSc Nursing; goal: Work in Germany",true],["L025","goal: Work in UK",true],
  ["L013","wants a call tomorrow.",true],["L006","worried about cost",true],["L001","education: GNM",false],
  ["L001","wants to start next month",false],["L012","goal: Germany",false],["L001","KB:K1",true],["L001","KB:K9",false]];
for (const [id,q,exp] of cases) { const got=verifyQuote(L[id],q); console.log(got===exp?"PASS":"FAIL", id, JSON.stringify(q), "->", got); }
