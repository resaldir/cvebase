import type { ProductMeta } from "../schemas/config";
import { type Confidence, type IndexRow, type Severity, severities } from "../schemas/data";

/**
 * Feed filters (BRIEF §6): product, vendor, category, severity, KEV only, minimum
 * EPSS, date range, confidence — plus a free-text query. Filters live in the URL
 * query string so views are shareable. Pure functions; unit-tested.
 */

export const rangePresets = ["24h", "7d", "30d", "90d", "1y", "all"] as const;
export type RangePreset = (typeof rangePresets)[number];

export const rangeLabels: Record<RangePreset, string> = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "1y": "Last year",
  all: "All time",
};

/** Minimum confidence: "low" = everything, "medium" hides Unconfirmed, "high" = HIGH only. */
export const confLevels = ["low", "medium", "high"] as const;
export type ConfLevel = (typeof confLevels)[number];

export type FeedFilters = {
  q: string;
  products: string[];
  vendors: string[];
  categories: string[];
  severities: Severity[];
  kev: boolean;
  /** 0..1 */
  minEpss: number;
  range: RangePreset;
  /** Custom range (YYYY-MM-DD, inclusive), overrides `range` when set. */
  from: string | null;
  to: string | null;
  conf: ConfLevel;
};

export const DEFAULT_RANGE: RangePreset = "30d";

export function defaultFilters(): FeedFilters {
  return {
    q: "",
    products: [],
    vendors: [],
    categories: [],
    severities: [],
    kev: false,
    minEpss: 0,
    range: DEFAULT_RANGE,
    from: null,
    to: null,
    conf: "low",
  };
}

const list = (v: string | null) =>
  v
    ? v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function parseFilters(search: string | URLSearchParams): FeedFilters {
  const p = typeof search === "string" ? new URLSearchParams(search) : search;
  const d = defaultFilters();
  const range = p.get("range");
  const conf = p.get("conf");
  const minEpss = Number(p.get("epss"));
  return {
    q: p.get("q")?.trim() ?? "",
    products: list(p.get("product")),
    vendors: list(p.get("vendor")),
    categories: list(p.get("category")),
    severities: list(p.get("severity"))
      .map((s) => s.toUpperCase())
      .filter((s): s is Severity => (severities as readonly string[]).includes(s)),
    kev: p.get("kev") === "1",
    minEpss: Number.isFinite(minEpss) && minEpss > 0 ? Math.min(minEpss, 100) / 100 : 0,
    range: (rangePresets as readonly string[]).includes(range ?? "")
      ? (range as RangePreset)
      : d.range,
    from: isDate(p.get("from")) ? p.get("from") : null,
    to: isDate(p.get("to")) ? p.get("to") : null,
    conf: (confLevels as readonly string[]).includes(conf ?? "") ? (conf as ConfLevel) : d.conf,
  };
}

/** Serialize only non-default values, in a stable order, for shareable URLs. */
export function serializeFilters(f: FeedFilters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.products.length) p.set("product", f.products.join(","));
  if (f.vendors.length) p.set("vendor", f.vendors.join(","));
  if (f.categories.length) p.set("category", f.categories.join(","));
  if (f.severities.length) p.set("severity", f.severities.map((s) => s.toLowerCase()).join(","));
  if (f.kev) p.set("kev", "1");
  if (f.minEpss > 0) p.set("epss", String(Math.round(f.minEpss * 1000) / 10));
  if (f.from || f.to) {
    if (f.from) p.set("from", f.from);
    if (f.to) p.set("to", f.to);
  } else if (f.range !== DEFAULT_RANGE) p.set("range", f.range);
  if (f.conf !== "low") p.set("conf", f.conf);
  return p.toString();
}

export function isFiltered(f: FeedFilters): boolean {
  return serializeFilters(f) !== "";
}

const RANGE_MS: Record<RangePreset, number | null> = {
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
  "90d": 90 * 86_400_000,
  "1y": 365 * 86_400_000,
  all: null,
};

/** Resolve the active date window as epoch ms [from, to]; null = unbounded. */
export function dateWindow(f: FeedFilters, now: number): [number | null, number | null] {
  if (f.from || f.to) {
    return [
      f.from ? Date.parse(`${f.from}T00:00:00Z`) : null,
      f.to ? Date.parse(`${f.to}T23:59:59.999Z`) : null,
    ];
  }
  const span = RANGE_MS[f.range];
  return [span === null ? null : now - span, null];
}

/** Months (YYYY-MM) of the shards needed to cover the window, from the available list. */
export function shardsForWindow(
  available: string[],
  window: [number | null, number | null],
): string[] {
  const [from, to] = window;
  const fromMonth = from === null ? null : new Date(from).toISOString().slice(0, 7);
  const toMonth = to === null ? null : new Date(to).toISOString().slice(0, 7);
  return available.filter(
    (m) => (fromMonth === null || m >= fromMonth) && (toMonth === null || m <= toMonth),
  );
}

const CONF_MIN: Record<ConfLevel, Confidence[]> = {
  low: ["HIGH", "MEDIUM", "LOW"],
  medium: ["HIGH", "MEDIUM"],
  high: ["HIGH"],
};

export type FilterableRow = IndexRow & { epss?: number | null };

export function applyFilters<T extends FilterableRow>(
  rows: T[],
  f: FeedFilters,
  ctx: { products: Map<string, ProductMeta>; now: number; searchHits?: Set<string> | null },
): T[] {
  const [from, to] = dateWindow(f, ctx.now);
  const allowedConf = CONF_MIN[f.conf];
  const wantAppSqli = f.categories.includes("app_sqli");
  const productCats = f.categories.filter((c) => c !== "app_sqli");
  const sevSet = new Set(f.severities);
  const productSet = new Set(f.products);
  const vendorSet = new Set(f.vendors);

  return rows.filter((r) => {
    if (ctx.searchHits && !ctx.searchHits.has(r.id)) return false;
    const t = Date.parse(r.published);
    if (from !== null && t < from) return false;
    if (to !== null && t > to) return false;
    if (sevSet.size && !sevSet.has(r.severity)) return false;
    if (f.kev && !r.kev) return false;
    if (f.minEpss > 0 && (r.epss ?? 0) < f.minEpss) return false;
    if (r.confidence && !allowedConf.includes(r.confidence)) return false;

    // Category: product categories match via products; "app_sqli" matches App SQLi rows.
    if (f.categories.length) {
      const isApp = r.category === "app_sqli";
      const catHit = isApp
        ? wantAppSqli
        : productCats.length > 0 &&
          r.products.some((p) => productCats.includes(ctx.products.get(p)?.category ?? ""));
      if (!catHit) return false;
    }
    if (productSet.size && !r.products.some((p) => productSet.has(p))) return false;
    if (vendorSet.size && !r.products.some((p) => vendorSet.has(ctx.products.get(p)?.vendor ?? "")))
      return false;
    return true;
  });
}

/** Merge rows from several sources by CVE ID, keeping the first seen (latest.json wins). */
export function mergeRows<T extends { id: string; published: string }>(...lists: T[][]): T[] {
  const seen = new Map<string, T>();
  for (const l of lists) for (const r of l) if (!seen.has(r.id)) seen.set(r.id, r);
  return [...seen.values()].sort((a, b) =>
    a.published !== b.published ? (a.published < b.published ? 1 : -1) : a.id < b.id ? 1 : -1,
  );
}
