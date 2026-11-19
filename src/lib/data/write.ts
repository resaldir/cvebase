import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { schemaForDataPath } from "../schemas/data";
import { stableStringify } from "./stable-json";

/** Validate every file against its schema. Returns a list of problems (empty = valid). */
export function validateDataFiles(files: Map<string, unknown>): string[] {
  const problems: string[] = [];
  for (const [rel, value] of files) {
    const schema = schemaForDataPath(rel);
    if (!schema) {
      problems.push(`${rel}: no schema for this path`);
      continue;
    }
    const result = schema.safeParse(value);
    if (!result.success) {
      for (const issue of result.error.issues.slice(0, 5)) {
        problems.push(`${rel}: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
      }
    }
  }
  return problems;
}

/**
 * Validate, then write all files deterministically under `dir`.
 * Throws (writing nothing) if any file fails its schema.
 */
export function writeDataDir(dir: string, files: Map<string, unknown>, opts: { clean: boolean }) {
  const problems = validateDataFiles(files);
  if (problems.length) {
    const shown = problems.slice(0, 40).join("\n  ");
    throw new Error(
      `Schema validation failed for ${problems.length} issue(s):\n  ${shown}${
        problems.length > 40 ? "\n  …" : ""
      }`,
    );
  }
  if (opts.clean) rmSync(dir, { recursive: true, force: true });
  for (const rel of [...files.keys()].sort()) {
    const path = join(dir, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, stableStringify(files.get(rel)));
  }
}
