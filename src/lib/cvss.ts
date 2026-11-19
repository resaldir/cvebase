import type { Severity } from "./schemas/data";

/** CVSS helpers: severity bands, v3.1 base score, and vector breakdown for display. */

export function severityFromScore(score: number): Exclude<Severity, "UNSCORED"> {
  if (score === 0) return "NONE";
  if (score < 4) return "LOW";
  if (score < 7) return "MEDIUM";
  if (score < 9) return "HIGH";
  return "CRITICAL";
}

/** CVSS v3.1 "Roundup" as defined in the specification (Appendix A). */
function roundup(x: number): number {
  const i = Math.round(x * 100000);
  return i % 10000 === 0 ? i / 100000 : (Math.floor(i / 10000) + 1) / 10;
}

const W31 = {
  AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
  AC: { L: 0.77, H: 0.44 },
  UI: { N: 0.85, R: 0.62 },
  CIA: { H: 0.56, L: 0.22, N: 0 },
} as const;

/** Base score for a CVSS:3.1 vector (base metrics only). */
export function cvss31BaseScore(vector: string): number {
  const m = parseVector(vector);
  const scopeChanged = m.S === "C";
  const pr =
    m.PR === "N" ? 0.85 : m.PR === "L" ? (scopeChanged ? 0.68 : 0.62) : scopeChanged ? 0.5 : 0.27;
  const c = W31.CIA[m.C as keyof typeof W31.CIA];
  const i = W31.CIA[m.I as keyof typeof W31.CIA];
  const a = W31.CIA[m.A as keyof typeof W31.CIA];
  const iss = 1 - (1 - c) * (1 - i) * (1 - a);
  const impact = scopeChanged ? 7.52 * (iss - 0.029) - 3.25 * (iss - 0.02) ** 15 : 6.42 * iss;
  const exploitability =
    8.22 *
    W31.AV[m.AV as keyof typeof W31.AV] *
    pr *
    W31.AC[m.AC as keyof typeof W31.AC] *
    W31.UI[m.UI as keyof typeof W31.UI];
  if (impact <= 0) return 0;
  return scopeChanged
    ? roundup(Math.min(1.08 * (impact + exploitability), 10))
    : roundup(Math.min(impact + exploitability, 10));
}

export function parseVector(vector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of vector.split("/").slice(1)) {
    const [k, v] = part.split(":");
    if (k && v) out[k] = v;
  }
  return out;
}

type MetricDef = { name: string; values: Record<string, string> };

const CIA_VALUES = { H: "High", L: "Low", N: "None" };

const METRICS_31: Record<string, MetricDef> = {
  AV: {
    name: "Attack Vector",
    values: { N: "Network", A: "Adjacent", L: "Local", P: "Physical" },
  },
  AC: { name: "Attack Complexity", values: { L: "Low", H: "High" } },
  PR: { name: "Privileges Required", values: { N: "None", L: "Low", H: "High" } },
  UI: { name: "User Interaction", values: { N: "None", R: "Required" } },
  S: { name: "Scope", values: { U: "Unchanged", C: "Changed" } },
  C: { name: "Confidentiality", values: CIA_VALUES },
  I: { name: "Integrity", values: CIA_VALUES },
  A: { name: "Availability", values: CIA_VALUES },
};

const METRICS_40: Record<string, MetricDef> = {
  AV: METRICS_31.AV as MetricDef,
  AC: METRICS_31.AC as MetricDef,
  AT: { name: "Attack Requirements", values: { N: "None", P: "Present" } },
  PR: METRICS_31.PR as MetricDef,
  UI: { name: "User Interaction", values: { N: "None", P: "Passive", A: "Active" } },
  VC: { name: "Vulnerable System Confidentiality", values: CIA_VALUES },
  VI: { name: "Vulnerable System Integrity", values: CIA_VALUES },
  VA: { name: "Vulnerable System Availability", values: CIA_VALUES },
  SC: { name: "Subsequent System Confidentiality", values: CIA_VALUES },
  SI: { name: "Subsequent System Integrity", values: CIA_VALUES },
  SA: { name: "Subsequent System Availability", values: CIA_VALUES },
};

export type VectorPart = { key: string; name: string; value: string; raw: string };

/** Human-readable breakdown of a CVSS v3.1 or v4.0 vector's base metrics. */
export function describeVector(vector: string): VectorPart[] {
  const defs = vector.startsWith("CVSS:4.0/") ? METRICS_40 : METRICS_31;
  const parsed = parseVector(vector);
  return Object.entries(parsed).map(([key, raw]) => {
    const def = defs[key];
    return {
      key,
      raw,
      name: def?.name ?? key,
      value: def?.values[raw] ?? raw,
    };
  });
}
