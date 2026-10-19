# Slip

An AI agent that runs school field-trip and camp payments on PayPal. The school office describes an event in plain English. Slip drafts the PayPal invoices, answers parents' questions and proposes payment plans, and keeps the ledger up to date. Every action that reaches a parent or moves money waits for a person to approve it.

> Work in progress for the PayPal "Build what's next with PayPal and AI" hackathon.

## Run it locally

Requires Node 22+ and Docker.

```bash
npm install
cp .env.example .env        # then fill in your PayPal sandbox + Anthropic keys
docker compose up -d        # local Postgres on port 5433
npm run db:push
npm run dev
```

Tests: `npm test`

## How the approval gate works

- The AI models only get **read** tools and **propose** tools. A proposal writes an approval item and nothing else.
- PayPal's money-moving tools (`create_invoice`, `send_invoice`, `record_payment_for_invoice`, …) run only from the executor. The executor refuses to run without an approval item a person has approved: see [src/lib/executor/gate.ts](src/lib/executor/gate.ts).
- Every PayPal call is written to an audit log.

## Built with

- PayPal Invoicing API v2 and the PayPal Agent Toolkit (`@paypal/agent-toolkit`)
- Claude Opus 5.5 via the Anthropic TypeScript SDK (structured outputs + tool use)
- AG Grid Community
- Next.js, Prisma, Postgres, hosted on Render

## License

MIT
