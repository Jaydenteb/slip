# Slip: Devpost write-up (draft)

Paste each section into the matching Devpost field. Fill in the YouTube link when the video is up.

---

**Tagline:** An AI agent that runs school field-trip and camp payments on PayPal: it drafts the invoices, talks to parents and keeps the books, and a person approves anything that reaches a family or moves money.

## Inspiration

I'm a primary school teacher. Every camp, excursion and fundraiser at a school sets off the same chase: permission notes, deposits, balances, siblings billed twice, cash in envelopes, and a school office spending hours matching payments to children. Payment portals exist (in Australia, Compass and Qkr!), but they only take the money. Nobody does the admin around it: drafting the bills, answering "what do I owe and when?", setting up payment plans, chasing kindly, sorting out withdrawals and refunds. And the families who most need help are often the ones too embarrassed to ask.

I wanted to see whether an AI agent could do that admin work, safely enough that a school would actually trust it with parents' money.

## What it does

Slip is built for the school office, and gives each family a private page.

- **Set up an event in one sentence.** "Year 4 camp at Bellbird Creek Camp, 12–14 March, $285, $85 deposit by 1 December, balance by 1 February, needs consent." Slip turns it into fees, a deposit, due dates, the classes going and a consent requirement, and lists the assumptions it made, so the office can check before saving.
- **One PayPal invoice per family.** Siblings are combined into one invoice. Partial payments are on, with the deposit as the minimum first payment. The office reviews the batch and approves it, and Slip creates and sends the invoices through the PayPal Agent Toolkit.
- **A family page with a chat.** Parents see what they owe for each child, tick consent and pay with PayPal. They can ask Slip anything about it in plain English:
  - "Can I pay weekly?" Slip proposes a payment plan for the office to approve. On approval, the PayPal invoice's minimum payment becomes the first instalment.
  - "Leo can't come any more." Slip works out what changes: a smaller invoice, a refund, or a cancelled invoice. It asks the office to approve. It keeps the reason neutral and never records medical details.
  - "Money's tight at the moment." Slip never decides anything here. It mentions Victoria's Camps, Sports and Excursions Fund (CSEF) and payment plans, and privately flags the family so a person follows up.
- **A live ledger the office can talk to.** An AG Grid ledger shows every student on every event and updates the moment PayPal reports a payment, with the changed cells flashing. Ask it "who in 4B hasn't paid the deposit?" and Slip answers with AG Grid's own filter, sort and grouping state, which the grid applies.
- **Reminders that know when not to chase.** Slip decides who needs a reminder and how firm it should be: a friendly nudge, overdue, or final. Families who've asked for support and anyone reminded in the last week are left out. Claude writes the wording, every note offers help in confidence, and the office reads it before PayPal sends.
- **Withdrawals and refunds done properly.** The PayPal invoice is cut down to the children still going, or cancelled if nothing was paid. PayPal payments are refunded back to PayPal, and cash handed back is recorded.

**The guardrail:** the AI never touches PayPal directly. Its tools can only read the school's data and *propose* things. Every PayPal call goes through one gate in the code. The gate checks that a person has approved that exact item, and that the call is on the allow-list for that kind of approval. Every call is audited.

## How we built it

- **PayPal:** Invoicing v2 through the **PayPal Agent Toolkit**: `create_invoice`, `send_invoice`, `update_invoicing`, `send_invoice_reminder`, `cancel_sent_invoice`, `record_refund_for_invoice` and `create_refund`. Direct REST calls cover reading invoices and verifying webhook signatures. Payment webhooks (`INVOICING.INVOICE.PAID` and others) are verified and de-duplicated, and a Sync fallback reads invoices straight from PayPal, so a missed webhook can't leave the ledger wrong.
- **AI:** Claude Opus 5.5 through the Anthropic TypeScript SDK:
  - structured outputs (zod schemas) for event parsing, Ask the ledger and reminder wording;
  - the SDK's tool runner for the parent chat, with tools scoped to one family.
- **Ledger:** AG Grid, with live updates (`getRowId` and cell flashing), custom cell renderers, a pinned totals row, and grid state driven by the AI.
- **App:** Next.js 16, Prisma, Postgres and Tailwind, hosted on Render.
- **Security:** reviewed against the OWASP Top 10 for web apps and the OWASP Top 10 for LLM Applications. The main protections: tools scoped to one family in code, IDOR checks on every action, the AI's proposals kept apart from what parents typed, reminder wording checked in code, rate limits, and strict response headers. The README's Security section maps each risk to the code that handles it.
- **Tests:** unit tests for the approval gate, invoice building, payment plans, reconciliation, reminders, withdrawals and the ledger query. Database tests prove one family's chat can't see or act on another family's data. All of it runs in GitHub Actions CI.

Where to look in the code: the README lists every file where PayPal and the AI are used, at https://github.com/Jaydenteb/slip.

## Challenges we ran into

- **PayPal and refunds.** After a refund, PayPal still counts the money as paid and reports the refund separately. It won't edit a fully paid invoice, and it won't cancel a part-paid one. Withdrawals had to work around all three. Slip cuts the invoice down only while it's editable, adds a "withdrawn – refunded" line so PayPal's numbers still add up, and refunds PayPal payments before cash.
- **Making "the AI can't move money" true in code, not just in the prompt.** Approvals are claimed atomically, so a double-click can't run them twice. Retries skip steps already done. A withdrawal stops if payments changed since the office reviewed it.
- **Error shapes.** The toolkit reports some failures as `{ ok: false }` rather than throwing. We found this in testing, when a rejected PayPal call would otherwise have been logged as a success.

## Accomplishments that we're proud of

- The parent chat handles real conversations: withdrawing one child and keeping the other, noticing a plan should wait until the withdrawal is approved, and responding to hardship with warmth and a referral instead of a decision.
- Every money path has been run against the PayPal sandbox: invoices, partial payments, cash, plans, reminders, cancellations and refunds.
- An office worker can find out who owes what by asking, instead of building filters.

## What we learned

The most useful thing an AI can do here is the admin around the payment, not the payment itself: reading a messy sentence, explaining a bill kindly, noticing who not to chase. The decisions that matter stay with a person, and the design makes the safe path the easy one.

## What's next for Slip

- Real school sign-in, and a roll import from the school's student system.
- Printable notes with an invoice QR code, for families without email.
- More event types, like fundraisers, uniforms and instrumental music.
- A trial with a real school office.

## Built with

`paypal-invoicing` `paypal-agent-toolkit` `claude` `anthropic-sdk` `ag-grid` `next.js` `typescript` `prisma` `postgresql` `tailwindcss` `render`

## AI tools used

- **In the product:** Claude Opus 5.5 (Anthropic API) parses event descriptions, runs the parent chat, writes reminder wording and drives the ledger grid.
- **To build it:** Claude Code (Anthropic's coding agent) helped write the code, tests and docs, under my direction and review.

## Try it

- **Live demo:** https://slip-48nu.onrender.com (a made-up school; PayPal sandbox, so no real money moves). Every visitor gets their own private copy of the school, so judges never see each other's runs. **Reset the demo** starts your copy again.
- **Sandbox buyer for paying invoices:** see the README.
- **Code:** https://github.com/Jaydenteb/slip (MIT)
- **Video:** _(YouTube link)_
