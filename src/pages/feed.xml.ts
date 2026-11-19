import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { cveUrl } from "../lib/base";
import { loadSettings } from "../lib/config";
import { loadCves } from "../lib/data/repo";
import { severityLabel } from "../lib/format";
import { DEMO_NOTICE, isDemo } from "../lib/mode";
import { productMetaMap } from "../lib/site-data";

/** RSS feed of the newest CVEs, generated at build time. */
export function GET(context: APIContext) {
  const settings = loadSettings();
  const products = productMetaMap();
  const demo = isDemo();
  const site = context.site ?? new URL("http://localhost:4321");
  const abs = (path: string) => new URL(path, site).toString();

  const items = loadCves()
    .slice(0, 100)
    .map((c) => {
      const names = [
        ...new Set(c.matches.map((m) => products.get(m.productId)?.name ?? m.productId)),
      ];
      const score = c.cvss.v40?.score ?? c.cvss.v31?.score;
      const sev = `${severityLabel[c.severity]}${score !== undefined ? ` ${score.toFixed(1)}` : ""}`;
      const tags = [
        sev,
        c.kev ? "KEV" : null,
        names.join(", ") || (c.category === "app_sqli" ? "App SQLi" : null),
      ]
        .filter(Boolean)
        .join(" · ");
      return {
        title: `${demo ? "[DEMO] " : ""}${c.id} — ${tags}`,
        link: abs(cveUrl(c.id)),
        pubDate: new Date(c.published),
        description: `${demo ? `${DEMO_NOTICE}. ` : ""}${c.description}`,
        categories: [severityLabel[c.severity], ...names],
      };
    });

  return rss({
    title: `${demo ? "[DEMO] " : ""}${settings.site.title} — database CVEs`,
    description: demo ? `${DEMO_NOTICE}. ${settings.site.description}` : settings.site.description,
    site: abs(import.meta.env.BASE_URL),
    items,
    customData: "<language>en</language>",
  });
}
