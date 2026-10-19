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

1. **Start fresh.** On the [landing page](https://slip-48nu.onrender.com), click **Reset the demo**. Bellbird Primary comes back with 60 families, 86 students and no events.
2. **Set up a camp as the office.** Open **The school office**, go to **Events → New event**, and paste:
   > Year 4 camp at Bellbird Creek Camp, 12–14 March. $285 per student, $85 deposit by 1 December, balance by 1 February. Needs a consent form.

   Click **Set it up**. Slip turns this into a structured event and lists the assumptions it made. Check it, then click **Save event**.
3. **Approve the invoices.** On the event page, click **Draft invoices for 18 families**, then open **Approvals**. The batch shows every family's invoice. Siblings are combined: the Nguyens' invoice covers Ava (4B) and Leo (4A), $570 with a $170 minimum. Click **Approve & send**. Slip creates and sends the PayPal invoices, and **Activity** shows each PayPal call.
4. **Be a parent.** Click **View as parent** to open the Nguyen family page. Ask Slip:
   - "How much do I owe and when?"
   - "Can I pay the rest weekly?" Slip proposes a plan. It doesn't decide it.
   - "Money's tight at the moment." Slip mentions the state's camps fund (CSEF) and privately flags the family to the office. It never decides anything about hardship itself.
5. **Approve the plan.** Back in **Approvals**, approve the payment plan. Slip updates the PayPal invoice so the minimum payment becomes the first instalment.
6. **Pay.** On the family page, click **Pay with PayPal** and pay the $85 deposit with the sandbox buyer:
   - email: `sb-f47efm53424610@personal.example.com`
   - password: `M'=4i+=f`

   This is a PayPal sandbox test account, not a real one.
7. **Watch the ledger.** Open **Ledger**. The PayPal webhook updates the row and the changed cells flash. Then try **Ask the ledger**:
   - "Who in 4B hasn't paid the camp deposit yet?"
   - "Who owes more than $200?"
   - "Group by class with totals"

   Slip answers with AG Grid's own filter, sort, column and grouping state, and the grid applies it. The chip above the grid explains what it did.

---

## Where PayPal is used

| What | Where |
|---|---|
| PayPal Agent Toolkit: `create_invoice`, `send_invoice`, `update_invoicing`, `record_payment_for_invoice` and more | [src/lib/paypal/toolkit.ts](src/lib/paypal/toolkit.ts) (`runPayPalTool` checks the arguments against each tool's own schema) |
| Sending an approved invoice batch: one invoice per family, partial payments with a minimum | [src/lib/executor/run.ts](src/lib/executor/run.ts) (`sendInvoiceBatch`, `invoiceFields`) |
| Applying an approved payment plan to a live invoice | [src/lib/executor/run.ts](src/lib/executor/run.ts) (`applyPaymentPlan`) |
| Invoicing REST v2: reading an invoice for Sync, and verifying webhook signatures | [src/lib/paypal/rest.ts](src/lib/paypal/rest.ts) (`getInvoice`, `verifyWebhookSignature`) |
| Webhook receiver: verified, de-duplicated by event id, then a sync | [src/app/api/webhooks/paypal/route.ts](src/app/api/webhooks/paypal/route.ts) |
| Matching payments to the ledger (PayPal and cash; idempotent on PayPal's `payment_id`) | [src/lib/payments/reconcile.ts](src/lib/payments/reconcile.ts), [src/lib/payments/sync.ts](src/lib/payments/sync.ts) |

Webhooks are the fast path. Sync is the fallback: it reads the invoice straight from PayPal on page load, from the ledger, or from the **Sync with PayPal** button. A late or missing webhook can't leave the ledger wrong.

## Where the AI is used

All calls use Claude Opus 5.5 (`claude-opus-5-5`) through the official Anthropic TypeScript SDK ([src/lib/ai/claude.ts](src/lib/ai/claude.ts)).

| Feature | How | Where |
|---|---|---|
| Plain-English event setup | Structured outputs with a zod schema. Returns fees, deposits, dates, classes, plus the assumptions and questions it has | [src/lib/events/parse.ts](src/lib/events/parse.ts) |
| Parent chat | The SDK's tool runner with three tools, all scoped to one family: read the family overview, request a payment plan, flag for support | [src/lib/agent/parent.ts](src/lib/agent/parent.ts) |
| Ask the ledger | Structured outputs that return a ledger query. [toGridState](src/lib/ledger/query.ts) converts it into AG Grid filter, column and row-grouping state | [src/lib/ledger/ask.ts](src/lib/ledger/ask.ts), [src/app/office/ledger/ledger-grid.tsx](src/app/office/ledger/ledger-grid.tsx) |

## The approval gate: why the AI can't move money

- **The model never sees a PayPal tool.** The parent chat's tools write only to Slip's database: a payment-plan request or a support flag becomes an `ApprovalItem` with status `PENDING`. See `familyTools` in [src/lib/agent/parent.ts](src/lib/agent/parent.ts).
- **Every PayPal write goes through one gate,** in [src/lib/executor/gate.ts](src/lib/executor/gate.ts). `createGatedPayPal` refuses to call PayPal unless:
  - a person has approved the item,
  - the item has been claimed for execution, and
  - the tool is on the allow-list for that kind of approval (`ALLOWED_TOOLS`). An invoice batch can create and send invoices; a payment plan can only update one; a hardship flag can call nothing.
- **Approving runs the executor, not the model.** See `approveAndExecute` in [src/lib/executor/run.ts](src/lib/executor/run.ts). Claiming an approval is atomic, so a double-click can't send a batch twice.
- **Every PayPal call is audited,** whether it succeeds or fails, and listed on the **Activity** page.

Tests check all of this:
- [src/lib/executor/gate.test.ts](src/lib/executor/gate.test.ts): the gate refuses with no approval, a pending approval, a rejected approval, or a tool that isn't allowed, and it audits failures.
- [tests/db/parent-scope.test.ts](tests/db/parent-scope.test.ts): one family's chat can't see or act on another family's invoices, and a plan request makes no PayPal call.

## AG Grid

The ledger ([src/app/office/ledger/ledger-grid.tsx](src/app/office/ledger/ledger-grid.tsx)) has one row per student per event. It has:
- **Status cell renderers:** paid, part paid, unpaid, waiting for approval. Columns also show deposit paid, payment plan, support and consent.
- **Live updates:** the grid refreshes every few seconds and uses `getRowId` with `enableCellChangeFlash`, so a payment arriving from PayPal flashes in place.
- **A pinned totals row.**
- **Ask the ledger:** Claude's answer is converted into AG Grid's own state and applied with `setFilterModel` and `applyColumnState`, covering filters, sort, visible columns and row grouping. Anything the grid can't do is reported back, not silently dropped (see [src/lib/ledger/query.ts](src/lib/ledger/query.ts) and its tests).
- **Row grouping by class, with subtotal rows,** when an AG Grid Enterprise licence key is set. Without one, the ledger runs on AG Grid Community and leaves grouping out.

## Keeping a public demo safe

- **Rate limits:** per family, per visitor and overall, on both the parent chat and Ask the ledger. Messages are capped at 1,000 characters and 30 turns per chat. The Anthropic key also has a hard spending limit.
- **Families can only see their own data:** a family page and its chat only ever load data for the family that owns the link.
- **Made-up data only.** There are no real schools, families or medical details. Only a consent tick is stored.

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
