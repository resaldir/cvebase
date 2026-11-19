import { describe, expect, test } from "bun:test";
import { joinBase, stripBase } from "../src/lib/base";
import { cvss31BaseScore, describeVector, severityFromScore } from "../src/lib/cvss";

describe("joinBase", () => {
  const cases: [string, string, string][] = [
    ["/", "/", "/"],
    ["/", "/cve/CVE-2099-10001/", "/cve/CVE-2099-10001/"],
    ["/", "data/latest.json", "/data/latest.json"],
    ["/cvebase/", "/", "/cvebase/"],
    ["/cvebase", "/", "/cvebase/"],
    ["/cvebase/", "/products/mysql/", "/cvebase/products/mysql/"],
    ["/cvebase", "data/latest.json", "/cvebase/data/latest.json"],
    ["cvebase/", "/stats/", "/cvebase/stats/"],
    ["/cvebase/", "/?product=mysql&range=all", "/cvebase/?product=mysql&range=all"],
    ["/cvebase/", "/cve/CVE-2099-1/#refs", "/cvebase/cve/CVE-2099-1/#refs"],
    ["/a/b/", "/feed.xml", "/a/b/feed.xml"],
    ["", "/x/", "/x/"],
  ];
  for (const [base, path, expected] of cases) {
    test(`${JSON.stringify(base)} + ${JSON.stringify(path)}`, () =>
      expect(joinBase(base, path)).toBe(expected));
  }

  test("absolute URLs are left alone", () => {
    expect(joinBase("/cvebase/", "https://example.com/x")).toBe("https://example.com/x");
    expect(joinBase("/cvebase/", "//cdn.example.com/x")).toBe("//cdn.example.com/x");
    expect(joinBase("/cvebase/", "mailto:a@example.com")).toBe("mailto:a@example.com");
  });

  test("stripBase", () => {
    expect(stripBase("/cvebase/", "/cvebase/stats/")).toBe("/stats/");
    expect(stripBase("/cvebase/", "/cvebase")).toBe("/");
    expect(stripBase("/", "/stats/")).toBe("/stats/");
    expect(stripBase("/cvebase/", "/cvebasement/")).toBe("/cvebasement/");
  });
});

describe("cvss", () => {
  test("v3.1 base scores match the specification", () => {
    expect(cvss31BaseScore("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")).toBe(9.8);
    expect(cvss31BaseScore("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H")).toBe(10);
    expect(cvss31BaseScore("CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N")).toBe(6.5);
    expect(cvss31BaseScore("CVSS:3.1/AV:L/AC:H/PR:H/UI:R/S:U/C:L/I:N/A:N")).toBe(1.8);
    expect(cvss31BaseScore("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N")).toBe(0);
  });

  test("severity bands", () => {
    expect([0, 0.1, 3.9, 4, 6.9, 7, 8.9, 9, 10].map(severityFromScore)).toEqual([
      "NONE",
      "LOW",
      "LOW",
      "MEDIUM",
      "MEDIUM",
      "HIGH",
      "HIGH",
      "CRITICAL",
      "CRITICAL",
    ]);
  });

  test("vector breakdown", () => {
    const parts = describeVector("CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:P/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N");
    expect(parts.find((p) => p.key === "UI")).toMatchObject({
      name: "User Interaction",
      value: "Passive",
    });
    expect(parts.length).toBe(11);
  });
});
