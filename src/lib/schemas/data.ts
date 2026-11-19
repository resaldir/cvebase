import { z } from "zod";

/**
 * Schemas for every file under data/ (BRIEF §5). Shared by the demo generator,
 * the future sync script and the site. Objects are strict so a mismatch fails loudly.
 *
 * Every top-level file may carry `notice` — set to the demo notice when the data is
 * generated (DATA_MODE=demo) and omitted by the real sync.
 */

const isoDateTime = z.iso.datetime();
const isoDate = z.iso.date();
const cveId = z.string().regex(/^CVE-\d{4}-\d{4,}$/, "must be a CVE ID");
const productId = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const notice = z.string().optional();

export const severities = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE", "UNSCORED"] as const;
export const Severity = z.enum(severities);
export type Severity = z.infer<typeof Severity>;

export const confidences = ["HIGH", "MEDIUM", "LOW"] as const;
export const Confidence = z.enum(confidences);
export type Confidence = z.infer<typeof Confidence>;

export const MatchMethod = z.enum(["nvd_cpe", "cna_affected", "ghsa_package", "keyword"]);
export type MatchMethod = z.infer<typeof MatchMethod>;

export const CveCategory = z.enum(["database", "app_sqli"]);
export type CveCategory = z.infer<typeof CveCategory>;

export const eventTypes = [
  "published",
  "severity_changed",
  "cvss_changed",
  "kev_added",
  "epss_crossed_10",
  "epss_crossed_50",
  "match_upgraded",
] as const;
export const EventType = z.enum(eventTypes);
export type EventType = z.infer<typeof EventType>;

const eventValue = z.union([z.string(), z.number(), z.null()]);

export const ChangeEvent = z.strictObject({
  cve_id: cveId,
  type: EventType,
  old: eventValue,
  new: eventValue,
  detected_at: isoDateTime,
  /** Set for match_upgraded: which product's match changed. */
  product_id: productId.optional(),
});
export type ChangeEvent = z.infer<typeof ChangeEvent>;

