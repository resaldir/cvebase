import { describe, expect, test } from "bun:test";
import {
  applyFilters,
  dateWindow,
  defaultFilters,
  type FilterableRow,
  mergeRows,
  parseFilters,
  serializeFilters,
  shardsForWindow,
} from "../src/lib/feed/filter";
import { createSearch } from "../src/lib/feed/search";
import type { ProductMeta } from "../src/lib/schemas/config";

const NOW = Date.parse("2026-11-19T08:00:00Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

const products = new Map<string, ProductMeta>(
  [
    { id: "mysql", name: "MySQL", vendor: "Oracle", category: "relational" },
    {
      id: "postgresql",
      name: "PostgreSQL",
      vendor: "PostgreSQL Global Development Group",
      category: "relational",
    },
    { id: "redis", name: "Redis", vendor: "Redis", category: "nosql" },
    {
      id: "pgjdbc",
      name: "pgjdbc",
      vendor: "PostgreSQL Global Development Group",
      category: "driver",
    },
  ].map((p) => [p.id, p as ProductMeta]),
);

const row = (over: Partial<FilterableRow> & { id: string }): FilterableRow => ({
  published: ago(1),
  severity: "MEDIUM",
  cvss: 5,
  kev: false,
  products: ["mysql"],
  confidence: "HIGH",
  category: "database",
  summary: "[DEMO] A flaw",
  epss: 0.001,
  ...over,
});

const rows: FilterableRow[] = [
  row({
    id: "CVE-2099-10001",
    severity: "CRITICAL",
    cvss: 9.8,
    kev: true,
    epss: 0.95,
    summary: "[DEMO] Heap overflow in replication",
  }),
  row({
    id: "CVE-2099-10002",
    products: ["postgresql", "pgjdbc"],
    summary: "[DEMO] Logical decoding bypass",
  }),
  row({
    id: "CVE-2099-10003",
    products: ["redis"],
    confidence: "LOW",
    severity: "HIGH",
    cvss: 7.5,
    published: ago(10),
  }),
  row({
    id: "CVE-2099-10004",
    products: ["pgjdbc"],
    confidence: "MEDIUM",
    published: ago(45),
    epss: 0.2,
  }),
  row({ id: "CVE-2099-10005", severity: "UNSCORED", cvss: null, published: ago(200), epss: null }),
  row({
    id: "CVE-2099-10006",
    products: [],
    confidence: null,
    category: "app_sqli",
    summary: "[DEMO] SQL injection in Acme plugin",
  }),
];

const run = (qs: string, extra?: { searchHits?: Set<string> | null }) =>
  applyFilters(rows, parseFilters(qs), { products, now: NOW, ...extra }).map((r) => r.id.slice(-2));

describe("URL filters", () => {
  test("defaults serialize to an empty query", () => {
    expect(serializeFilters(defaultFilters())).toBe("");
    expect(parseFilters("")).toEqual(defaultFilters());
  });

  test("round-trip", () => {
    const qs =
      "q=heap&product=mysql,redis&vendor=Oracle&category=relational&severity=critical,high&kev=1&epss=10&range=90d&conf=medium";
    const f = parseFilters(qs);
    expect(f.products).toEqual(["mysql", "redis"]);
    expect(f.severities).toEqual(["CRITICAL", "HIGH"]);
    expect(f.minEpss).toBeCloseTo(0.1);
    expect(parseFilters(serializeFilters(f))).toEqual(f);
  });

  test("invalid values fall back to defaults", () => {
    const f = parseFilters("severity=bogus&range=5y&conf=x&epss=abc&from=2026-13");
    expect(f.severities).toEqual([]);
    expect(f.range).toBe("30d");
    expect(f.conf).toBe("low");
    expect(f.minEpss).toBe(0);
    expect(f.from).toBeNull();
  });

  test("custom from/to overrides range", () => {
    const f = parseFilters("range=7d&from=2026-01-01&to=2026-01-31");
    expect(dateWindow(f, NOW)).toEqual([
      Date.parse("2026-01-01T00:00:00Z"),
      Date.parse("2026-01-31T23:59:59.999Z"),
    ]);
    expect(serializeFilters(f)).toBe("from=2026-01-01&to=2026-01-31");
  });
});

describe("applyFilters", () => {
  test("default range is the last 30 days", () =>
    expect(run("")).toEqual(["01", "02", "03", "06"]));
  test("all time", () => expect(run("range=all")).toEqual(["01", "02", "03", "04", "05", "06"]));
  test("severity", () => expect(run("range=all&severity=critical,unscored")).toEqual(["01", "05"]));
  test("KEV only", () => expect(run("range=all&kev=1")).toEqual(["01"]));
  test("minimum EPSS treats missing EPSS as 0", () =>
    expect(run("range=all&epss=10")).toEqual(["01", "04"]));
  test("product matches any affected product", () =>
    expect(run("range=all&product=pgjdbc")).toEqual(["02", "04"]));
  test("vendor", () => expect(run("range=all&vendor=Redis")).toEqual(["03"]));
  test("category", () => expect(run("range=all&category=driver")).toEqual(["02", "04"]));
  test("App SQLi category", () => expect(run("range=all&category=app_sqli")).toEqual(["06"]));
  test("confidence: hide unconfirmed", () =>
    expect(run("range=all&conf=medium")).toEqual(["01", "02", "04", "05", "06"]));
  test("confidence: high only", () =>
    expect(run("range=all&conf=high")).toEqual(["01", "02", "05", "06"]));
  test("combined", () =>
    expect(run("range=all&category=relational&severity=medium")).toEqual(["02"]));
  test("search hits restrict results", () =>
    expect(run("range=all", { searchHits: new Set(["CVE-2099-10003"]) })).toEqual(["03"]));
});

describe("search", () => {
  const search = createSearch(rows, products);
  const ids = (q: string) => [...(search.search(q) ?? [])].map((id) => id.slice(-2)).sort();

  test("empty query → no restriction", () => expect(search.search("  ")).toBeNull());
  test("full-text with prefix", () => expect(ids("replic")).toEqual(["01"]));
  test("product and vendor names", () => expect(ids("postgresql")).toEqual(["02", "04"]));
  test("product name", () => expect(ids("pgjdbc")).toEqual(["02", "04"]));
  test("vendor name via product", () => expect(ids("redis")).toEqual(["03"]));
  test("exact CVE ID", () => expect(ids("CVE-2099-10004")).toEqual(["04"]));
  test("ID without prefix", () => expect(ids("2099-10005")).toEqual(["05"]));
  test("multiple words are ANDed", () => expect(ids("sql injection acme")).toEqual(["06"]));
});

describe("lazy shards", () => {
  const months = ["2026-11", "2026-10", "2026-09", "2025-01"];
  test("window selects overlapping months", () => {
    expect(shardsForWindow(months, [Date.parse("2026-10-15T00:00:00Z"), null])).toEqual([
      "2026-11",
      "2026-10",
    ]);
    expect(shardsForWindow(months, [null, null])).toEqual(months);
    expect(
      shardsForWindow(months, [
        Date.parse("2026-09-01T00:00:00Z"),
        Date.parse("2026-09-30T00:00:00Z"),
      ]),
    ).toEqual(["2026-09"]);
  });

  test("mergeRows dedupes by ID and sorts newest first", () => {
    const merged = mergeRows(
      [rows[0] as FilterableRow],
      [rows[4] as FilterableRow, { ...(rows[0] as FilterableRow), summary: "dup" }],
    );
    expect(merged.map((r) => r.id)).toEqual(["CVE-2099-10001", "CVE-2099-10005"]);
    expect(merged[0]?.summary).not.toBe("dup");
  });
});
