import {
  type ChangeEvent,
  type Confidence,
  type CveRecord,
  type EpssCurrent,
  type EventsShard,
  type IndexRow,
  type IndexShard,
  type Latest,
  type Severity,
  type SeverityCounts,
  type Stats,
  severities,
} from "../schemas/data";

/**
 * Derived files (index shards, latest.json, events shards, stats.json) computed from
 * CVE records + EPSS. Independent of where the records came from, so the demo
 * generator and the real sync share this code.
 */

const CONF_RANK: Record<Confidence, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

export function bestConfidence(cve: CveRecord): Confidence | null {
  let best: Confidence | null = null;
  for (const m of cve.matches) {
    if (!best || CONF_RANK[m.confidence] > CONF_RANK[best]) best = m.confidence;
  }
  return best;
}

export function primaryCvssScore(cve: CveRecord): number | null {
  return cve.cvss.v40?.score ?? cve.cvss.v31?.score ?? null;
}

export function toIndexRow(cve: CveRecord): IndexRow {
  return {
    id: cve.id,
    published: cve.published,
    severity: cve.severity,
    cvss: primaryCvssScore(cve),
    kev: cve.kev !== null,
    products: [...new Set(cve.matches.map((m) => m.productId))].sort(),
    confidence: bestConfidence(cve),
    category: cve.category,
    summary: cve.summary,
  };
}

/** Newest first, ties broken by ID descending — a total, stable order. */
export function compareNewest(a: { published: string; id: string }, b: typeof a): number {
  if (a.published !== b.published) return a.published < b.published ? 1 : -1;
  return compareCveIdDesc(a.id, b.id);
}

export function compareCveIdDesc(a: string, b: string): number {
  const [, ya = "0", na = "0"] = a.split("-");
  const [, yb = "0", nb = "0"] = b.split("-");
  if (ya !== yb) return Number(yb) - Number(ya);
  return Number(nb) - Number(na);
}

export const monthOf = (iso: string) => iso.slice(0, 7);

export function buildIndexShards(cves: CveRecord[], notice?: string): IndexShard[] {
  const byMonth = new Map<string, IndexRow[]>();
  for (const cve of cves) {
    const month = monthOf(cve.published);
    const rows = byMonth.get(month) ?? [];
    rows.push(toIndexRow(cve));
    byMonth.set(month, rows);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([month, rows]) => ({ notice, month, rows: rows.sort(compareNewest) }));
}

export function buildLatest(opts: {
  cves: CveRecord[];
  epss: EpssCurrent;
  shards: IndexShard[];
  count: number;
  generatedAt: string;
  updatedAt: string;
  notice?: string;
}): Latest {
  const rows = opts.cves
    .map(toIndexRow)
    .sort(compareNewest)
    .slice(0, opts.count)
    .map((r) => {
      const e = opts.epss.scores[r.id];
      return { ...r, epss: e?.epss ?? null, percentile: e?.percentile ?? null };
    });
  return {
    notice: opts.notice,
    generated_at: opts.generatedAt,
    updated_at: opts.updatedAt,
    total: opts.cves.length,
    shards: opts.shards.map((s) => ({ month: s.month, count: s.rows.length })),
    rows,
  };
}

export function compareEvents(a: ChangeEvent, b: ChangeEvent): number {
  if (a.detected_at !== b.detected_at) return a.detected_at < b.detected_at ? 1 : -1;
  if (a.cve_id !== b.cve_id) return compareCveIdDesc(a.cve_id, b.cve_id);
  return a.type < b.type ? -1 : a.type > b.type ? 1 : 0;
}

export function buildEventsShards(cves: CveRecord[], notice?: string): EventsShard[] {
  const byMonth = new Map<string, ChangeEvent[]>();
  for (const cve of cves) {
    for (const ev of cve.events) {
      const month = monthOf(ev.detected_at);
      const list = byMonth.get(month) ?? [];
      list.push(ev);
      byMonth.set(month, list);
    }
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([month, events]) => ({ notice, month, events: events.sort(compareEvents) }));
}

export function emptySeverityCounts(): SeverityCounts {
  return Object.fromEntries(severities.map((s) => [s, 0])) as Record<Severity, number>;
}

/** Monday (UTC) of the ISO week containing `iso`, as YYYY-MM-DD. */
export function weekStart(iso: string): string {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export function buildStats(opts: {
  cves: CveRecord[];
  productIds: string[];
  now: Date;
  generatedAt: string;
  notice?: string;
  trendWeeks?: number;
}): Stats {
  const now = opts.now.getTime();
  const ago = (iso: string) => now - Date.parse(iso);
  const H = 3_600_000;
  const db = opts.cves.filter((c) => c.category === "database");
  const appSqli = opts.cves.length - db.length;

  const bySeverity = emptySeverityCounts();
  const products = new Map(
    opts.productIds.map((id) => [
      id,
      { productId: id, total: 0, last30d: 0, kev: 0, bySeverity: emptySeverityCounts() },
    ]),
  );
  let last24h = 0;
  let last7d = 0;
  let last30d = 0;
  for (const c of db) {
    const age = ago(c.published);
    if (age <= 24 * H) last24h++;
    if (age <= 7 * 24 * H) last7d++;
    if (age <= 30 * 24 * H) last30d++;
    bySeverity[c.severity]++;
    for (const pid of new Set(c.matches.map((m) => m.productId))) {
      const p = products.get(pid);
      if (!p) continue;
      p.total++;
      p.bySeverity[c.severity]++;
      if (c.kev) p.kev++;
      if (age <= 30 * 24 * H) p.last30d++;
    }
  }

  const kevAdditions = db
    .filter((c) => c.kev)
    .map((c) => ({ cve_id: c.id, dateAdded: c.kev?.dateAdded ?? "" }))
    .sort((a, b) =>
      a.dateAdded !== b.dateAdded
        ? a.dateAdded < b.dateAdded
          ? 1
          : -1
        : compareCveIdDesc(a.cve_id, b.cve_id),
    );
  const kevAdded30d = kevAdditions.filter(
    (k) => now - Date.parse(`${k.dateAdded}T00:00:00Z`) <= 30 * 24 * H,
  ).length;

  // Trend: one bucket per week for the last N weeks, oldest first, zero-filled.
  const weeks = opts.trendWeeks ?? 78;
  const trendMap = new Map<string, SeverityCounts>();
  const thisWeek = weekStart(opts.now.toISOString());
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(`${thisWeek}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i * 7);
    trendMap.set(d.toISOString().slice(0, 10), emptySeverityCounts());
  }
  for (const c of db) {
    const bucket = trendMap.get(weekStart(c.published));
    if (bucket) bucket[c.severity]++;
  }

  return {
    notice: opts.notice,
    generated_at: opts.generatedAt,
    totals: {
      all: db.length,
      last24h,
      last7d,
      last30d,
      kev: kevAdditions.length,
      kevAdded30d,
      appSqli,
    },
    bySeverity,
    byProduct: [...products.values()].sort(
      (a, b) => b.total - a.total || a.productId.localeCompare(b.productId),
    ),
    kevAdditions: kevAdditions.slice(0, 50),
    trend: [...trendMap.entries()].map(([week, counts]) => ({ week, counts })),
  };
}
