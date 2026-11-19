# cvebase — notes for Claude

The full spec is in BRIEF.md. The demo-stage instructions are in DEMO.md.

## Project status

- **Demo stage: done (2026-11-19).** The complete site runs on generated demo data.
  - Built: `bun run demo:generate`, every page and output from BRIEF §6, the demo Pages workflow, CI, tests, and TESTING.md.
  - Not built: the sync, the data sources, the matcher, and the daily workflow.
- **Next step: BRIEF.md phase 1.** Reuse the schemas, data helpers, pages and components as they are. Only the data producer changes: the real `bun run sync` replaces `demo:generate`.

## Layout

| Path | What it is |
| --- | --- |
| `config/watchlist.yaml`, `config/settings.yaml` | Config, validated by `src/lib/schemas/config.ts`. Every CPE pair is a placeholder with `verified: false`. Confirm each one with `cpe:discover` in phase 1. |
| `src/lib/schemas/data.ts` | zod schemas for every `data/` file (BRIEF §5). `schemaForDataPath()` maps a path to its schema. |
| `src/lib/data/derive.ts` | Builds index shards, `latest.json`, events shards and `stats.json` from CVE records + EPSS. The sync should call these. |
| `src/lib/data/write.ts` | Validates all files against the schemas, then writes them deterministically (`stable-json.ts`: sorted keys). |
| `src/lib/data/repo.ts` | Build-time loaders the pages use. They read `data/` and validate it. |
| `src/lib/feed/` | Pure filter, URL and search logic (MiniSearch), unit-tested. |
| `src/lib/base.ts` | `url()` / `joinBase()`: every internal link and fetch is base-path aware. |
| `src/pages/data/[...file].ts` | Publishes `data/*.json` as the static JSON API at `/data/…`. |
| `src/islands/` | Preact islands: `Feed`, `Changes`, `Chart` (uPlot). |
| `scripts/demo/` | The demo generator. Delete it, and the `DATA_MODE=demo` notices, once the real sync exists. |

## Conventions

- `DATA_MODE=demo` (default) shows the demo banner and `[DEMO]` titles, and links NVD/CVE.org to example.com. The real build must set `DATA_MODE=live`.
- Demo data never gets committed (`data/` is gitignored in this stage). In phase 1, remove `data/` from `.gitignore`: the daily workflow commits it.
- `.github/workflows/demo-pages.yml` is temporary. `daily.yml` (BRIEF §8) replaces it.
- Times are stored in UTC and displayed in `settings.timezone`.
- Severity colours come only from the `.sev-*` classes in `src/styles/global.css`.
- Checks: `bun run typecheck && bun run lint && bun test`. Base-path check: `bun run build:pages && bun run preview:pages`.
- Astro 7 needs Node ≥ 22.23.4 for `astro build`. Bun is the package manager, script runner and test runner.
