import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { loadSettings } from "../config";
import {
  type CveRecord,
  CveRecord as CveRecordSchema,
  type EpssCurrent,
  EpssCurrent as EpssCurrentSchema,
  type EpssHistory,
  EpssHistory as EpssHistorySchema,
  type EpssPoint,
  type EventsShard,
  EventsShard as EventsShardSchema,
  type Latest,
  Latest as LatestSchema,
  type Stats,
  Stats as StatsSchema,
  type Status,
  Status as StatusSchema,
} from "../schemas/data";

/**
 * Build-time data access for the site. Reads data/ (written by demo:generate now,
 * by the real sync later) and validates every file with the shared schemas.
 */

export const DATA_DIR = process.env.CVEBASE_DATA_DIR ?? join(process.cwd(), "data");

function missing(): never {
  throw new Error(
    `No data found in ${DATA_DIR}. Run \`bun run demo:generate\` first (demo stage).`,
  );
}

function readJson<T>(rel: string, schema: { parse: (v: unknown) => T }): T {
  const path = join(DATA_DIR, rel);
  if (!existsSync(path)) missing();
  try {
    return schema.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch (err) {
    throw new Error(`Invalid data file ${rel}: ${err instanceof Error ? err.message : err}`);
  }
}

function listJson(subdir: string): string[] {
  const dir = join(DATA_DIR, subdir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
}

const cache = new Map<string, unknown>();
let cacheStamp = "";

/** Memoize per data version: regenerating data/ (new status.json) invalidates the cache in dev. */
function memo<T>(key: string, fn: () => T): T {
  const statusPath = join(DATA_DIR, "status.json");
  const stamp = existsSync(statusPath) ? String(statSync(statusPath).mtimeMs) : "none";
  if (stamp !== cacheStamp) {
    cache.clear();
    cacheStamp = stamp;
  }
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key) as T;
}

/** All CVE records the site should show (App SQLi only when enabled in settings). */
export function loadCves(): CveRecord[] {
  return memo("cves", () => {
    const appSqli = loadSettings().appSqli;
    const out: CveRecord[] = [];
    for (const year of existsSync(join(DATA_DIR, "cves"))
      ? readdirSync(join(DATA_DIR, "cves"))
      : []) {
      for (const file of listJson(`cves/${year}`)) {
        const rec = readJson(`cves/${year}/${file}`, CveRecordSchema);
        if (rec.category === "app_sqli" && !appSqli) continue;
        out.push(rec);
      }
    }
    return out.sort((a, b) => (a.published < b.published ? 1 : a.published > b.published ? -1 : 0));
  });
}

export function loadCveMap(): Map<string, CveRecord> {
  return memo("cveMap", () => new Map(loadCves().map((c) => [c.id, c])));
}

export const loadLatest = (): Latest => memo("latest", () => readJson("latest.json", LatestSchema));
export const loadStatus = (): Status => memo("status", () => readJson("status.json", StatusSchema));
export const loadStats = (): Stats => memo("stats", () => readJson("stats.json", StatsSchema));
export const loadEpssCurrent = (): EpssCurrent =>
  memo("epss", () => readJson("epss/current.json", EpssCurrentSchema));

export function loadEpssHistory(): Map<string, EpssPoint[]> {
  return memo("epssHistory", () => {
    const out = new Map<string, EpssPoint[]>();
    for (const file of listJson("epss/history")) {
      const h: EpssHistory = readJson(`epss/history/${file}`, EpssHistorySchema);
      for (const [id, pts] of Object.entries(h.points)) {
        out.set(id, [...(out.get(id) ?? []), ...pts]);
      }
    }
    for (const pts of out.values()) pts.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    return out;
  });
}

export function loadEvents(): EventsShard["events"] {
  return memo("events", () => {
    const ids = new Set(loadCves().map((c) => c.id));
    return listJson("events")
      .reverse()
      .flatMap((f) => readJson(`events/${f}`, EventsShardSchema).events)
      .filter((e) => ids.has(e.cve_id));
  });
}

/** Every file under data/, as forward-slash relative paths (for the static JSON API). */
export function listDataFiles(): string[] {
  if (!existsSync(DATA_DIR)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".json")) out.push(relative(DATA_DIR, p).split(sep).join("/"));
    }
  };
  walk(DATA_DIR);
  return out.sort();
}

export function readDataFile(rel: string): string {
  return readFileSync(join(DATA_DIR, rel), "utf8");
}
