You are building a production-ready web application from scratch in this repository. Read this whole brief first. Then check the external APIs and platform features below against their current official documentation, propose a short implementation plan, and build it phase by phase until the Definition of Done is met.

# 1. What we're building

"cvebase" is a tracker for CVEs that affect database products. It refreshes once a day.

Inspiration: https://cve.now/ is a live feed of newly published CVEs. If you can open it, use it as a reference for the feel: fast, minimal, newest-first, with severity visible at a glance. Do not copy its branding, text or code. Our difference: we show ONLY database-related vulnerabilities.

Not in scope: cve.now's "Check your systems with an agent" feature, or any other copyable agent prompt or tool that checks the user's own systems. cvebase only shows vulnerability data.

The users are a DBA team. They need to see quickly when a CVE hits a database engine or tool they run, how severe it is, whether it is being exploited, and what to patch.

Hosting (GitHub only, with no database and no server):
- Once a day at 05:00 Asia/Jakarta, a GitHub Actions workflow fetches the data and commits it as JSON files to the repo.
- The same workflow builds a static site from those files and deploys it to GitHub Pages.

Do record CVE change events (section 5) so alerting can be added later.

# 2. What counts as "database-related"

In scope:
- Database engines and servers (relational, NoSQL, search, time-series, cache), plus their official extensions and plugins
- Database ecosystem tooling: HA/replication, connection pooling, backup, admin GUIs, CDC tools
- Client drivers and connectors (JDBC/ODBC and language drivers)

Out of scope by default:
- SQL injection or "database" mentions in unrelated web applications and plugins, such as "SQL injection in XYZ WordPress plugin". These mention SQL but are not vulnerabilities in a database product.
- Add a setting `appSqli: false` in config/settings.yaml.
- When it is true, collect these CVEs and show them under a separate category, "App SQLi". Never count them in product totals.

Seed watchlist:
- Store it in config/watchlist.yaml, edited by pull request. Do not hardcode it in logic.
- Products:
  - Relational: Oracle Database Server, MySQL, MariaDB, Percona Server, PostgreSQL, EDB Postgres Advanced Server, Microsoft SQL Server, IBM Db2, SAP HANA, SQLite, CockroachDB, TiDB
  - NoSQL and other: MongoDB, Redis, Valkey, Apache Cassandra, Couchbase Server, Apache CouchDB, Elasticsearch, OpenSearch, Neo4j, InfluxDB, ClickHouse, Memcached
  - Tooling: pgAdmin, PgBouncer, Pgpool-II, Patroni, pgBackRest, Oracle GoldenGate, phpMyAdmin, ProxySQL, MariaDB MaxScale
  - Drivers: pgjdbc, Oracle JDBC, MySQL Connector/J, psycopg, node-postgres (pg), mysql2, official MongoDB drivers

Each product entry has:
- id (slug), name, vendor and category
- one or more CPE vendor:product pairs
- package identifiers (ecosystem + package name, for drivers)
- keyword aliases
- an enabled flag

CPE names must be verified, not guessed:
- Write a script, `bun run cpe:discover postgresql`, that queries the NVD CPE API with keywordSearch and prints candidate vendor:product pairs.
- Use it to confirm the seed file.
- Examples to verify: postgresql:postgresql, oracle:database_server, oracle:mysql, mariadb:mariadb, microsoft:sql_server, mongodb:mongodb, redis:redis.

# 3. Data sources

The sync script (`bun run sync`) runs once a day in GitHub Actions (section 8), and locally for development. Each source is a pluggable adapter, and each one can fail without affecting the others.

Never miss data between runs: always sync from the last successful cursor, even if a run failed or the schedule skipped a day.

Core sources (must have):

1. NVD CVE API 2.0 (services.nvd.nist.gov/rest/json/cves/2.0)
   - On each run, fetch everything modified since the cursor in data/state.json, using lastModStartDate/lastModEndDate with a few minutes of overlap.
   - Paginate, respect the rolling rate limit (much lower without an API key), and back off on 403/429/5xx. NVD_API_KEY comes from an Actions secret.
   - Date-range filters have a maximum window, so split backfills into chunks.
   - This is the source for CVSS v3.1/v4.0, CWE, CPE configurations and references.

