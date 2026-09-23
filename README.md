# skillcase-lead-pipeline
Messy lead sheet → prioritized, AI-enriched, human-approved sales list. *(Full README coming with the UI.)*

## Run the pipeline locally (checkpoint)
```bash
npm install
cp .env.example .env        # put your ANTHROPIC_API_KEY in .env
npm run test:offline        # no key needed: QC + scoring with a fake AI
npm run pipeline            # real run on data/leads.csv -> data/results.json
```
