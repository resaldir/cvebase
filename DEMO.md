This repository contains BRIEF.md, the full specification for "cvebase", a website that tracks CVEs affecting database products. Read it first.

We are NOT building the full project yet. This stage is a demo: the complete website running on generated dummy data, so I can test the look, pages and navigation before any real data collection exists. Propose a short plan, then build it.

# 1. Scope of this stage

Build these parts of BRIEF.md, following it exactly:
- **Section 2:** config/watchlist.yaml (the seed product list; CPE pairs may stay as unverified placeholders marked `verified: false`) and config/settings.yaml.
- **Section 5:** the data layout and its zod schemas. The demo must use exactly the same files and schemas the real sync will produce later.
- **Section 6:** every page and output (feed, CVE detail, product pages, recent changes, stats, status, RSS, static JSON API), plus the design and base-path support.
- **Section 7:** the tech stack (Bun, Astro static output, Tailwind, Preact islands, client-side search, chart library, zod).

Do NOT build yet:
- the sync script, data sources, or any calls to NVD, cvelistV5, CISA KEV, EPSS or GitHub APIs (BRIEF section 3)
- the matcher (section 4)
- the daily scheduled workflow (section 8)

Never build cve.now's "Check your systems with an agent" feature; it is permanently out of scope.

For this stage only, BRIEF section 9's rule against fake data is relaxed: generated demo data is allowed. It must never be committed, and it must never pass for real vulnerability data (section 3 below).

# 2. Dummy data generator

Write `bun run demo:generate`, which writes the full data/ layout from BRIEF section 5.

Behavior:
- **Deterministic:** a fixed seed gives the same data every time.
- **Fresh-looking dates:** dates are relative to generation time, so "12 min ago" and "Data updated X hours ago" look current.
- **Options:**
  - `--count` (default 600 CVEs spread over the last 18 months, weighted toward recent)
  - `--seed`
  - `--scenario` (see below)
- **Realistic shape:**
  - mostly medium and high severities, with few criticals
  - more MySQL, Oracle and PostgreSQL than niche products
  - some multi-product CVEs
- **Validation:** check everything it writes against the zod schemas, and fail loudly on any mismatch.

Cover every case the UI must handle:
- every severity, plus unscored CVEs ("awaiting analysis")
- CVSS v3.1 only, v4.0 only, and both
- KEV entries, including some with known ransomware use, and due dates both past and future
- EPSS from near 0 to above 90%, with history points for the chart
- HIGH, MEDIUM and LOW (Unconfirmed) matches
- CVEs that affect several products
- CVEs with and without affected version ranges
- very long descriptions, very long reference lists, and minimal records
- some App SQLi examples, shown only when appSqli is true in settings
- change events of every type listed in BRIEF section 5
- at least one enabled product with zero CVEs (empty state)

Scenarios:
- **default:** healthy, with data updated a few hours ago
- **stale:** the last successful run was 40 hours ago, so the status warning shows
- **source-error:** one source failing with an error message, the others fine
- **empty:** no CVEs at all; every page shows a sensible empty state
- **large:** 5,000 CVEs, to test feed and search performance

# 3. Keep the demo obviously fake

- CVE IDs use the year 2099 (CVE-2099-10001 onward), so they can never collide with real CVEs.
- Descriptions start with "[DEMO]".
- Reference and advisory links point to https://example.com/...
- Every page shows a visible "Demo data — not real vulnerabilities" banner, controlled by DATA_MODE=demo (the default in this stage).
- The RSS feed and JSON outputs carry the same notice.
- data/ is gitignored in this stage. Demo data is generated locally and in the deploy workflow, and never committed.

# 4. Demo deployment

Add .github/workflows/demo-pages.yml:
- **Triggers:** push to main and workflow_dispatch. No schedule.
- **Steps:**
  1. Install with Bun.
  2. Run demo:generate.
  3. Build with the Pages base path.
  4. Deploy with actions/configure-pages, actions/upload-pages-artifact and actions/deploy-pages.
- **Safety:** minimal permissions, actions pinned to full commit SHAs, and a concurrency group.
- Later, the real daily workflow from BRIEF section 8 replaces this file.

Also add the CI workflow from BRIEF section 8 (on pull requests: typecheck, lint, tests and a build), using demo data for the build.

# 5. Tests

Use bun test for:
- generated data passing the schemas in every scenario
- the generator being deterministic for a given seed and time
- feed filter and search logic
- the base-path link helper

# 6. Hand-off to the real build

- Keep the schemas, pages and components independent of how the data is produced, so the real sync later only replaces demo:generate.
- Write TESTING.md: a checklist for me of what to click on each page and what I should see, including each scenario.
- Record in CLAUDE.md that the demo stage is done, and that the next step is BRIEF.md phase 1, reusing these schemas and pages.

# 7. Definition of done

- `bun install`, then `bun run demo:generate`, then `bun run dev` shows the full site with demo data.
- Every page and output from BRIEF section 6 works, including filters, search, shareable filter URLs, dark mode and the mobile layout.
- Each scenario renders correctly: the stale warning, the source error, the empty states, and acceptable performance with 5,000 CVEs.
- The demo banner appears everywhere, all IDs are CVE-2099-*, and no generated data is committed.
- A build with the base path /cvebase/ works in `bun run preview`, and the demo workflow deploys it to GitHub Pages.
- Tests, typecheck and lint pass.
