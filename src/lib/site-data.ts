import { enabledProducts } from "./config";
import type { ProductMeta } from "./schemas/config";

/** Compact product metadata for islands and pages (enabled products, watchlist order). */
export function productMetas(): ProductMeta[] {
  return enabledProducts().map(({ id, name, vendor, category }) => ({
    id,
    name,
    vendor,
    category,
  }));
}

export function productMetaMap(): Map<string, ProductMeta> {
  return new Map(productMetas().map((p) => [p.id, p]));
}
