import type { Confidence, EventType, Severity } from "./schemas/data";

/** Formatting helpers shared by Astro pages and Preact islands (no node APIs). */

export function formatDateTime(iso: string, timeZone: string): string {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
  return `${date}, ${time} ${tzLabel(timeZone, d)}`;
}

export function formatDate(iso: string, timeZone: string): string {
  // Plain YYYY-MM-DD dates (KEV) are calendar dates — don't shift them by timezone.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: /^\d{4}-\d{2}-\d{2}$/.test(iso) ? "UTC" : timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function tzLabel(timeZone: string, d = new Date()): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName");
  return (part?.value ?? timeZone).replace("GMT", "UTC");
}

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = now - Date.parse(iso);
  const future = diff < 0;
  const s = Math.abs(diff) / 1000;
  let text: string;
  if (s < 60) text = "just now";
  else if (s < 3600) text = `${Math.floor(s / 60)} min`;
  else if (s < 172800) text = `${Math.floor(s / 3600)} h`;
  else if (s < 86400 * 30) text = `${Math.floor(s / 86400)} d`;
  else if (s < 86400 * 365) text = `${Math.floor(s / (86400 * 30))} mo`;
  else text = `${Math.floor(s / (86400 * 365))} y`;
  if (text === "just now") return text;
  return future ? `in ${text}` : `${text} ago`;
}

export function hoursSince(iso: string, now = Date.now()): number {
  return (now - Date.parse(iso)) / 3_600_000;
}

export function formatEpss(score: number | null | undefined): string {
  if (score === null || score === undefined) return "—";
  const pct = score * 100;
  if (pct < 0.1) return "<0.1%";
  if (pct < 10) return `${pct.toFixed(1)}%`;
  return `${pct.toFixed(0)}%`;
}

export function formatPercentile(p: number | null | undefined): string {
  if (p === null || p === undefined) return "—";
  return `${(p * 100).toFixed(1)}th pct`;
}

export const severityLabel: Record<Severity, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  NONE: "None",
  UNSCORED: "Awaiting analysis",
};

export const severityShort: Record<Severity, string> = {
  CRITICAL: "CRIT",
  HIGH: "HIGH",
  MEDIUM: "MED",
  LOW: "LOW",
  NONE: "NONE",
  UNSCORED: "N/A",
};

/** CSS class (defined in global.css) — the single source of severity colors. */
export const severityClass = (s: Severity) => `sev sev-${s.toLowerCase()}`;

export const confidenceLabel: Record<Confidence, string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Unconfirmed",
};

export const eventLabel: Record<EventType, string> = {
  published: "Published",
  severity_changed: "Severity changed",
  cvss_changed: "CVSS changed",
  kev_added: "Added to KEV",
  epss_crossed_10: "EPSS crossed 10%",
  epss_crossed_50: "EPSS crossed 50%",
  match_upgraded: "Match upgraded",
};

export const methodLabel: Record<string, string> = {
  nvd_cpe: "NVD CPE configuration",
  cna_affected: "CNA affected data (cvelistV5)",
  ghsa_package: "GitHub Advisory package",
  keyword: "Keyword in description",
};

export function formatEventValue(type: EventType, v: string | number | null): string {
  if (v === null) return "—";
  if (type.startsWith("epss_") && typeof v === "number") return formatEpss(v);
  if (typeof v === "string" && v in severityLabel) return severityLabel[v as Severity];
  if (typeof v === "string" && v in confidenceLabel) return confidenceLabel[v as Confidence];
  return String(v);
}
