import { readFileSync } from "node:fs";
import { parseMatch } from "../src/index.js";

/**
 * Runs match documents through the full validator the phone and API use, e.g. the
 * watch app's test fixture:
 *   pnpm --filter @fh/shared check:match ../../watch-wear/app/build/match-fixtures/full-match.json
 */
let failed = false;
for (const file of process.argv.slice(2)) {
  const result = parseMatch(JSON.parse(readFileSync(file, "utf8")));
  const problems = [...(result.ok ? [] : result.errors), ...result.warnings];
  console.log(`${result.ok ? "valid" : "INVALID"}: ${file}`);
  for (const p of problems) console.log(`  ${p.severity} ${p.code} at ${p.path.join(".")}: ${p.message}`);
  if (!result.ok || result.warnings.length) failed = true;
}
process.exitCode = failed ? 1 : 0;
