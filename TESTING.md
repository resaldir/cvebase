# Demo testing checklist

A click-through checklist for the demo stage. All data is generated: CVE IDs are
`CVE-2099-*` and descriptions start with `[DEMO]`. None of it is a real vulnerability.

## Setup

```bash
bun install
bun run demo:generate          # default scenario: 600 CVEs, updated ~3 hours ago
bun run dev                    # http://localhost:4321
```

To switch scenarios, regenerate and reload the page. The dev server picks up new data without a restart.

```bash
bun run demo:generate --scenario stale         # last update 40 h ago
bun run demo:generate --scenario source-error  # EPSS source failing
bun run demo:generate --scenario empty         # no CVEs
bun run demo:generate --scenario large         # 5,000 CVEs
bun run demo:generate --seed other --count 300 # different random data
```

Run `bun run demo:generate` again at the end to go back to the default scenario.

## Good examples (default seed)

The IDs stay the same for the default seed, whenever you generate. Open them at `/cve/<ID>/`.

| Case | CVE |
| --- | --- |
| v3.1 + v4.0, KEV with ransomware use and a past due date, multiple products, EPSS chart | CVE-2099-10420 |
| Very long description and 40+ references | CVE-2099-10228 |
| Minimal record (no CVSS, CWE or references) | CVE-2099-10260 |
| CVSS v4.0 only | CVE-2099-10003 |
| Severity "None" (score 0.0) | CVE-2099-10292 |
| Match upgraded (Unconfirmed → High) | CVE-2099-10025 |
| EPSS crossed 50% | CVE-2099-10041 |
| Unconfirmed (keyword-only) match | CVE-2099-10014 |
| KEV with a due date still in the future | the 4th-newest CVE (CRIT, KEV, published a few hours ago) |

## Everywhere (check on two or three pages)

- [ ] A yellow banner at the top says **"Demo data — not real vulnerabilities"**, and the tab title starts with `[DEMO]`.
- [ ] The header shows **"Data updated 3 h ago"** with a green dot. Clicking it opens Status.
- [ ] The moon button toggles dark mode. Reload: the choice is remembered, with no flash of the wrong theme.
- [ ] Severity colours are the same everywhere: Critical = dark red/pink, High = orange, Medium = yellow, Low = green, None = grey, Awaiting analysis = dashed outline.
- [ ] At phone width (≈375 px, e.g. browser dev tools), nothing scrolls sideways and the nav scrolls horizontally.
  - [ ] On the feed, "Filters" opens and closes the filter panel.
- [ ] Hovering a relative time ("2 d ago") shows the full date in Asia/Jakarta time (UTC+7).

## Feed (`/`)

- [ ] Newest first, with a heading count such as "108 CVEs · last 30 days".
- [ ] Each row shows:
  - [ ] the CVE ID and severity badge with CVSS score
  - [ ] product badge(s), more than one on multi-product CVEs
  - [ ] a KEV badge (black/yellow) when the CVE is in KEV
  - [ ] an **Unconfirmed** dashed badge on keyword-only matches
  - [ ] the relative published time
  - [ ] EPSS % (rows from the last day show "EPSS —")
  - [ ] a one-line summary
- [ ] A few rows show **N/A** (awaiting analysis, no CVSS score).
- [ ] Each filter changes the list and the URL:
  - [ ] severity chips
  - [ ] **KEV only**
  - [ ] category chips
  - [ ] Product… and Vendor… (selected ones appear as removable chips)
  - [ ] the minimum EPSS dropdown
  - [ ] the confidence dropdown ("Hide unconfirmed" removes Unconfirmed rows)
- [ ] The date range dropdown works:
  - [ ] "All time" loads older months (the count grows to ~600).
  - [ ] "Custom range…" shows From/To date fields.
- [ ] Search:
  - [ ] `replication` gives text matches.
  - [ ] `postgres` matches product names.
  - [ ] `2099-1042` finds IDs that start with it.
- [ ] **Copy link**, then paste into a new tab: the same filters and results appear. The browser Back button also works.
- [ ] **Reset filters** clears everything. A filter combination with no results shows "No CVEs match these filters".
- [ ] "Show 100 more" appears when there are more than 100 results.
- [ ] Refresh pill:
  1. Keep the feed open in a tab.
  2. Run `bun run demo:generate` in a terminal.
  3. Switch to another tab and back.
  4. A **"New data — refresh"** pill appears at the bottom.

## CVE detail (click any ID)

- [ ] Header: severity badge, KEV badge if any, and published/modified times in UTC+7.
- [ ] **Severity (CVSS)** shows v4.0 and/or v3.1, each with its vector and a metric-by-metric table.
  - [ ] Find one with both (`?severity=critical&kev=1&range=all` usually has one).
  - [ ] An N/A CVE shows "Awaiting analysis — no CVSS score has been published yet".
