import { type GenerateOptions, generateDemoData, type Scenario } from "../scripts/demo/generator";
import { loadSettings, loadWatchlist } from "../src/lib/config";
import type { Settings } from "../src/lib/schemas/config";

/** Fixed clock so generated data is reproducible in tests. */
export const FIXED_NOW = new Date("2026-11-19T08:00:00.000Z");

export function gen(
  scenario: Scenario,
  overrides: Partial<Omit<GenerateOptions, "settings">> & { settings?: Partial<Settings> } = {},
) {
  const { settings, ...rest } = overrides;
  return generateDemoData({
    seed: "test-seed",
    scenario,
    now: FIXED_NOW,
    watchlist: loadWatchlist(),
    settings: { ...loadSettings(), ...settings },
    ...rest,
  });
}
