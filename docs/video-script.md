# Slip: demo video script (draft 1)

Target length: **2:45**. About 380 words of narration at a calm pace. Every shot below is a path the app must handle perfectly; anything not in this script is optional.

| Time | On screen | Narration |
|---|---|---|
| 0:00–0:20 | Cold open: a messy office desk shot or a spreadsheet of names with "PAID?" scrawled on it. Cut to the Slip logo. | "Every school runs field trips, camps and fundraisers, and every one of them means someone in the school office chasing money by hand: reminders, cash in envelopes, siblings billed twice, families too embarrassed to ask for help. Slip is an AI agent that does that work, on PayPal." |
| 0:20–0:45 | **Office view.** Type: "Year 4 camp at Bellbird Creek, 12–14 March, $285, $85 deposit by 1 December, balance by 1 February, needs consent." Slip shows the structured event to check. | "The office describes the camp in plain English. Slip turns it into fees, a deposit, due dates and a consent form, and shows it back to check." |
| 0:45–1:05 | Slip proposes the invoice batch: 52 families, siblings combined, deposit set as the minimum payment. Click **Approve & send**. | "It drafts one PayPal invoice per family, combining siblings into one bill, with partial payments switched on so families can start with the deposit. Nothing goes out until a person approves it." |
| 1:05–1:40 | **Parent view** (phone frame). The family page shows two kids on camp. The parent types: "Can I pay this off weekly?" Slip proposes a plan. Then: "Things are tight at the moment." Slip replies kindly, mentions CSEF, and says the office will be in touch. | "Parents get the invoice and a family page they can ask questions on. Slip can propose a payment plan. When a family says money is tight, Slip doesn't make a decision. It points them to the government's camps fund and quietly flags them to the office." |
| 1:40–1:55 | The parent pays $85 through PayPal (sandbox). | "Paying is just PayPal." |
| 1:55–2:20 | **Office ledger** (AG Grid). That row flashes to "Part-paid" live. Type into Ask the ledger: "Who in 4B hasn't paid the deposit yet?" The grid filters, groups and sorts itself. | "Back in the office, the ledger updates the moment the payment lands. And instead of building filters, the office just asks: Slip drives the grid directly." |
| 2:20–2:35 | The approvals queue (the payment plan and the hardship flag waiting) and the audit log. | "Every action that reaches a parent or moves money waits here for a person. That's not a prompt instruction: the agent is never given the PayPal tools that send or refund. Only the approval button can trigger those." |
| 2:35–2:45 | The logo, the GitHub URL and the "Built with PayPal Invoicing, PayPal Agent Toolkit, Claude, AG Grid" credits. | "Slip: less chasing, more teaching." |

## Things the build must make true for this script
- Event parse → review screen in a single step, with no errors on the example sentence.
- The batch preview shows sibling combining clearly, for example "Nguyen family: Ava + Leo, $570, min $170".
- The parent chat: a payment-plan proposal plus a hardship flag that *doesn't* decide anything.
- A sandbox payment → the ledger row flashes, with the webhook or the Sync fallback as backup.
- Ask the ledger → AG Grid filter + group + sort applied visibly.
- The approvals queue and audit log look polished enough to show on screen.

## Notes
- Record at 1920×1080. Show the parent view in a phone-sized frame, since that's how parents will use it.
- No third-party music unless it's licensed (a rule of the hackathon). YouTube's audio library is fine.
- Keep the real school name out. Use the fake "Bellbird Primary".