- [ ] **Affected products** shows each product, its confidence and match method, and the evidence (CPE, package or keyword).
  - [ ] Version ranges appear as chips (`≥ 8.0.0, < 8.0.36`).
  - [ ] Some products say "No affected version range published".
- [ ] **KEV** box:
  - [ ] dates added and due; a past due date is red with "(past)"
  - [ ] ransomware use, "Known" in red
  - [ ] the required action
  - [ ] non-KEV CVEs say "Not in the KEV catalog"
- [ ] **EPSS** box: the score, its percentile, and a small line chart for CVEs whose score moved. CVEs from the last day say "No EPSS score yet".
- [ ] **Change history** timeline, newest first. It can include Published, Severity changed, CVSS changed (old → new), Added to KEV, EPSS crossed 10%/50%, and Match upgraded (Unconfirmed → High).
- [ ] References:
  - [ ] All links point to `example.com`, including the NVD and CVE.org links in demo mode.
  - [ ] A CVE with 40+ references collapses them under "All N references" (e.g. CVE-2099-10228).
- [ ] The "JSON: data/cves/2099/…json" link at the bottom opens the raw record. It has a `"notice"` field.

## Products (`/products/`, then a product)

- [ ] Products are grouped as Relational / NoSQL & other / Tooling / Drivers, with total, critical and KEV counts.
- [ ] MySQL, Oracle Database Server and PostgreSQL have the most CVEs.
- [ ] A product page shows:
  - [ ] the CPE pairs with an "unverified CPE" badge
  - [ ] total and KEV counts
  - [ ] a severity bar and chips
  - [ ] "Latest critical"
  - [ ] the newest 50 CVEs, with "See all in the feed" (opens the feed filtered to that product)
- [ ] **pgBackRest** (`/products/pgbackrest/`) shows the empty state "No CVEs for pgBackRest".

## Recent changes (`/changes/`)

- [ ] A list of change events, with a type badge, the CVE, its severity, its products, and old → new values.
- [ ] Type chips (e.g. "Added to KEV") and the Product / Vendor / Category dropdowns filter the list and update the URL.

## Stats (`/stats/`)

- [ ] Number cards: last 24 h / 7 d / 30 d, tracked total, in KEV, and added to KEV in 30 days.
- [ ] A stacked weekly chart by severity, which follows dark mode when toggled. Hovering shows per-severity counts.
- [ ] "By severity" bars, "Recent KEV additions", and the "By product" table with severity-mix bars.

## Status (`/status/`)

- [ ] "Up to date" badge, the last successful update time, and four source cards (NVD, CVE List V5, CISA KEV, FIRST EPSS), all **OK**.

## RSS and JSON API

- [ ] `/feed.xml`:
  - [ ] The channel title starts with `[DEMO]`.
  - [ ] Each item description starts with "Demo data — not real vulnerabilities".
- [ ] `/api/` lists the data files with working links:
  - [ ] `latest.json`, an index shard, a CVE record, `epss/current.json`, an EPSS history file, an events shard, `stats.json` and `status.json`
  - [ ] Every JSON file has a `"notice"` field.

## Scenarios

| Scenario | What to check |
| --- | --- |
| `stale` | <ul><li>An orange "Data may be stale…" bar shows under the header on every page, and the header dot is orange ("Data updated 40 h ago").</li><li>Status shows a **Stale** badge and an explanation.</li></ul> |
| `source-error` | <ul><li>Status: the **FIRST EPSS API** card has a red border, an **Error** badge, last success ~27 h ago, and the error message.</li><li>The other three sources are OK.</li><li>No stale warning, because the run itself happened.</li></ul> |
| `empty` | <ul><li>Feed says "No CVEs yet".</li><li>Stats shows zeros and "No data yet".</li><li>Every product page shows its empty state.</li><li>Changes says "No changes recorded yet".</li><li>Status still shows OK sources.</li></ul> |
| `large` | <ul><li>Feed → All time loads ~5,000 CVEs in about a second.</li><li>Typing in search stays smooth; results update just after you stop typing.</li><li>"Show more" pages through the list.</li><li>`bun run build` takes about 15 s.</li></ul> |

App SQLi:
1. Set `appSqli: true` in `config/settings.yaml`.
2. Run `bun run demo:generate` and reload.
3. Check:
   - [ ] The feed has an **App SQLi** category chip.
   - [ ] Those rows carry an "App SQLi" badge and no product.
   - [ ] Product counts don't change.
4. Set it back to `false` afterwards.

## GitHub Pages base path

```bash
bun run demo:generate
bun run build:pages            # BASE_PATH=/cvebase
bun run preview:pages          # http://localhost:4321/cvebase/
```

- [ ] Every link, the CSS, the charts, the feed's lazy data loading, `/cvebase/feed.xml` and `/cvebase/api/` work under `/cvebase/`. No 404s appear in the browser console.

## Automated checks

```bash
bun run typecheck && bun run lint && bun test
```
