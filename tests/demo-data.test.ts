import { describe, expect, test } from "bun:test";
import { EMPTY_PRODUCT_ID, LARGE_COUNT, scenarios } from "../scripts/demo/generator";
import { validateDataFiles } from "../src/lib/data/write";
import type { CveRecord, EpssCurrent, Latest, Stats, Status } from "../src/lib/schemas/data";
import { eventTypes, severities } from "../src/lib/schemas/data";
import { FIXED_NOW, gen } from "./helpers";

const cvesOf = (files: Map<string, unknown>) =>
  [...files.entries()].filter(([k]) => k.startsWith("cves/")).map(([, v]) => v as CveRecord);

describe("generated data passes the schemas", () => {
  for (const scenario of scenarios) {
    test(`scenario: ${scenario}`, () => {
      const files = gen(scenario);
      expect(validateDataFiles(files)).toEqual([]);
      for (const required of [
        "latest.json",
        "status.json",
        "state.json",
        "stats.json",
        "epss/current.json",
      ]) {
        expect(files.has(required)).toBe(true);
      }
    });
  }

  test("with appSqli enabled", () => {
    const files = gen("default", { count: 200, settings: { appSqli: true } });
    expect(validateDataFiles(files)).toEqual([]);
    const app = cvesOf(files).filter((c) => c.category === "app_sqli");
    expect(app.length).toBeGreaterThan(0);
    for (const c of app) expect(c.matches).toEqual([]);
    // Never counted in product totals.
    const stats = files.get("stats.json") as Stats;
    expect(stats.totals.appSqli).toBe(app.length);
    expect(stats.totals.all).toBe(200);
  });

  test("appSqli disabled produces no App SQLi records", () => {
    expect(cvesOf(gen("default", { count: 200 })).some((c) => c.category === "app_sqli")).toBe(
      false,
    );
  });

  test("a schema mismatch is reported", () => {
    const files = gen("default", { count: 20 });
    const [key, rec] = [...files.entries()].find(([k]) => k.startsWith("cves/")) as [
      string,
      CveRecord,
    ];
    files.set(key, { ...rec, severity: "SEVERE" });
    files.set("unknown.json", {});
    const problems = validateDataFiles(files);
    expect(problems.some((p) => p.includes("severity"))).toBe(true);
    expect(problems.some((p) => p.includes("unknown.json"))).toBe(true);
  });
});

describe("demo data is obviously fake", () => {
  const files = gen("default");
  const cves = cvesOf(files);

  test("IDs are CVE-2099-10001 onward", () => {
    const ids = cves.map((c) => c.id).sort();
    expect(ids[0]).toBe("CVE-2099-10001");
    for (const id of ids) expect(id).toMatch(/^CVE-2099-1\d{4}$/);
  });

  test("descriptions start with [DEMO] and links point to example.com", () => {
    for (const c of cves) {
      expect(c.description.startsWith("[DEMO]")).toBe(true);
      for (const r of c.references) expect(r.url.startsWith("https://example.com/")).toBe(true);
      for (const a of c.vendorAdvisories)
        expect(a.url.startsWith("https://example.com/")).toBe(true);
    }
  });

  test("every file carries the demo notice", () => {
    for (const [path, value] of files) {
      expect({ path, notice: (value as { notice?: string }).notice }).toMatchObject({
        notice: expect.stringContaining("Demo data"),
      });
    }
  });
});

