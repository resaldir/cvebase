import { describe, expect, test } from "bun:test";
import { stableStringify } from "../src/lib/data/stable-json";
import { gen } from "./helpers";

const serialize = (files: Map<string, unknown>) =>
  [...files.keys()]
    .sort()
    .map((k) => `${k}\n${stableStringify(files.get(k))}`)
    .join("\n");

describe("demo generator is deterministic", () => {
  test("same seed and time → byte-identical output", () => {
    expect(serialize(gen("default", { count: 300 }))).toBe(
      serialize(gen("default", { count: 300 })),
    );
  });

  test("every scenario is deterministic", () => {
    for (const s of ["stale", "source-error", "empty"] as const) {
      expect(serialize(gen(s, { count: 80 }))).toBe(serialize(gen(s, { count: 80 })));
    }
  });

  test("a different seed gives different data", () => {
    expect(serialize(gen("default", { count: 100, seed: "a" }))).not.toBe(
      serialize(gen("default", { count: 100, seed: "b" })),
    );
  });

  test("dates are relative to generation time", () => {
    const a = gen("default", { count: 20, now: new Date("2030-01-01T00:00:00Z") });
    const latest = a.get("latest.json") as { updated_at: string; rows: { published: string }[] };
    expect(latest.updated_at.startsWith("2029-12-31T21:00")).toBe(true);
    expect(latest.rows[0]?.published.startsWith("2029-12-31")).toBe(true);
  });
});

describe("stableStringify", () => {
  test("sorts keys recursively and drops undefined", () => {
    expect(stableStringify({ b: 1, a: { d: [{ z: 1, y: 2 }], c: undefined } })).toBe(
      `${JSON.stringify({ a: { d: [{ y: 2, z: 1 }] }, b: 1 }, null, 2)}\n`,
    );
  });
});
