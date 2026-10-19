# Slip: demo video script (draft 2)

Target: **2:45**, hard limit 3:00. No editing skills needed: record six short clips, join them, then read the narration over the top.

## How to make it (the easy way)

**Tools:** Clipchamp, which is free and comes with Windows 11 (search "Clipchamp" in the Start menu).
- **Record:** Clipchamp's *Record & create → Screen recording*. Windows' Snipping Tool also works (Win+Shift+R starts a screen recording).
- **Edit:** drag the clips onto the timeline in order. Trim the slow bits (Slip thinking, PayPal loading) by splitting with **S** and deleting.
- **Voice:** record the narration *after* the clips, in Clipchamp (*Record & create → Audio*). It's much easier than talking while clicking. Phone earbuds in a quiet room are fine. Read it clip by clip; redo any line you stumble on.
- **Export** at 1080p and upload to YouTube as **Public** (the rules say public). Then paste the link into Devpost.

**Before you record:**
- [ ] Wake the site first, so the Render loading screen never appears (or have it on the paid plan by then).
- [ ] Click **Reset the demo** on the landing page.
- [ ] Use a fresh Chrome profile or a guest window, so no personal bookmarks, email or tabs are visible.
- [ ] Press **F11** for full screen. That hides the browser bar and the Chrome and Google branding (the rules say no third-party trademarks in the video).
- [ ] Browser zoom at 110–125%, so the text is readable on YouTube.
- [ ] Turn on Do Not Disturb, so no Windows notifications pop up.
- [ ] Have the sandbox buyer login ready to paste (it's in the README).
- [ ] Do one practice run of the whole thing without recording.

**The order matters.** Approve Leo's withdrawal *before* the parent pays. Slip deliberately refuses to run a withdrawal if payments changed after the office reviewed it.

## The script

Narration is ~390 words at a calm pace. The bold words are what you click or type.

| # | Time | On screen | Say |
|---|---|---|---|
| 1 | 0:00–0:15 | A title card in Clipchamp (*Text*): "Slip: an AI agent for school payments, on PayPal". Then the Slip landing page. | "Every school runs field trips, camps and fundraisers, and every one of them means someone in the school office chasing money by hand: notes home, cash in envelopes, siblings billed twice, families too embarrassed to ask for help. Slip is an AI agent that does that work, on PayPal." |
| 2 | 0:15–0:40 | **The school office → Events → New event**. Paste the camp sentence from the README, click **Set it up**, and pause on the review screen (fees, deposit, dates, the assumptions list). Click **Save event**. | "The office describes the camp in one sentence. Slip turns it into fees, a deposit, due dates and a consent requirement, tells you what it assumed, and shows it back to check before anything is saved." |
| 3 | 0:40–1:00 | **Draft invoices for 18 families → Approvals**. Open **Show all invoices** and point at the Nguyens: Ava and Leo, *Siblings combined*, $570, minimum $170. Click **Approve & send**. Optionally flash **Activity** showing the PayPal calls. | "Slip drafts one PayPal invoice per family, combining siblings into one bill, with partial payments on so families can start with the deposit. Nothing goes out until a person approves it, and every PayPal call is logged." |
| 4 | 1:00–1:40 | **View as parent** (the Nguyen family page). Type **"Leo can't come to camp any more."** Show Slip's reply ($570 → $285). Then type **"Money's tight at the moment."** Show the reply and the *Let the office know privately* tag. | "Parents get the invoice and a family page where they can just ask. When Leo can't go, Slip works out what changes and asks the office. When a family says money's tight, Slip doesn't decide anything. It points them to Victoria's camps fund and quietly lets the office know." |
| 5 | 1:40–1:55 | Back in the office, **Approvals**: show the withdrawal's numbered steps, click **Approve withdrawal**. Then on the family page, **Pay with PayPal** and pay **$85** as the sandbox buyer. *(Cut the PayPal loading out.)* | "The office sees exactly what will happen before approving. Then the family pays the deposit, with PayPal." |
| 6 | 1:55–2:25 | **Ledger**. Show the Nguyen row now *Part paid* (it flashes when the payment lands). Type **"Who in 4B hasn't paid the camp deposit yet?"** and click **Ask**. The grid filters and sorts itself; point at the chip that explains it. | "Back in the office, the ledger updates itself the moment the payment lands. Instead of building filters, the office just asks, and Slip drives the grid directly." |
| 7 | 2:25–2:45 | **Events → the camp → Draft reminders**. In Approvals, show the friendly wording, then **Show who gets one and who's left out**: the Nguyens are left out because they asked for support. | "Slip drafts reminders too, firmer as dates pass, but it never chases a family who's asked for help. Everything that reaches a family or moves money waits here for a person. That isn't just an instruction to the AI: the code won't let it near PayPal without an approval." |
| 8 | 2:45–2:55 | An end card: "Slip · github.com/Jaydenteb/slip · Built with PayPal Invoicing, the PayPal Agent Toolkit, Claude and AG Grid". | "Slip. Less chasing money, more teaching." |

## If something goes wrong while recording
- **Slip takes a few seconds to reply.** That's normal. Cut the wait out in Clipchamp.
- **The ledger doesn't flash straight away.** Wait 5–10 seconds (it checks PayPal every few seconds), or open the event page and click **Sync with PayPal**.
- **You need to start again.** Use **Reset the demo** and redo from clip 2.

## Notes
- No music is needed. If you add some, use YouTube's free Audio Library or Clipchamp's stock music, never a commercial song.
- Only the fake school (Bellbird Primary) and made-up families appear, never real places or names.
