import MiniSearch from "minisearch";
import type { ProductMeta } from "../schemas/config";
import type { IndexRow } from "../schemas/data";

/**
 * Client-side full-text search with MiniSearch over the loaded index rows.
 * (Pagefind indexes rendered HTML pages; our filters are structured fields on
 * JSON rows, so an in-memory index over the same rows is simpler and faster.)
 */
export type SearchIndex = { search: (q: string) => Set<string> | null };

export function createSearch(rows: IndexRow[], products: Map<string, ProductMeta>): SearchIndex {
  const ms = new MiniSearch<{ id: string; summary: string; products: string; cveId: string }>({
    fields: ["cveId", "summary", "products"],
    storeFields: [],
    searchOptions: {
      prefix: true,
      fuzzy: 0.15,
      combineWith: "AND",
      boost: { cveId: 3, products: 2 },
    },
    tokenize: (text) =>
      text
        .toLowerCase()
        .split(/[^a-z0-9.]+/)
        .filter(Boolean),
  });
  ms.addAll(
    rows.map((r) => ({
      id: r.id,
      cveId: `${r.id} ${r.id.slice(4)}`,
      summary: r.summary.replace(/^\[DEMO\]\s*/, ""),
      products: r.products
        .map((p) => {
          const meta = products.get(p);
          return meta ? `${meta.name} ${meta.vendor} ${p}` : p;
        })
        .join(" "),
    })),
  );
  return {
    search(q: string) {
      const query = q.trim();
      if (!query) return null;
      // Exact / partial CVE ID lookups bypass tokenization.
      if (/^(cve-)?\d{4}-\d+$/i.test(query)) {
        const needle = query.toUpperCase().replace(/^(?!CVE-)/, "CVE-");
        return new Set(rows.filter((r) => r.id.startsWith(needle)).map((r) => r.id));
      }
      return new Set(ms.search(query).map((h) => String(h.id)));
    },
  };
}
