import { useEffect, useMemo, useState } from "preact/hooks";
import { SeverityBadge } from "../components/CveRow";
import { cveUrl, productUrl } from "../lib/base";
import { eventLabel, formatDateTime, formatEventValue, relativeTime } from "../lib/format";
import { categoryLabels, type ProductMeta, productCategories } from "../lib/schemas/config";
import type { ChangeEvent, EventType, Severity } from "../lib/schemas/data";

export type ChangeItem = ChangeEvent & {
  products: string[];
  severity: Severity;
  cvss: number | null;
  summary: string;
};

type Props = {
  events: ChangeItem[];
  products: ProductMeta[];
  timeZone: string;
  totalEvents: number;
};

const TYPES: EventType[] = [
  "kev_added",
  "severity_changed",
  "cvss_changed",
  "epss_crossed_10",
  "epss_crossed_50",
  "match_upgraded",
  "published",
];
const PAGE = 100;

export default function Changes(props: Props) {
  const productMap = useMemo(() => new Map(props.products.map((p) => [p.id, p])), [props.products]);
  const vendors = useMemo(
    () => [...new Set(props.products.map((p) => p.vendor))].sort(),
    [props.products],
  );
  const [types, setTypes] = useState<EventType[]>([]);
  const [product, setProduct] = useState("");
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState("");
  const [visible, setVisible] = useState(PAGE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setTypes(
      (p.get("type") ?? "")
        .split(",")
        .filter((t): t is EventType => (TYPES as string[]).includes(t)),
    );
    setProduct(p.get("product") ?? "");
    setVendor(p.get("vendor") ?? "");
    setCategory(p.get("category") ?? "");
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const p = new URLSearchParams();
    if (types.length) p.set("type", types.join(","));
    if (product) p.set("product", product);
    if (vendor) p.set("vendor", vendor);
    if (category) p.set("category", category);
    const qs = p.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    setVisible(PAGE);
  }, [types, product, vendor, category, ready]);

  const filtered = useMemo(
    () =>
      props.events.filter((e) => {
        if (types.length && !types.includes(e.type)) return false;
        if (product && !e.products.includes(product)) return false;
        if (vendor && !e.products.some((p) => productMap.get(p)?.vendor === vendor)) return false;
        if (category && !e.products.some((p) => productMap.get(p)?.category === category))
          return false;
        return true;
      }),
    [props.events, types, product, vendor, category, productMap],
  );

  return (
    <div>
      <div class="card mb-4 space-y-3 p-3 sm:p-4">
        <fieldset class="flex flex-wrap gap-1.5">
          <legend class="sr-only">Change type</legend>
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              class="chip"
              aria-pressed={types.includes(t)}
              onClick={() =>
                setTypes((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]))
              }
            >
              {eventLabel[t]}
            </button>
          ))}
        </fieldset>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select
            class="field"
            aria-label="Product"
            value={product}
            onChange={(e) => setProduct((e.target as HTMLSelectElement).value)}
          >
            <option value="">All products</option>
            {productCategories.map((c) => (
              <optgroup key={c} label={categoryLabels[c]}>
                {props.products
                  .filter((p) => p.category === c)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <select
            class="field"
            aria-label="Vendor"
            value={vendor}
            onChange={(e) => setVendor((e.target as HTMLSelectElement).value)}
          >
            <option value="">All vendors</option>
            {vendors.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select
            class="field"
            aria-label="Category"
            value={category}
            onChange={(e) => setCategory((e.target as HTMLSelectElement).value)}
          >
            <option value="">All categories</option>
            {productCategories.map((c) => (
              <option key={c} value={c}>
                {categoryLabels[c]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p class="soft mb-2 text-sm" aria-live="polite">
        <strong>{filtered.length.toLocaleString("en")}</strong> changes
        {props.totalEvents > props.events.length && (
          <span class="muted">
            {" "}
            · newest {props.events.length.toLocaleString("en")} of{" "}
            {props.totalEvents.toLocaleString("en")} shown here; older events are in data/events/
          </span>
        )}
      </p>

      {filtered.length === 0 ? (
        <div class="card px-6 py-12 text-center">
          <p class="font-semibold">
            {props.events.length === 0
              ? "No changes recorded yet"
              : "No changes match these filters"}
          </p>
          <p class="muted mt-1 text-sm">
            {props.events.length === 0
              ? "Change events (new KEV entries, score changes, EPSS jumps) appear here after the daily sync."
              : "Try another change type or product."}
          </p>
        </div>
      ) : (
        <>
          <ul class="card overflow-hidden px-3 sm:px-4">
            {filtered.slice(0, visible).map((e) => (
              <li
                key={`${e.cve_id}-${e.type}-${e.detected_at}`}
                class="flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-[var(--border)] py-3 last:border-0"
              >
                <span class={`badge ${e.type === "kev_added" ? "badge-kev" : ""}`}>
                  {eventLabel[e.type]}
                </span>
                <div class="min-w-0 flex-1 basis-60">
                  <div class="flex flex-wrap items-center gap-2">
                    <a href={cveUrl(e.cve_id)} class="mono text-sm font-semibold">
                      {e.cve_id}
                    </a>
                    <SeverityBadge severity={e.severity} cvss={e.cvss} />
                    {e.products.map((p) => (
                      <a key={p} href={productUrl(p)} class="badge">
                        {productMap.get(p)?.name ?? p}
                      </a>
                    ))}
                  </div>
                  {e.type !== "published" && (
                    <p class="soft mt-0.5 text-sm">
                      {e.product_id && <>{productMap.get(e.product_id)?.name ?? e.product_id}: </>}
                      {formatEventValue(e.type, e.old)} →{" "}
                      <strong>{formatEventValue(e.type, e.new)}</strong>
                    </p>
                  )}
                  <p class="muted mt-0.5 truncate text-xs">{e.summary}</p>
                </div>
                <time
                  class="muted text-xs whitespace-nowrap"
                  dateTime={e.detected_at}
                  title={formatDateTime(e.detected_at, props.timeZone)}
                  data-rel={e.detected_at}
                >
                  {relativeTime(e.detected_at)}
                </time>
              </li>
            ))}
          </ul>
          {filtered.length > visible && (
            <div class="mt-4 text-center">
              <button type="button" class="btn" onClick={() => setVisible((v) => v + PAGE)}>
                Show more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
