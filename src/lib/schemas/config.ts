import { z } from "zod";

/** Schemas for config/watchlist.yaml and config/settings.yaml (BRIEF §2). */

export const productCategories = ["relational", "nosql", "tooling", "driver"] as const;
export const ProductCategory = z.enum(productCategories);
export type ProductCategory = z.infer<typeof ProductCategory>;

export const categoryLabels: Record<ProductCategory, string> = {
  relational: "Relational",
  nosql: "NoSQL & other",
  tooling: "Tooling",
  driver: "Drivers",
};

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "must be a lowercase slug");

export const CpePair = z.strictObject({
  vendor: z.string().min(1),
  product: z.string().min(1),
  /** true once confirmed against the NVD CPE dictionary (`bun run cpe:discover`). */
  verified: z.boolean(),
});

export const PackageId = z.strictObject({
  ecosystem: z.enum(["maven", "npm", "pip", "go", "nuget", "rubygems", "composer", "rust"]),
  name: z.string().min(1),
});

export const Product = z.strictObject({
  id: slug,
  name: z.string().min(1),
  vendor: z.string().min(1),
  category: ProductCategory,
  cpes: z.array(CpePair).min(1),
  packages: z.array(PackageId).default([]),
  aliases: z.array(z.string().min(1)).default([]),
  enabled: z.boolean(),
});
export type Product = z.infer<typeof Product>;

export const Watchlist = z
  .strictObject({ products: z.array(Product).min(1) })
  .superRefine((w, ctx) => {
    const seen = new Set<string>();
    for (const p of w.products) {
      if (seen.has(p.id)) ctx.addIssue({ code: "custom", message: `duplicate product id ${p.id}` });
      seen.add(p.id);
    }
  });
export type Watchlist = z.infer<typeof Watchlist>;

export const Settings = z.strictObject({
  site: z.strictObject({ title: z.string().min(1), description: z.string() }),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "must be a valid IANA timezone"),
  staleAfterHours: z.number().positive(),
  appSqli: z.boolean(),
  latestCount: z.number().int().positive(),
  epssHistory: z.strictObject({
    minDelta: z.number().positive().max(1),
    thresholds: z.array(z.number().gt(0).lt(1)),
  }),
  sources: z.strictObject({
    githubAdvisories: z.boolean(),
    vendorAdvisories: z.boolean(),
  }),
});
export type Settings = z.infer<typeof Settings>;

/** Compact product info passed to client islands. */
export type ProductMeta = Pick<Product, "id" | "name" | "vendor" | "category">;