describe("default scenario covers every UI case", () => {
  const files = gen("default");
  const cves = cvesOf(files).filter((c) => c.category === "database");
  const epss = files.get("epss/current.json") as EpssCurrent;
  const today = FIXED_NOW.toISOString().slice(0, 10);

  test("600 CVEs by default, mostly medium/high", () => {
    expect(cves.length).toBe(600);
    const count = (s: string) => cves.filter((c) => c.severity === s).length;
    for (const s of severities) expect(count(s)).toBeGreaterThan(0);
    expect(count("MEDIUM") + count("HIGH")).toBeGreaterThan(cves.length / 2);
    expect(count("CRITICAL")).toBeLessThan(count("HIGH"));
  });

  test("CVSS v3.1 only, v4.0 only, and both", () => {
    expect(cves.some((c) => c.cvss.v31 && !c.cvss.v40)).toBe(true);
    expect(cves.some((c) => !c.cvss.v31 && c.cvss.v40)).toBe(true);
    expect(cves.some((c) => c.cvss.v31 && c.cvss.v40)).toBe(true);
    expect(cves.some((c) => c.severity === "UNSCORED" && c.vulnStatus !== "Analyzed")).toBe(true);
  });

  test("KEV: ransomware use, past and future due dates", () => {
    const kev = cves.filter((c) => c.kev);
    expect(kev.some((c) => c.kev?.knownRansomwareCampaignUse === "Known")).toBe(true);
    expect(kev.some((c) => (c.kev?.dueDate ?? "") < today)).toBe(true);
    expect(kev.some((c) => (c.kev?.dueDate ?? "") >= today)).toBe(true);
    for (const c of kev) {
      expect(c.kev?.dateAdded && c.kev.dateAdded >= c.published.slice(0, 10)).toBe(true);
      expect((c.kev?.dateAdded ?? "") <= today).toBe(true);
    }
  });

  test("EPSS from near 0 to above 90%, with history", () => {
    const scores = Object.values(epss.scores).map((s) => s.epss);
    expect(Math.min(...scores)).toBeLessThan(0.001);
    expect(Math.max(...scores)).toBeGreaterThan(0.9);
    expect([...files.keys()].some((k) => k.startsWith("epss/history/"))).toBe(true);
  });

  test("matches: HIGH, MEDIUM, LOW; multi-product; with and without ranges", () => {
    const conf = new Set(cves.flatMap((c) => c.matches.map((m) => m.confidence)));
    expect([...conf].sort()).toEqual(["HIGH", "LOW", "MEDIUM"]);
    expect(cves.some((c) => c.matches.length > 1)).toBe(true);
    expect(cves.some((c) => c.matches.some((m) => m.affected.length > 0))).toBe(true);
    expect(cves.some((c) => c.matches.every((m) => m.affected.length === 0))).toBe(true);
  });

  test("long descriptions, long reference lists and minimal records", () => {
    expect(cves.some((c) => c.description.length > 1500)).toBe(true);
    expect(cves.some((c) => c.references.length >= 40)).toBe(true);
    expect(cves.some((c) => c.references.length === 0 && c.cwes.length === 0)).toBe(true);
  });

  test("every change event type occurs", () => {
    const types = new Set(cves.flatMap((c) => c.events.map((e) => e.type)));
    for (const t of eventTypes) expect(types.has(t)).toBe(true);
  });

  test("events never come after the data update time", () => {
    const updated = (files.get("status.json") as Status).lastSuccessfulRun ?? "";
    for (const c of cves) for (const e of c.events) expect(e.detected_at <= updated).toBe(true);
  });

  test("one enabled product has zero CVEs", () => {
    const stats = files.get("stats.json") as Stats;
    expect(stats.byProduct.find((p) => p.productId === EMPTY_PRODUCT_ID)?.total).toBe(0);
  });

  test("more MySQL, Oracle and PostgreSQL than niche products", () => {
    const stats = files.get("stats.json") as Stats;
    const total = (id: string) => stats.byProduct.find((p) => p.productId === id)?.total ?? 0;
    for (const big of ["mysql", "oracle-database", "postgresql"]) {
      expect(total(big)).toBeGreaterThan(total("neo4j"));
      expect(total(big)).toBeGreaterThan(total("tidb"));
    }
  });
});

describe("scenarios", () => {
  test("stale: last successful run 40 hours ago", () => {
    const status = gen("stale", { count: 50 }).get("status.json") as Status;
    const hours = (FIXED_NOW.getTime() - Date.parse(status.lastSuccessfulRun ?? "")) / 3_600_000;
    expect(hours).toBe(40);
  });

  test("default: updated a few hours ago", () => {
    const status = gen("default", { count: 50 }).get("status.json") as Status;
    const hours = (FIXED_NOW.getTime() - Date.parse(status.lastSuccessfulRun ?? "")) / 3_600_000;
    expect(hours).toBeLessThan(6);
    expect(status.sources.every((s) => s.status === "ok")).toBe(true);
  });

  test("source-error: one source failing with a message, others fine", () => {
    const status = gen("source-error", { count: 50 }).get("status.json") as Status;
    const failed = status.sources.filter((s) => s.status === "error");
    expect(failed.length).toBe(1);
    expect(failed[0]?.error).toBeTruthy();
    expect(status.sources.filter((s) => s.status === "ok").length).toBe(status.sources.length - 1);
  });

  test("empty: no CVEs at all", () => {
    const files = gen("empty");
    expect(cvesOf(files)).toEqual([]);
    expect((files.get("latest.json") as Latest).rows).toEqual([]);
    expect((files.get("stats.json") as Stats).totals.all).toBe(0);
  });

  test("large: 5,000 CVEs", () => {
    expect(cvesOf(gen("large")).length).toBe(LARGE_COUNT);
  });
});