2. CVE List V5 (github.com/CVEProject/cvelistV5)
   - NVD enrichment often lags, and brand-new CVEs can sit unanalyzed with no CPE data. Use cvelistV5's delta mechanism to catch new CVEs early.
   - Make sure the deltas you read cover the whole gap since the last successful run.
   - Do not clone the whole repository (it is very large). Fetch individual CVE records, authenticated with the workflow's GITHUB_TOKEN for higher rate limits.
   - Use the CNA-provided "affected" vendor/product/version data for matching.
   - Merge with NVD data by CVE ID. NVD scores win when present; otherwise use the CNA scores.

3. CISA Known Exploited Vulnerabilities catalog (JSON feed)
   - Check it on each run, and skip processing when it is unchanged (ETag/Last-Modified or a content hash).
   - Store dateAdded, dueDate, knownRansomwareCampaignUse and requiredAction.

4. FIRST EPSS API (api.first.org/data/v1/epss)
   - On each run, batch-fetch the EPSS score and percentile for all tracked CVEs.
   - Store them as described in section 5.

Optional sources (last phase, behind flags in settings.yaml):

5. GitHub Advisory Database API (using GITHUB_TOKEN), for database driver packages.
6. Vendor advisory links (Oracle CPU, the PostgreSQL security page, MSRC for SQL Server, etc.). Treat this as best-effort enrichment with no fragile scraping on the critical path.

Verify every endpoint, parameter and rate limit against current official docs before coding. If anything differs from this brief, follow the docs and tell me.

# 4. Matching logic

For each new or modified CVE, determine which watched products it affects. Record the match method and a confidence level:
- HIGH: an NVD CPE configuration contains a watched vendor:product.
- HIGH: cvelistV5 "affected" vendor/product matches a product (normalized and alias-aware).
- MEDIUM: a GitHub advisory package matches (drivers).
- LOW ("Unconfirmed"): a keyword match in the description only, using word boundaries and aliases. Show these with an "Unconfirmed" badge, and let users hide them with the confidence filter.

Other matching rules:
- Persist only CVEs that match at least one product. Every modified CVE is still evaluated on each run, so a CVE that gains a watched CPE later gets picked up.
- Re-run matching whenever a stored CVE is modified, so a LOW match can be upgraded to HIGH. Record the upgrade as a change event.
- When a product is added to the watchlist, backfill that product with targeted NVD queries (CPE match and keyword) instead of rescanning every CVE.
- Store affected version ranges when available and display them.

Unit-test the matcher with realistic fixtures, including these negative cases:
- "SQL injection in <web app>" must not match.
- A passing mention of Redis must not become a HIGH Redis match.
- A product that merely uses PostgreSQL as its backend must not be a HIGH PostgreSQL match.

# 5. Data layout (JSON files committed under data/ on main)

Validate every file with zod schemas, shared between the sync scripts and the site.

- **data/cves/<year>/<CVE-ID>.json:** the full merged record
  - description, CVSS v3/v4 score+vector+severity, CWE, references
  - KEV fields
  - matches (product id, method, confidence, affected versions)
  - the event list for this CVE
  - trimmed source excerpts (no huge raw blobs)
  - NO EPSS here, because EPSS changes daily
- **data/epss/current.json:** CVE ID → score, percentile and date, for all tracked CVEs
- **data/epss/history/<yyyy>.json:** a history point only when a CVE's score moves meaningfully (e.g. ≥ 0.01 absolute, or it crosses 10%/50%), so the history stays small
- **data/index/<yyyy-mm>.json:** compact feed index shards, one row per CVE
  - id, published, severity, CVSS, KEV, product ids, confidence, one-line summary
  - The site joins EPSS from current.json.
