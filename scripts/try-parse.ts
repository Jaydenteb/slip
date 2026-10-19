// Tries the plain-English event parser on a sentence:
//   npm run try-parse -- "Year 4 camp at Bellbird Creek, 12–14 March, $285 ..."
import { parseEventDescription } from "../src/lib/events/parse";

const text =
  process.argv.slice(2).join(" ") ||
  "Year 4 camp at Bellbird Creek, 12–14 March, $285, $85 deposit by 1 December, balance by 1 February, needs consent.";

const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" });
const started = Date.now();

parseEventDescription(text, today)
  .then((event) => {
    console.log(JSON.stringify(event, null, 2));
    console.log(`\n(${((Date.now() - started) / 1000).toFixed(1)}s)`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
