import { cveUrl, productUrl } from "../lib/base";
import {
  formatDateTime,
  formatEpss,
  relativeTime,
  severityClass,
  severityShort,
} from "../lib/format";
import type { ProductMeta } from "../lib/schemas/config";
import type { IndexRow } from "../lib/schemas/data";

/**
 * One CVE in a list. Pure render component: used statically by Astro pages and
 * inside the feed island, so rows look identical everywhere.
 */
export type RowData = IndexRow & { epss?: number | null };

export function SeverityBadge({
  severity,
  cvss,
}: {
  severity: IndexRow["severity"];
  cvss: number | null;
}) {
  const title =
    severity === "UNSCORED" ? "Awaiting analysis — not scored yet" : `${severity} severity`;
  return (
    <span class={severityClass(severity)} title={title}>
      <span>{severityShort[severity]}</span>
      {cvss !== null && <span>{cvss.toFixed(1)}</span>}
    </span>
  );
}

export function CveRow({
  row,
  products,
  timeZone,
  now,
}: {
  row: RowData;
  products: Map<string, ProductMeta> | Record<string, ProductMeta>;
  timeZone: string;
  now?: number;
}) {
  const get = (id: string) =>
    products instanceof Map ? products.get(id) : (products as Record<string, ProductMeta>)[id];
  return (
    <li class="relative flex gap-3 border-b border-[var(--border)] py-3 pl-3 pr-1 sm:pl-4">
      <span
        aria-hidden="true"
        class={`absolute left-0 top-3 bottom-3 w-1 rounded-full sev-bar-${row.severity.toLowerCase()}`}
      />
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <a href={cveUrl(row.id)} class="mono text-sm font-semibold no-underline hover:underline">
            {row.id}
          </a>
          <SeverityBadge severity={row.severity} cvss={row.cvss} />
          {row.kev && (
            <span class="badge badge-kev" title="In CISA Known Exploited Vulnerabilities catalog">
              KEV
            </span>
          )}
          {row.confidence === "LOW" && (
            <span
              class="badge badge-unconfirmed"
              title="Matched by keyword in the description only — not confirmed by CPE or CNA data"
            >
              Unconfirmed
            </span>
          )}
          {row.category === "app_sqli" && <span class="badge badge-app">App SQLi</span>}
          {row.products.map((p) => (
            <a key={p} href={productUrl(p)} class="badge">
              {get(p)?.name ?? p}
            </a>
          ))}
        </div>
        <p class="soft mt-1 text-sm leading-snug [overflow-wrap:anywhere]">{row.summary}</p>
      </div>
      <div class="flex shrink-0 flex-col items-end gap-1 text-right text-xs">
        <time
          dateTime={row.published}
          title={formatDateTime(row.published, timeZone)}
          data-rel={row.published}
          class="muted whitespace-nowrap"
        >
          {relativeTime(row.published, now)}
        </time>
        <span
          class="muted whitespace-nowrap tabular-nums"
          title="EPSS: probability of exploitation in the next 30 days"
        >
          EPSS <strong class="soft">{formatEpss(row.epss)}</strong>
        </span>
      </div>
    </li>
  );
}