- **data/latest.json:** the newest ~200 rows including EPSS, for the home page
- **data/events/<yyyy-mm>.json:** change events (cve_id, type, old, new, detected_at)
  - Types: published, severity/CVSS changed, added to KEV, EPSS crossed 10%/50%, match upgraded.
  - This powers the change history and makes alerting easy to add later.
- **data/state.json:** per-source cursors and last-fetch markers
- **data/status.json:** last run per source, with status, counts, duration and last error
- **data/stats.json:** precomputed dashboard numbers

Keep repo growth small:
- A CVE file or index shard changes only when that CVE's own data changes.
- Write files deterministically (stable key order, sorted arrays), so an unchanged run produces no diff and no commit.

# 6. Website

## Pages

All pages are pre-rendered at build time. Interactive parts are small client-side islands. The header shows "Data updated X hours ago".

**Feed (home).** A newest-first list of database CVEs.
- Each row shows: CVE ID, product badge(s), severity color + CVSS, EPSS %, KEV badge, an Unconfirmed badge when confidence is LOW, published date with relative time, and a one-line summary.
- Filtering and full-text search run client-side over the index shards. Load shards lazily as the date range widens.
- Filters: product, vendor, category, severity, KEV only, minimum EPSS, date range, confidence. Filters live in the URL query string so views are shareable.
- When the tab regains focus, check data/latest.json and show a "New data — refresh" pill if a newer deploy is live.

**CVE detail.** One pre-rendered page per stored CVE.
- Full description and broken-down CVSS vectors
- Affected products and versions, and CWE
- KEV details (due date, ransomware use, required action)
- Current EPSS with a small history chart
- References, vendor advisory links, and NVD/CVE.org links
- A change-history timeline

**Product page.** One per product: its CVEs, a severity breakdown, and the latest critical items.

**Recent changes.** A feed of change events: newly added to KEV, severity upgraded, EPSS jumps, and so on. It has the same product filters as the main feed.

**Stats dashboard.**
- CVE counts for the last 24 hours, 7 days and 30 days
- Breakdowns by product and by severity, plus KEV additions
- A trend chart

**Status page.** Last successful run per source, from status.json.
- Staleness is computed client-side.
- Show a warning if data is older than 30 hours (a missed daily run).

**Outputs.**
- An RSS/Atom feed, generated at build time.
- A documented static JSON "API": latest.json, per-CVE files, EPSS files and index shards.

## Design

- Clean, fast, responsive, with dark mode and accessible contrast.
- Severity colors are consistent everywhere.
- Store all times in UTC. Display them in the timezone from settings.yaml (Asia/Jakarta).

## Base path