const CvssBase = {
  score: z.number().min(0).max(10),
  severity: Severity.exclude(["UNSCORED"]),
  source: z.string().min(1),
};
export const CvssV31 = z.strictObject({
  ...CvssBase,
  vector: z.string().regex(/^CVSS:3\.1\//),
});
export const CvssV40 = z.strictObject({
  ...CvssBase,
  vector: z.string().regex(/^CVSS:4\.0\//),
});

export const VersionRange = z.strictObject({
  version: z.string().optional(),
  versionStartIncluding: z.string().optional(),
  versionStartExcluding: z.string().optional(),
  versionEndIncluding: z.string().optional(),
  versionEndExcluding: z.string().optional(),
});
export type VersionRange = z.infer<typeof VersionRange>;

export const Match = z.strictObject({
  productId,
  method: MatchMethod,
  confidence: Confidence,
  affected: z.array(VersionRange),
  /** Short human-readable reason, e.g. the CPE or keyword that matched. */
  evidence: z.string().nullable(),
});
export type Match = z.infer<typeof Match>;

export const Kev = z.strictObject({
  dateAdded: isoDate,
  dueDate: isoDate,
  knownRansomwareCampaignUse: z.enum(["Known", "Unknown"]),
  requiredAction: z.string(),
  vulnerabilityName: z.string(),
  notes: z.string().nullable(),
});
export type Kev = z.infer<typeof Kev>;

export const Reference = z.strictObject({
  url: z.url(),
  source: z.string().nullable(),
  tags: z.array(z.string()),
});

export const CveRecord = z.strictObject({
  notice,
  id: cveId,
  published: isoDateTime,
  lastModified: isoDateTime,
  vulnStatus: z.string(),
  category: CveCategory,
  description: z.string().min(1),
  /** One-line summary for feeds and index rows. */
  summary: z.string().min(1).max(200),
  severity: Severity,
  cvss: z.strictObject({ v31: CvssV31.nullable(), v40: CvssV40.nullable() }),
  cwes: z.array(z.strictObject({ id: z.string(), name: z.string().nullable() })),
  references: z.array(Reference),
  vendorAdvisories: z.array(z.strictObject({ title: z.string(), url: z.url() })),
  kev: Kev.nullable(),
  matches: z.array(Match),
  events: z.array(ChangeEvent),
  /** Trimmed source excerpts — never raw API blobs. */
  sources: z.strictObject({
    nvd: z.strictObject({ vulnStatus: z.string(), lastModified: isoDateTime }).nullable(),
    cvelist: z
      .strictObject({
        assigner: z.string(),
        datePublished: isoDateTime,
        dateUpdated: isoDateTime,
      })
      .nullable(),
  }),
});
export type CveRecord = z.infer<typeof CveRecord>;

export const IndexRow = z.strictObject({
  id: cveId,
  published: isoDateTime,
  severity: Severity,
  cvss: z.number().min(0).max(10).nullable(),
  kev: z.boolean(),
  products: z.array(productId),
  /** Best match confidence; null for App SQLi rows (no product match). */
  confidence: Confidence.nullable(),
  category: CveCategory,
  summary: z.string(),
});
export type IndexRow = z.infer<typeof IndexRow>;

export const IndexShard = z.strictObject({
  notice,
  month: z.string().regex(/^\d{4}-\d{2}$/),
  rows: z.array(IndexRow),
});
export type IndexShard = z.infer<typeof IndexShard>;

export const LatestRow = IndexRow.extend({
  epss: z.number().min(0).max(1).nullable(),
  percentile: z.number().min(0).max(1).nullable(),
});
export type LatestRow = z.infer<typeof LatestRow>;

export const Latest = z.strictObject({
  notice,
  generated_at: isoDateTime,
  /** Data update time (last successful sync). */
  updated_at: isoDateTime,
  total: z.number().int().nonnegative(),
  /** Available index shards, newest first, so clients can load them lazily. */
  shards: z.array(z.strictObject({ month: z.string(), count: z.number().int().nonnegative() })),
  rows: z.array(LatestRow),
});
export type Latest = z.infer<typeof Latest>;

export const EpssScore = z.strictObject({
  epss: z.number().min(0).max(1),
  percentile: z.number().min(0).max(1),
  date: isoDate,
});
export type EpssScore = z.infer<typeof EpssScore>;

export const EpssCurrent = z.strictObject({
  notice,
  date: isoDate.nullable(),
  scores: z.record(cveId, EpssScore),
});
export type EpssCurrent = z.infer<typeof EpssCurrent>;

/** [date, epss, percentile] */
export const EpssPoint = z.tuple([isoDate, z.number().min(0).max(1), z.number().min(0).max(1)]);
export type EpssPoint = z.infer<typeof EpssPoint>;

export const EpssHistory = z.strictObject({
  notice,
  year: z.string().regex(/^\d{4}$/),
  points: z.record(cveId, z.array(EpssPoint)),
});
export type EpssHistory = z.infer<typeof EpssHistory>;

export const EventsShard = z.strictObject({
  notice,
  month: z.string().regex(/^\d{4}-\d{2}$/),
  events: z.array(ChangeEvent),
});
export type EventsShard = z.infer<typeof EventsShard>;

export const sourceIds = ["nvd", "cvelist", "kev", "epss"] as const;
export const SourceId = z.enum(sourceIds);
export type SourceId = z.infer<typeof SourceId>;

export const State = z.strictObject({
  notice,
  sources: z.record(
    SourceId,
    z.strictObject({
      cursor: isoDateTime.nullable(),
      lastFetch: isoDateTime.nullable(),
      etag: z.string().nullable(),
      contentHash: z.string().nullable(),
    }),
  ),
});
export type State = z.infer<typeof State>;

export const SourceStatus = z.strictObject({
  id: SourceId,
  name: z.string(),
  status: z.enum(["ok", "error", "skipped"]),
  lastRun: isoDateTime.nullable(),
  lastSuccess: isoDateTime.nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  counts: z.strictObject({
    fetched: z.number().int().nonnegative(),
    new: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
  }),
  error: z.string().nullable(),
});
export type SourceStatus = z.infer<typeof SourceStatus>;

export const Status = z.strictObject({
  notice,
  generated_at: isoDateTime,
  lastRun: isoDateTime.nullable(),
  /** Last run where at least one source succeeded. Staleness is computed from this. */
  lastSuccessfulRun: isoDateTime.nullable(),
  sources: z.array(SourceStatus),
});
export type Status = z.infer<typeof Status>;

const severityCounts = z.strictObject(
  Object.fromEntries(severities.map((s) => [s, z.number().int().nonnegative()])) as Record<
    Severity,
    z.ZodNumber
  >,
);
export type SeverityCounts = Record<Severity, number>;

export const Stats = z.strictObject({
  notice,
  generated_at: isoDateTime,
  totals: z.strictObject({
    all: z.number().int().nonnegative(),
    last24h: z.number().int().nonnegative(),
    last7d: z.number().int().nonnegative(),
    last30d: z.number().int().nonnegative(),
    kev: z.number().int().nonnegative(),
    kevAdded30d: z.number().int().nonnegative(),
    /** App SQLi CVEs, never counted in product totals. */
    appSqli: z.number().int().nonnegative(),
  }),
  bySeverity: severityCounts,
  byProduct: z.array(
    z.strictObject({
      productId,
      total: z.number().int().nonnegative(),
      last30d: z.number().int().nonnegative(),
      kev: z.number().int().nonnegative(),
      bySeverity: severityCounts,
    }),
  ),
  kevAdditions: z.array(z.strictObject({ cve_id: cveId, dateAdded: isoDate })),
  /** Weekly published counts by severity; week = ISO date of the Monday (UTC). */
  trend: z.array(z.strictObject({ week: isoDate, counts: severityCounts })),
});
export type Stats = z.infer<typeof Stats>;

/** Map a path relative to data/ to its schema. Used by the generator, tests and the sync. */
export function schemaForDataPath(rel: string): z.ZodType | null {
  if (/^cves\/\d{4}\/CVE-\d{4}-\d+\.json$/.test(rel)) return CveRecord;
  if (rel === "epss/current.json") return EpssCurrent;
  if (/^epss\/history\/\d{4}\.json$/.test(rel)) return EpssHistory;
  if (/^index\/\d{4}-\d{2}\.json$/.test(rel)) return IndexShard;
  if (rel === "latest.json") return Latest;
  if (/^events\/\d{4}-\d{2}\.json$/.test(rel)) return EventsShard;
  if (rel === "state.json") return State;
  if (rel === "status.json") return Status;
  if (rel === "stats.json") return Stats;
  return null;
}
