# Skillcase lead pipeline

Messy lead sheet → prioritized, AI-enriched, human-approved sales list.

A Skillcase counselor receives raw B2C leads (Instagram, WhatsApp, website, referrals) with duplicates, missing fields and buried intent. This app cleans them, decides who is relevant, understands each lead, scores who to contact first, drafts a personal message, checks all AI output with rules and a second AI, and puts a human in charge of the final approval.

## Pipeline

```
CSV
 └─ 1 Clean (code)        parse, trim, normalize, truncation validator, dedupe (phone+email), rule pre-filter
 └─ 2 Classify (AI 1)     relevant? reason + quote, confidence, track, flags      ← code rules always win
 └─ 3 Understand (AI 1)   profile, intent, needs, objections, missing info, opportunity, next step
                          every claim must carry a quote that code verifies exists in the lead's row
 └─ 4 Prioritize (code)   0-100 score, every point explained; Call Now if a requested call is overdue
 └─ 5 Outreach (AI 2)     WhatsApp (email if only email), banned-claims check, 1 retry
 └─ 6 AI review (AI 3)    different model, blind verdict first, then compare; fail closed
 └─ 7 Human approval      approve / edit / override / reject, with reasons, logged
 └─ Eval                  compare with the sheet's `notes` column (never shown to the AI)
```

The AI extracts facts; the code makes the decisions that must be explainable.

Board columns: Call now, Needs review, Ready, Nurture, Not a fit, Approved. Click a card to see its full trace.

## Results on the 30-lead dataset

| Check | Result |
|---|---|
| Relevance agreement with human notes | 96% |
| Overall agreement with notes | 97% |
| Duplicates caught | 3/3 (incl. fuzzy "Priya S.") |
| Seeded errors caught by AI reviewer | 4/4 |
| Only disagreement | L016 pharmacist: note says "different profession"; Skillcase serves allied health, so Relevant + role-fit check (deliberate) |

## Quality control

- Rule checks: schema validation, quote-exists-in-source, contradiction checks (e.g. "certified" vs "hasn't taken the exam"), hard relevance rules, mandatory flags, banned claims (job guarantees, prices, salaries), word limits, correct name.
- Second AI: blind-then-compare reviewer on a different model; high-severity issues block the lead; errors fail closed.
- Human review queue and approval log.
- Seeded-error test: `npm run test:reviewer` plants 4 errors code can't catch and checks the reviewer flags them.
- Eval against human notes, shown on the dashboard.

Examples the system caught: AI marked Priya's B1 as "certified" (source: exam not taken), corrected; AI invented "wants to start next month", claim removed; outreach promising a job, blocked; a Canada lead the AI called relevant, rule conflict sent to review; our own "guarantee" rule blocked an honest "no one can guarantee a job", rule refined to allow negations.

## Run it

```bash
npm install
cp .env.example .env         # add GEMINI_API_KEY (free at aistudio.google.com)
npm run test:offline         # QC + scoring with a fake AI, no key needed
npm run pipeline             # real run on data/leads.csv -> data/results.json
npm run test:reviewer        # seeded-error test for the AI reviewer
npm run dev                  # UI at http://localhost:3000
```

Swap the LLM provider with `LLM_PROVIDER=anthropic` (plus `ANTHROPIC_API_KEY`). All rules, weights and thresholds live in `lib/config.ts`.

## Deploy (Vercel)

Import the GitHub repo in Vercel and add environment variables: `GEMINI_API_KEY`, `LLM_PROVIDER=gemini`, `DEMO_PASSCODE` (protects live runs from burning API quota). The page loads the precomputed `data/results.json`; "Upload CSV and run live" reprocesses a file lead by lead.

## Key decisions

| Decision | Chosen | Rejected and why |
|---|---|---|
| Relevance | Healthcare (nursing + allied) and Germany/Europe | Nursing-only: Skillcase's own description includes allied health |
| Enrichment source | Lead's own row + cited official facts (Make it in Germany) | Looking up individuals online: privacy |
| Scoring | Code formula, weights in config | AI-assigned score: not explainable, not reproducible |
| Reviewer | Different model, blind first, flag-only | Same-model self-check: tends to agree with itself |
| Approvals storage | Browser + CSV export | Shared DB: overkill for 30 leads and exposes data on a public demo. Google Sheets write-back: highest failure risk in the time available. Upgrade path: swap the storage layer |
| HubSpot | HubSpot-importable CSV | API integration: out of scope; evaluators can't access the account |
| Orchestration | One API call per lead from the browser | One batch job: exceeds serverless time limits |
| LLM | Gemini Flash-Lite (free tier), Claude switchable | — |

## Calibration log (from real runs)

1. Quote checker rejected valid `field: value` quotes: checker fixed (our bug, not the AI's).
2. Reviewer over-flagged "Call Now" on strong leads that never asked for a call: prompt tightened, and a rule downgrades such flags when the source has no call request.
3. "Cannot afford now" tagged soft by the AI: rule upgrades it to a hard blocker, so the lead goes to Nurture.
4. Exploring leads landed in Ready: exploring leads below High now go to Nurture.

## Notes

- Messages are drafts; a person sends them. Business-initiated WhatsApp messages generally need the lead's opt-in.
- `RUN_DATE` pins the date used for recency/overdue logic so runs are reproducible.
