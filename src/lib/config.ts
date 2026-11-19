import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import {
  Settings,
  type Settings as SettingsT,
  Watchlist,
  type Watchlist as WatchlistT,
} from "./schemas/config";

/** Loads and validates config/*.yaml. Server/build-time only (uses node:fs). */

export const CONFIG_DIR = process.env.CVEBASE_CONFIG_DIR ?? join(process.cwd(), "config");

function loadYaml<T>(file: string, schema: { parse: (v: unknown) => T }): T {
  const path = join(CONFIG_DIR, file);
  try {
    return schema.parse(parse(readFileSync(path, "utf8")));
  } catch (err) {
    throw new Error(`Invalid ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Cache keyed by file mtime, so edits to config/*.yaml show up in `bun run dev`. */
const cache = new Map<string, { mtime: number; value: unknown }>();

function cached<T>(file: string, schema: { parse: (v: unknown) => T }): T {
  const mtime = statSync(join(CONFIG_DIR, file)).mtimeMs;
  const hit = cache.get(file);
  if (hit && hit.mtime === mtime) return hit.value as T;
  const value = loadYaml(file, schema);
  cache.set(file, { mtime, value });
  return value;
}

export function loadSettings(): SettingsT {
  return cached("settings.yaml", Settings);
}

export function loadWatchlist(): WatchlistT {
  return cached("watchlist.yaml", Watchlist);
}

export function enabledProducts() {
  return loadWatchlist().products.filter((p) => p.enabled);
}
