# RAG Quality Suite

Automated quality suite for a retrieval-augmented (RAG) chatbot: golden-set LLM evaluation with an AI judge,
retrieval metrics, prompt-injection and privacy checks, API contract tests, Playwright end-to-end tests,
ingestion lifecycle and fault-injection tests, with an HTML report.

> 🚧 Work in progress. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for the plan.

## Run

```bash
npm install
npx playwright install chromium
cp .env.example .env   # then fill in the values
npm run test:api
```
