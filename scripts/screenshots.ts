// Screenshots of the main pages for a visual check: npm run screenshots -- [baseUrl] [outDir]
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3100";
const out = process.argv[3] ?? "screenshots";

const PAGES: { name: string; path: string; width?: number; ask?: string }[] = [
  { name: "home", path: "/" },
  { name: "ledger", path: "/office/ledger" },
  { name: "ledger-ask", path: "/office/ledger", ask: "Who in 4B hasn't paid the camp deposit yet?" },
  { name: "ledger-grouped", path: "/office/ledger", ask: "Group by class with totals" },
  { name: "events", path: "/office/events" },
  { name: "new-event", path: "/office/events/new" },
  { name: "approvals", path: "/office/approvals" },
  { name: "activity", path: "/office/activity" },
  { name: "family-phone", path: "/family/nguyen-family", width: 390 },
];

async function main() {
  const browser = await chromium.launch();
  for (const p of PAGES) {
    const page = await browser.newPage({ viewport: { width: p.width ?? 1440, height: p.width ? 844 : 900 }, deviceScaleFactor: 1 });
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning" || /licen[cs]e/i.test(m.text())) console.log(`  [${p.name} console ${m.type()}] ${m.text().slice(0, 200)}`);
    });
    await page.goto(base + p.path, { waitUntil: "networkidle" });
    if (p.ask) {
      await page.fill("#ask", p.ask);
      await page.click("button:has-text('Ask')");
      await page.waitForSelector("text=Show everyone", { timeout: 60_000 });
      await page.waitForTimeout(800);
    }
    await page.screenshot({ path: `${out}/${p.name}.png`, fullPage: true });
    console.log("saved", p.name);
    await page.close();
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
