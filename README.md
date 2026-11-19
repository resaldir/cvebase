# cvebase

A daily-refreshed tracker for CVEs that affect database products: engines, tooling and drivers. It is a static site with no server and no database, built with Astro and deployed to GitHub Pages.

> **Demo stage.** The site currently runs on generated demo data (`CVE-2099-*`, `[DEMO]`). None of it is a real vulnerability. Real data collection is BRIEF.md phase 1.

## Quick start

Requirements: [Bun](https://bun.sh) 1.4.4 and Node.js ≥ 22.23.4 (Astro uses Node to build).

```bash
bun install
bun run demo:generate   # writes data/ (gitignored)
bun run dev             # http://localhost:4321
```

## Scripts

| Command | Purpose |
| --- | --- |
| `bun run demo:generate [--scenario default\|stale\|source-error\|empty\|large] [--count N] [--seed S]` | Generate demo data, validated against the schemas. |
| `bun run dev` | Dev server. |
| `bun run build` / `bun run preview` | Build and serve from `/`. |
| `bun run build:pages` / `bun run preview:pages` | Build and serve under the `/cvebase/` base path, as on GitHub Pages. |
| `bun run typecheck` / `bun run lint` / `bun test` | Checks. CI runs all of them on every pull request. |

See [TESTING.md](TESTING.md) for a page-by-page checklist.

## Configuration

- `config/watchlist.yaml`: the products tracked. Change it by pull request.
- `config/settings.yaml`: timezone, staleness threshold, `appSqli`, and EPSS history thinning.
- Environment variables:

  | Variable | Effect |
  | --- | --- |
  | `DATA_MODE=demo\|live` | Default `demo`. Controls the demo banner and notices. |
  | `BASE_PATH` | Build-time base path. |
  | `SITE_URL` | Absolute links in the RSS feed. |

## Demo deployment

`.github/workflows/demo-pages.yml` builds the demo site and deploys it to GitHub Pages on every push to `main`. It can also be run manually from the Actions tab, where you can pick a scenario. To enable it, go to **Settings → Pages → Source** and choose **GitHub Actions**.

The site is public unless your organization uses GitHub Enterprise Cloud private Pages.