GitHub Pages project sites live under a sub-path (e.g. https://<user>.github.io/cvebase/), but a custom domain serves from the root. Support both:
- Take the base path from actions/configure-pages (or env) at build time.
- Build every internal link and data fetch with a base-aware helper.

## Operations (no admin UI)

- The watchlist and settings are YAML files in config/, changed by pull request. CI builds every pull request so config mistakes are caught before merge.
- The daily workflow has workflow_dispatch inputs, run from the Actions tab:
  - "sync now": a plain manual run
  - backfill_days
  - rematch: re-match all stored CVEs
  - backfill_product: a product id, for a targeted backfill
- Backfills run in Actions; no local machine is needed.
- Run logs are the Actions logs, plus status.json on the status page.
- For local development, the CLI honors HTTPS_PROXY/HTTP_PROXY/NO_PROXY (corporate network).

# 7. Tech stack

Use this stack unless you have a strong reason not to; if so, ask first.

- Bun is the package manager, script runner and test runner (bun install, bun run, bun test). Use oven-sh/setup-bun in Actions.
- Astro (current stable) with static output, TypeScript and Tailwind CSS.
  - Interactive islands (feed filters, search, charts) use Preact or plain TypeScript.
- Client-side search with MiniSearch, or Pagefind if it handles the structured filters better (explain your choice).
- A lightweight chart library (e.g. uPlot or Chart.js).
- zod for config and data schemas; YAML for config.
- No database, no server, no serverless functions.
- The only secret is NVD_API_KEY, stored as a GitHub Actions secret.
  - GitHub API calls use the workflow's built-in GITHUB_TOKEN.
  - Never commit secrets.
  - Never write them into data files or build output.

# 8. Automation and deployment (GitHub Actions + GitHub Pages)

Daily workflow (.github/workflows/daily.yml):

Triggers:
- schedule: `0 22 * * *`, which is 05:00 Asia/Jakarta (GitHub cron runs in UTC). Comment it in the file. Delayed starts are acceptable.
- workflow_dispatch, with the inputs in section 6.
- push to main, for code and config changes: build and deploy only, no sync.

Safety:
- A concurrency group, so runs never overlap.
- Minimal permissions per job: contents: write for the sync job; pages: write and id-token: write for the deploy job.
- Pin third-party actions to full commit SHAs.

Sync job (schedule and workflow_dispatch only):
1. Check out the repo.
2. Install with Bun (frozen lockfile).
3. Run sync with the dispatch inputs.
4. If anything under data/ changed, commit and push to main with a descriptive message (e.g. "data: daily sync 2026-11-20 (+3 CVEs, 2 events)").
   - Commits made with GITHUB_TOKEN do not trigger other workflows, so there is no loop.
   - If main is protected, document how to let the workflow push.

Build-and-deploy job:
- Runs after the sync job when data changed, on any manual run, and on push.
- Check out the latest main, including the new data commit.
- Build with the Pages base path.
- Deploy with actions/configure-pages, actions/upload-pages-artifact and actions/deploy-pages (Pages source set to "GitHub Actions").
- Skip it when a scheduled sync changed nothing.

CI workflow (.github/workflows/ci.yml):
- On pull requests: typecheck, lint, tests and a full build.

# 9. Quality

- Tests with bun test for:
  - the matcher, including the false-positive cases above
  - the NVD and cvelistV5 parsers, using saved fixture JSON
  - the merge logic
  - change-event detection
  - EPSS history thinning
  - index and shard generation, including deterministic output
  - cursor handling after a missed or failed run
  - the base-path link helper
- No mock or fake CVE data in runtime code or committed data; fixtures belong in tests only.
- If one source fails, the run still writes the others and records the error in status.json. A failed source does not fail the whole workflow unless all sources fail.
- Lint and typecheck must be clean.

# 10. Build phases

1. Scaffold (Astro + Bun), config files and schemas, NVD and cvelistV5 sync, matcher, data writer, feed page, all running locally.
2. KEV and EPSS, change events, CVE detail, product pages, recent changes, stats, status page.
3. Daily workflow and CI, GitHub Pages deployment with base path, RSS and static JSON API, optional sources, polish, README.

After each phase, run the tests and build/preview the site to verify that it works before moving on.

# 11. Definition of done

- Locally, `bun install`, then `bun run sync --backfill-days 30`, then `bun run build` produces a working static site, and `bun run preview` serves it.
- After pushing to GitHub, setting Pages to "GitHub Actions" and adding the NVD_API_KEY secret:
  - a manual run with backfill_days=30 populates the data and deploys the site
  - the daily 05:00 Asia/Jakarta schedule keeps it updated
- The feed shows only database-related CVEs, with correct severity, KEV and EPSS.
- Re-running sync is idempotent: no duplicate CVEs or events, and no commit or deploy when nothing changed.
- A day with only EPSS changes does not modify any per-CVE files.
- Change events appear when a tracked CVE is added to KEV or its score changes.
- Adding a product to watchlist.yaml and running the workflow with backfill_product fills in that product's CVEs.
- A failed source shows on the status page, and the next run catches up from the cursor.
- The README covers:
  - setup and config files
  - the Actions secret
  - enabling GitHub Pages, and an optional custom domain
  - triggering sync, backfill and rematch from the Actions tab
  - the schedule in UTC, and possible start delays
  - scheduled workflows being disabled after a period of repo inactivity, and how to re-enable them
  - site visibility (Pages is public unless the org has GitHub Enterprise Cloud private Pages)
  - Actions minutes if the repo is private
