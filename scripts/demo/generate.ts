#!/usr/bin/env bun
/**
 * bun run demo:generate [--scenario default|stale|source-error|empty|large]
 *                       [--count N] [--seed S] [--now ISO] [--out DIR]
 *
 * Writes the full data/ layout (BRIEF §5) with obviously fake demo data, validated
 * against the shared zod schemas. Fails loudly on any mismatch.
 */
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadSettings, loadWatchlist } from "../../src/lib/config";
import { writeDataDir } from "../../src/lib/data/write";
import { generateDemoData, resolveCount, type Scenario, scenarios } from "./generator";

const { values } = parseArgs({
  options: {
    scenario: { type: "string", default: "default" },
    count: { type: "string" },
    seed: { type: "string", default: "cvebase-demo" },
    now: { type: "string" },
    out: { type: "string", default: join(process.cwd(), "data") },
  },
});

function fail(msg: string): never {
  console.error(`demo:generate: ${msg}`);
  process.exit(1);
}

const scenario = values.scenario as Scenario;
if (!scenarios.includes(scenario))
  fail(`unknown scenario "${scenario}" (use ${scenarios.join(", ")})`);
const count = values.count === undefined ? undefined : Number(values.count);
if (count !== undefined && (!Number.isInteger(count) || count < 0))
  fail("--count must be a non-negative integer");
const now = values.now ? new Date(values.now) : new Date();
if (Number.isNaN(now.getTime())) fail(`--now "${values.now}" is not a valid date`);

const started = performance.now();
const settings = loadSettings();
const files = generateDemoData({
  seed: values.seed,
  count,
  scenario,
  now,
  watchlist: loadWatchlist(),
  settings,
});
try {
  writeDataDir(values.out, files, { clean: true });
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}

const cves = [...files.keys()].filter((k) => k.startsWith("cves/")).length;
console.log(
  `demo:generate: scenario=${scenario} seed=${values.seed} cves=${cves} (requested ${resolveCount({ count, scenario })}${
    settings.appSqli ? " + App SQLi" : ""
  }) files=${files.size} → ${values.out} in ${Math.round(performance.now() - started)} ms`,
);
console.log(
  "demo:generate: all files passed schema validation. Demo data — not real vulnerabilities.",
);
