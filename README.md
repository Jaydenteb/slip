# Slip

**An AI agent that runs school field-trip and camp payments on PayPal.**

The school office describes an event in plain English. Slip then:
- drafts one PayPal invoice per family, with siblings combined and a minimum deposit;
- answers parents' questions and sets up payment plans;
- matches every payment back to the right child;
- answers questions about the ledger by driving the grid itself.

Anything that reaches a family or moves money waits for a person to click **Approve**. The model can't skip this step, because the check is in the code, not just the prompt.

**Live demo:** https://slip-48nu.onrender.com (a made-up school; payments use the PayPal sandbox, so no real money moves)

Built for the PayPal "Build what's next with PayPal and AI" hackathon. MIT licensed.

---

## Try it in five minutes

1. **Open your own copy.** On the [landing page](https://slip-48nu.onrender.com), choose **The school office**. Every visitor gets a private copy of Bellbird Primary: 60 families, 86 students and no events. Nobody else sees or changes what you do. **Reset the demo** starts your copy again.
2. **Set up a camp as the office.** Open **The school office**, go to **Events → New event**, and paste:
   > Year 4 camp at Bellbird Creek Camp, 12–14 March. $285 per student, $85 deposit by 1 December, balance by 1 February. Needs a consent form.

   Click **Set it up**. Slip turns this into a structured event and lists the assumptions it made. Check it, then click **Save event**.
3. **Approve the invoices.** On the event page, click **Draft invoices for 18 families**, then open **Approvals**. The batch shows every family's invoice. Siblings are combined: the Nguyens' invoice covers Ava (4B) and Leo (4A), $570 with a $170 minimum. Click **Approve & send**. Slip creates and sends the PayPal invoices, and **Activity** shows each PayPal call.
4. **Be a parent.** Click **View as parent** to open the Nguyen family page. Ask Slip:
   - "How much do I owe and when?"
   - "Leo can't come to camp any more." Slip works out what changes and asks the office to approve the withdrawal. Here, the invoice drops to $285 for Ava; anything already paid beyond that would be refunded. Slip keeps the reason neutral and never records medical details.
   - "Money's tight at the moment." Slip mentions the state's camps fund (CSEF) and privately flags the family to the office. It never decides anything about hardship itself.
5. **Approve the withdrawal.** Back in **Approvals**, the withdrawal lists exactly what will happen, step by step. Click **Approve withdrawal**. Slip cuts the PayPal invoice down to Ava's $285, with an $85 minimum. Approve this *before* the family pays: Slip deliberately stops a withdrawal if payments changed after the office reviewed it.
6. **Pay.** On the family page, click **Pay with PayPal** and pay the $85 deposit with the sandbox buyer:
   - email: `sb-f47efm53424610@personal.example.com`
   - password: `M'=4i+=f`

   This is a PayPal sandbox test account, not a real one.
7. **Ask for a payment plan.** Ask Slip "Can I pay the rest in 4 weekly payments?". Slip asks the office to approve 4 payments of $50 for the $200 left. Approve it in **Approvals**. Slip updates the PayPal invoice so the minimum payment becomes the first instalment, and the family page shows the schedule.
8. **Chase the rest, kindly.** Back on the event page, click **Draft reminders**. Slip picks who to remind and how firmly. It leaves out anyone who asked for support (the Nguyens) or was reminded in the last week. It drafts the wording, and the office reads it in **Approvals** before PayPal sends anything.
9. **Watch the ledger.** Open **Ledger**. The PayPal webhook updates the Nguyens' row and the changed cells flash. Then try **Ask the ledger**:
   - "Who in 4B hasn't paid the camp deposit yet?"
   - "Who owes more than $200?"
   - "Group by class with totals" (when AG Grid Enterprise is enabled)

   Slip answers with AG Grid's own filter, sort, column and grouping state, and the grid applies it. The chip above the grid explains what it did.

---

## Where PayPal is used

| What | Where |
|---|---|
| PayPal Agent Toolkit: `create_invoice`, `send_invoice`, `update_invoicing`, `record_payment_for_invoice` and more | [src/lib/paypal/toolkit.ts](src/lib/paypal/toolkit.ts) (`runPayPalTool` checks the arguments against each tool's own schema) |
| Sending an approved invoice batch: one invoice per family, partial payments with a minimum | [src/lib/executor/run.ts](src/lib/executor/run.ts) (`sendInvoiceBatch`, `invoiceFields`) |
| Applying an approved payment plan to a live invoice | [src/lib/executor/run.ts](src/lib/executor/run.ts) (`applyPaymentPlan`) |
| Withdrawing a child after approval: the PayPal invoice is cut down (`update_invoicing`) or cancelled (`cancel_sent_invoice`), PayPal payments are refunded (`create_refund`) and cash handed back is recorded (`record_refund_for_invoice`). If payments changed since the office looked, it stops | [src/lib/executor/run.ts](src/lib/executor/run.ts) (`applyWithdrawal`), [src/lib/withdrawals/plan.ts](src/lib/withdrawals/plan.ts) |
| Sending an approved batch of payment reminders (`send_invoice_reminder`), syncing first so nobody who just paid is chased | [src/lib/executor/run.ts](src/lib/executor/run.ts) (`sendReminderBatch`) |
| Invoicing REST v2: reading an invoice for Sync, and verifying webhook signatures | [src/lib/paypal/rest.ts](src/lib/paypal/rest.ts) (`getInvoice`, `verifyWebhookSignature`) |
| Webhook receiver: verified, de-duplicated by event id, then a sync | [src/app/api/webhooks/paypal/route.ts](src/app/api/webhooks/paypal/route.ts) |
| Matching payments to the ledger (PayPal and cash; idempotent on PayPal's `payment_id`) | [src/lib/payments/reconcile.ts](src/lib/payments/reconcile.ts), [src/lib/payments/sync.ts](src/lib/payments/sync.ts) |

Webhooks are the fast path. Sync is the fallback: it reads the invoice straight from PayPal on page load, from the ledger, or from the **Sync with PayPal** button. A late or missing webhook can't leave the ledger wrong.

## Where the AI is used

All calls use Claude Opus 5.5 (`claude-opus-5-5`) through the official Anthropic TypeScript SDK ([src/lib/ai/claude.ts](src/lib/ai/claude.ts)).

| Feature | How | Where |
|---|---|---|
| Plain-English event setup | Structured outputs with a zod schema. Returns fees, deposits, dates, classes, plus the assumptions and questions it has | [src/lib/events/parse.ts](src/lib/events/parse.ts) |
| Parent chat | The SDK's tool runner with four tools, all scoped to one family: read the family overview, request a payment plan, request a withdrawal, flag for support | [src/lib/agent/parent.ts](src/lib/agent/parent.ts) |
| Payment reminders | Plain rules in [select.ts](src/lib/reminders/select.ts) decide who gets a reminder and how firm it is: a friendly nudge, overdue, or final. Families who asked for support are never chased. Claude writes one note per tier with structured outputs, and every note offers help in confidence | [src/lib/reminders/draft.ts](src/lib/reminders/draft.ts), [src/lib/reminders/service.ts](src/lib/reminders/service.ts) |
| Ask the ledger | Structured outputs that return a ledger query. [toGridState](src/lib/ledger/query.ts) converts it into AG Grid filter, column and row-grouping state | [src/lib/ledger/ask.ts](src/lib/ledger/ask.ts), [src/app/office/ledger/ledger-grid.tsx](src/app/office/ledger/ledger-grid.tsx) |

## The approval gate: why the AI can't move money

- **The model never sees a PayPal tool.** The parent chat's tools write only to Slip's database: a payment-plan request or a support flag becomes an `ApprovalItem` with status `PENDING`. See `familyTools` in [src/lib/agent/parent.ts](src/lib/agent/parent.ts).
- **Every PayPal write goes through one gate,** in [src/lib/executor/gate.ts](src/lib/executor/gate.ts). `createGatedPayPal` refuses to call PayPal unless:
  - a person has approved the item,
  - the item has been claimed for execution, and
  - the tool is on the allow-list for that kind of approval (`ALLOWED_TOOLS`). An invoice batch can create and send invoices; a payment plan can only update one; a reminder batch can only send reminders; a withdrawal can cut down, cancel or refund that one invoice; a hardship flag can call nothing.
- **Approving runs the executor, not the model.** See `approveAndExecute` in [src/lib/executor/run.ts](src/lib/executor/run.ts). Claiming an approval is atomic, so a double-click can't send a batch twice.
- **Every PayPal call is audited,** whether it succeeds or fails, and listed on the **Activity** page.

Tests check all of this:
- [src/lib/executor/gate.test.ts](src/lib/executor/gate.test.ts): the gate refuses with no approval, a pending approval, a rejected approval, or a tool that isn't allowed, and it audits failures.
- [src/lib/withdrawals/plan.test.ts](src/lib/withdrawals/plan.test.ts): what a withdrawal does to the invoice and where each refund goes.
- [src/lib/reminders/select.test.ts](src/lib/reminders/select.test.ts): who gets a reminder and how firm it is, including that families who asked for support are never chased.
- [tests/db/parent-scope.test.ts](tests/db/parent-scope.test.ts): one family's chat can't see or act on another family's invoices or children, and plan and withdrawal requests make no PayPal call.

The [Security](#security) section below covers the rest: access control, injection, and the OWASP checks for web apps and AI.

## AG Grid

The ledger ([src/app/office/ledger/ledger-grid.tsx](src/app/office/ledger/ledger-grid.tsx)) has one row per student per event. It has:
- **Status cell renderers:** paid, part paid, unpaid, waiting for approval. Columns also show deposit paid, payment plan, support and consent.
- **Live updates:** the grid refreshes every few seconds and uses `getRowId` with `enableCellChangeFlash`, so a payment arriving from PayPal flashes in place.
- **A pinned totals row.**
- **Ask the ledger:** Claude's answer is converted into AG Grid's own state and applied with `setFilterModel` and `applyColumnState`, covering filters, sort, visible columns and row grouping. Anything the grid can't do is reported back, not silently dropped (see [src/lib/ledger/query.ts](src/lib/ledger/query.ts) and its tests).
- **Row grouping by class, with subtotal rows,** when an AG Grid Enterprise licence key is set. Without one, the ledger runs on AG Grid Community and leaves grouping out.

## Security

Slip handles parents' money and children's names, so we reviewed it against the [OWASP Top 10](https://owasp.org/Top10/) for web apps and the [OWASP Top 10 for LLM Applications](https://genai.owasp.org/llm-top-10/), and fixed what we found. Four reviews ran: access control (IDOR), payment integrity, AI and prompt injection, and general web security. This section covers who can reach what, and where each protection lives in the code.

The demo itself uses a made-up school and made-up families, and payments run in the PayPal sandbox.

### Who can reach what

- **A parent** has a private link to their family page, with a 96-bit random token. Everything on the page, and every tool in its chat, loads that family from the token and filters by it.
- **The office** has no sign-in in this demo. Instead, each visitor gets their own copy of the school. The copy's id is kept in an http-only cookie and acts as that visitor's key ([src/lib/demo/visitor.ts](src/lib/demo/visitor.ts)). Every office page and action resolves the school from it, and checks that each id it's given belongs to that school. So each visitor is a separate tenant, and the cross-school checks are exercised for real. Making copies is rate-limited, and copies nobody has opened for a month are deleted. A real deployment takes the school from staff sign-in instead (see below). Either way, nothing reaches a family or moves money without an approval.
- **Claude** sees text that people typed: a parent's messages, and the office's event descriptions. All of it is treated as data, and Claude never holds a tool that can reach PayPal.
- **PayPal webhooks** can be sent by anyone. Each one is verified with PayPal before Slip acts on it.

### Web app (OWASP Top 10)

| Risk | What Slip does | Where |
|---|---|---|
| Broken access control and IDOR | <ul><li>Family pages, family actions and every parent-chat tool load the family from the link token and filter by it.</li><li>Office actions check that each id belongs to the school before using it, and approvals can only be decided within their own school.</li><li>A withdrawal only ever touches children who are on that family's invoice, whatever ids the request sends.</li></ul> | [family/[token]/actions.ts](src/app/family/[token]/actions.ts), [office/actions.ts](src/app/office/actions.ts), [withdrawals/service.ts](src/lib/withdrawals/service.ts), [executor/run.ts](src/lib/executor/run.ts) |
| Insecure design (the money logic) | <ul><li>The approval gate, and atomic claims on each approval.</li><li>Retries skip any step the audit log shows was already done. Invoices that already went out are never sent again.</li><li>Withdrawals and payment plans re-check the money before running and stop if it has changed.</li><li>Only one withdrawal per invoice can be open at a time, enforced by a database lock.</li><li>A run that crashed part-way can be safely retried after 10 minutes.</li></ul> | [executor/gate.ts](src/lib/executor/gate.ts), [executor/run.ts](src/lib/executor/run.ts) |
| Injection | <ul><li>Every database query is parameterised through Prisma.</li><li>React escapes all text, and Slip never uses `dangerouslySetInnerHTML`.</li><li>The CSV export neutralises cells that a spreadsheet would run as formulas.</li></ul> | [ledger/csv.ts](src/lib/ledger/csv.ts) |
| Input validation | Server actions are public endpoints, so every argument is checked. The event the office confirms is validated again on the server: lengths, real dates, amounts above $0, and a deposit no bigger than the fee. | [lib/guard.ts](src/lib/guard.ts), [events/validate.ts](src/lib/events/validate.ts) |
| Security misconfiguration | <ul><li>Response headers include a Content Security Policy, `frame-ancestors 'none'` (no clickjacking on the consent tick), `nosniff` and HSTS.</li><li>`Referrer-Policy: no-referrer` keeps family tokens out of other sites' logs.</li></ul> | [next.config.ts](next.config.ts) |
| Authentication of webhooks | <ul><li>PayPal verifies every webhook signature before Slip acts. The check fails closed, and duplicate events are dropped.</li><li>A webhook body is never trusted: it only prompts Slip to re-read the invoice from PayPal.</li></ul> | [api/webhooks/paypal/route.ts](src/app/api/webhooks/paypal/route.ts) |
| Logging and monitoring | <ul><li>Every PayPal call is written to an audit log, whether it succeeds or fails, and the log is shown on the Activity page. A call that succeeded is never recorded as failed.</li><li>Every server error and every failed approval becomes one JSON line in the logs.</li><li>Error pages show a reference that matches the log line, and never show internal details.</li><li>[`/api/health`](src/app/api/health/route.ts) checks the database for Render's health check and an uptime monitor.</li></ul> | [executor/gate.ts](src/lib/executor/gate.ts), [instrumentation.ts](src/instrumentation.ts), [app/error.tsx](src/app/error.tsx) |
| Error leaks | Internal errors such as PayPal response bodies and database messages are logged, not shown. People see a short, plain message. | [lib/errors.ts](src/lib/errors.ts) |
| SSRF | PayPal's base URL is fixed, and ids are URL-encoded. | [paypal/rest.ts](src/lib/paypal/rest.ts) |
| Secrets | <ul><li>All secrets live in environment variables, and `.env` is git-ignored.</li><li>The only value sent to the browser is the AG Grid licence key, which is meant to be public.</li></ul> | [.env.example](.env.example) |

### AI (OWASP Top 10 for LLM Applications)

| Risk | What Slip does |
|---|---|
| **LLM01 Prompt injection** | <ul><li>Even a successful injection can't move money. Claude's tools only *propose*, the tools are scoped to one family in code (not in the prompt), and a person approves every action.</li><li>System prompts say that tool results and event text are data, not instructions.</li><li>Anything a parent said reaches the office in a separate quote marked *unchecked*, with control characters and quote marks stripped, so it can't pose as Slip's own summary.</li></ul> |
| **LLM02 Sensitive information disclosure** | <ul><li>The chat's tools can only read the one family's data, so there's nothing else to leak.</li><li>No medical details are collected. The chat asks parents to give health details to the office directly, and withdrawal reasons stay neutral ("Can't attend").</li></ul> |
| **LLM05 Improper output handling** | <ul><li>Every structured output is validated against a zod schema.</li><li>Ask the ledger can only use known columns and operators.</li><li>Reminder wording is checked in code before the office even sees it: no links, email addresses or phone numbers, a length limit, and the offer of help must be there.</li><li>All AI text is rendered as plain text.</li></ul> |
| **LLM06 Excessive agency** | The approval gate: each kind of approval may call only its own PayPal tools, and a hardship flag can call none. |
| **LLM07 System prompt leakage** | The prompts hold no secrets, and every limit that matters is enforced in code, so a leaked prompt gives nothing away. |
| **LLM09 Misinformation** | Slip states only the amounts and dates its tools return. A fixed note under the chat, not written by the AI, says only the office can change what's owed or approve a refund. |
| **LLM10 Unbounded consumption** | <ul><li>Rate limits per family, per visitor, per action and overall.</li><li>Message length and chat length caps, at most 6 tool rounds per reply, and token limits on every call.</li><li>A hard spending limit on the Anthropic key.</li></ul> |
| LLM03 Supply chain, LLM04 Data poisoning, LLM08 Vector weaknesses | <ul><li>Slip has no fine-tuning, no retrieval and no vector store.</li><li>Dependencies are locked, and every push runs in CI.</li></ul> |

A conversation that stops part-way (for example, at the tool-round limit) is closed off cleanly, so it can't break the parent's next message ([`repairHistory`](src/lib/agent/parent.ts)).

### Row-level security

Slip scopes every query to the family or school in application code, and database tests check that scoping against a real Postgres. Postgres row-level security (RLS) would add a second layer for many schools: each request would set its school, and the database itself would refuse other schools' rows. It isn't in the demo, because the demo has one school and no sign-in. It's first on the list below.

### What a real school deployment adds

- **Staff sign-in** through the school's single sign-on, with roles, and a second approver for refunds above a set amount.
- **Postgres row-level security** for each school, on top of the checks in the app.
- **Shared rate limits** (Redis, for example) instead of in-memory ones, so the limits hold across several servers.
- **The school from sign-in, not a cookie:** the demo's per-visitor copies stand in for real accounts.
- **Expiring family links** that the office can re-issue, or sign-in by the family's email.
- **Retention rules:** chat threads are deleted once an event closes.
- **A nonce-based Content Security Policy,** so no inline scripts are needed.

### Security tests

- [src/lib/executor/gate.test.ts](src/lib/executor/gate.test.ts): the gate refuses without an approved, executing item or with a tool that isn't allowed, and a call that succeeded is never recorded as failed.
- [tests/db/parent-scope.test.ts](tests/db/parent-scope.test.ts): one family's chat can't see or act on another family's invoices or children.
- [tests/db/demo-copies.test.ts](tests/db/demo-copies.test.ts): each visitor's copy has its own families and family links, and resetting one leaves the others alone.
- [tests/db/office-safety.test.ts](tests/db/office-safety.test.ts):
  - a withdrawal only names children on that family's invoice;
  - two withdrawals drafted at once produce only one;
  - an approval can't be decided from another school;
  - a parent's words are kept apart from Slip's summary.
- [src/lib/withdrawals/plan.test.ts](src/lib/withdrawals/plan.test.ts): ids that aren't on the invoice are ignored.
- [src/lib/events/validate.test.ts](src/lib/events/validate.test.ts): negative or zero amounts, impossible deposits, bad dates and oversized text are refused.
- [src/lib/reminders/draft.test.ts](src/lib/reminders/draft.test.ts): reminders with links, email addresses or phone numbers are refused, and every reminder must offer help.
- [src/lib/ledger/csv.test.ts](src/lib/ledger/csv.test.ts), [src/lib/errors.test.ts](src/lib/errors.test.ts), [src/lib/agent/rate-limit.test.ts](src/lib/agent/rate-limit.test.ts) and [src/lib/agent/history.test.ts](src/lib/agent/history.test.ts): CSV formulas, error messages, quoting, client addresses and chat-history repair.

---

## Run it locally

Requires Node 22+ and Docker. You'll need:
- a PayPal sandbox REST app with Invoicing enabled, plus a sandbox business account (the school) and a sandbox personal account (the parent);
- an Anthropic API key.

```bash
npm install
cp .env.example .env        # fill in the PayPal sandbox and Anthropic keys
docker compose up -d        # Postgres on port 5433
npm run db:push
npm run db:seed             # Bellbird Primary: 60 families, 86 students
npm run dev
```

The webhook needs a public URL (the demo uses Render). Without one, Sync keeps the ledger up to date.

**Checks:** `npm run check` runs the typecheck, lint, unit tests and database tests. CI runs the same checks plus a build on every push ([.github/workflows/ci.yml](.github/workflows/ci.yml)).

**Deploying:** [render.yaml](render.yaml) is a Render Blueprint for the web service and the Postgres database.

## Built with

- PayPal Invoicing API v2 and the PayPal Agent Toolkit (`@paypal/agent-toolkit`)
- Claude Opus 5.5 via the Anthropic TypeScript SDK (structured outputs and the tool runner)
- AG Grid
- Next.js 16, Prisma, Postgres, Tailwind, hosted on Render

## License

MIT. See [LICENSE](LICENSE).
