import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { CveRow, type RowData } from "../components/CveRow";
import { dataUrl } from "../lib/base";
import {
  applyFilters,
  type ConfLevel,
  dateWindow,
  defaultFilters,
  type FeedFilters,
  isFiltered,
  mergeRows,
  parseFilters,
  type RangePreset,
  rangeLabels,
  rangePresets,
  serializeFilters,
  shardsForWindow,
} from "../lib/feed/filter";
import { createSearch } from "../lib/feed/search";
import { severityLabel } from "../lib/format";
import { categoryLabels, type ProductMeta, productCategories } from "../lib/schemas/config";
import type { EpssCurrent, IndexShard, LatestRow, Severity } from "../lib/schemas/data";

type Props = {
  initialRows: LatestRow[];
  shards: { month: string; count: number }[];
  total: number;
  products: ProductMeta[];
  timeZone: string;
  generatedAt: string;
  appSqli: boolean;
};

const PAGE = 100;
const SEVERITY_CHIPS: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNSCORED"];
const EPSS_OPTIONS = [
  [0, "Any EPSS"],
  [0.01, "EPSS ≥ 1%"],
  [0.1, "EPSS ≥ 10%"],
  [0.5, "EPSS ≥ 50%"],
  [0.9, "EPSS ≥ 90%"],
] as const;
const CONF_OPTIONS: [ConfLevel, string][] = [
  ["low", "All matches"],
  ["medium", "Hide unconfirmed"],
  ["high", "High confidence only"],
];

export default function Feed(props: Props) {
  const productMap = useMemo(() => new Map(props.products.map((p) => [p.id, p])), [props.products]);
  const vendors = useMemo(
    () => [...new Set(props.products.map((p) => p.vendor))].sort((a, b) => a.localeCompare(b)),
    [props.products],
  );

  const [filters, setFilters] = useState<FeedFilters>(defaultFilters);
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState<RowData[]>(props.initialRows);
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [visible, setVisible] = useState(PAGE);
  const [newData, setNewData] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const epssRef = useRef<EpssCurrent["scores"] | null>(null);
  // The search box updates instantly; the (heavier) filter runs after a short pause.
  const [qInput, setQInput] = useState("");
  useEffect(() => setQInput(filters.q), [filters.q]);
  useEffect(() => {
    if (qInput === filters.q) return;
    const t = setTimeout(() => setFilters((f) => ({ ...f, q: qInput })), 150);
    return () => clearTimeout(t);
  }, [qInput, filters.q]);

  // Read filters from the URL once on mount (shareable views), and on back/forward.
  useEffect(() => {
    const read = () => setFilters(parseFilters(window.location.search));
    read();
    setReady(true);
    window.addEventListener("popstate", read);
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      window.removeEventListener("popstate", read);
      clearInterval(tick);
    };
  }, []);

  // Keep the URL in sync with the filters.
  useEffect(() => {
    if (!ready) return;
    const qs = serializeFilters(filters);
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(null, "", next);
    }
    setVisible(PAGE);
  }, [filters, ready]);

  // Lazily load index shards as the date range widens beyond latest.json.
  const oldestInitial = props.initialRows.at(-1)?.published ?? null;
  const allInLatest = props.initialRows.length >= props.total;
  useEffect(() => {
    if (!ready || allInLatest) return;
    const window_ = dateWindow(filters, Date.now());
    const [from] = window_;
    if (from !== null && oldestInitial !== null && from >= Date.parse(oldestInitial)) return;
    const needed = shardsForWindow(
      props.shards.map((s) => s.month),
      window_,
    ).filter((m) => !loaded.has(m));
    if (!needed.length) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        if (!epssRef.current) {
          const res = await fetch(dataUrl("epss/current.json"));
          epssRef.current = res.ok ? ((await res.json()) as EpssCurrent).scores : {};
        }
        const shards = await Promise.all(
          needed.map(async (m) => {
            const res = await fetch(dataUrl(`index/${m}.json`));
            if (!res.ok) throw new Error(`index/${m}.json: HTTP ${res.status}`);
            return (await res.json()) as IndexShard;
          }),
        );
        if (cancelled) return;
        const scores = epssRef.current ?? {};
        const extra: RowData[] = shards.flatMap((s) =>
          s.rows
            .filter((r) => props.appSqli || r.category !== "app_sqli")
            .map((r) => ({ ...r, epss: scores[r.id]?.epss ?? null })),
        );
        setRows((prev) => mergeRows(prev, extra));
        setLoaded((prev) => new Set([...prev, ...needed]));
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters, ready, loaded, allInLatest, oldestInitial, props.shards, props.appSqli]);

  // "New data — refresh" pill when a newer deploy is live.
  useEffect(() => {
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`${dataUrl("latest.json")}?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const latest = (await res.json()) as { generated_at?: string };
        if (latest.generated_at && latest.generated_at !== props.generatedAt) setNewData(true);
      } catch {
        /* offline — ignore */
      }
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [props.generatedAt]);

  const search = useMemo(() => createSearch(rows, productMap), [rows, productMap]);
  const searchHits = useMemo(() => search.search(filters.q), [search, filters.q]);
  const filtered = useMemo(
    () => applyFilters(rows, filters, { products: productMap, now, searchHits }),
    [rows, filters, productMap, now, searchHits],
  );

  const update = useCallback((patch: Partial<FeedFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
  }, []);
  const toggle = <T,>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the URL bar still has the link */
    }
  };

  const categoryOptions = [
    ...productCategories.map((c) => [c, categoryLabels[c]] as const),
    ...(props.appSqli ? ([["app_sqli", "App SQLi"]] as const) : []),
  ];
  const activeCount =
    filters.products.length +
    filters.vendors.length +
    filters.categories.length +
    filters.severities.length +
    (filters.kev ? 1 : 0) +
    (filters.minEpss > 0 ? 1 : 0) +
    (filters.conf !== "low" ? 1 : 0);

  return (
    <div>
      {newData && (
        <div class="fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
          <button
            type="button"
            class="btn !rounded-full !border-[var(--accent)] !bg-[var(--accent)] !text-white shadow-lg"
            onClick={() => window.location.reload()}
          >
            New data — refresh
          </button>
        </div>
      )}

      <div class="card mb-4 p-3 sm:p-4">
        <div class="flex flex-wrap gap-2">
          <label class="sr-only" for="feed-q">
            Search CVEs
          </label>
          <input
            id="feed-q"
            type="search"
            class="field min-w-0 flex-1 basis-full sm:basis-0"
            placeholder="Search ID, product or text…"
            value={qInput}
            onInput={(e) => setQInput((e.target as HTMLInputElement).value)}
          />
          <select
            class="field flex-1 sm:flex-none"
            aria-label="Date range"
            value={filters.from || filters.to ? "custom" : filters.range}
            onChange={(e) => {
              const v = (e.target as HTMLSelectElement).value;
              if (v === "custom") {
                const today = new Date().toISOString().slice(0, 10);
                update({ from: filters.from ?? today, to: filters.to ?? today });
              } else update({ range: v as RangePreset, from: null, to: null });
            }}
          >
            {rangePresets.map((r) => (
              <option key={r} value={r}>
                {rangeLabels[r]}
              </option>
            ))}
            <option value="custom">Custom range…</option>
          </select>
          <button
            type="button"
            class="btn sm:hidden"
            aria-expanded={showFilters}
            aria-controls="feed-filters"
            onClick={() => setShowFilters((s) => !s)}
          >
            Filters{activeCount ? ` (${activeCount})` : ""}
          </button>
        </div>

        {(filters.from || filters.to) && (
          <div class="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <label class="flex items-center gap-1">
              From
              <input
                type="date"
                class="field"
                value={filters.from ?? ""}
                onChange={(e) => update({ from: (e.target as HTMLInputElement).value || null })}
              />
            </label>
            <label class="flex items-center gap-1">
              To
              <input
                type="date"
                class="field"
                value={filters.to ?? ""}
                onChange={(e) => update({ to: (e.target as HTMLInputElement).value || null })}
              />
            </label>
          </div>
        )}

        <div
          id="feed-filters"
          class={`${showFilters ? "block" : "hidden"} mt-3 space-y-3 sm:block`}
        >
          <fieldset class="flex flex-wrap items-center gap-1.5">
            <legend class="sr-only">Severity</legend>
            {SEVERITY_CHIPS.map((s) => (
              <button
                key={s}
                type="button"
                class="chip"
                aria-pressed={filters.severities.includes(s)}
                onClick={() => update({ severities: toggle(filters.severities, s) })}
              >
                <span class={`mr-1 inline-block h-2 w-2 rounded-full sev-bar-${s.toLowerCase()}`} />
                {severityLabel[s]}
              </button>
            ))}
            <button
              type="button"
              class="chip"
              aria-pressed={filters.kev}
              onClick={() => update({ kev: !filters.kev })}
            >
              KEV only
            </button>
          </fieldset>

          <fieldset class="flex flex-wrap items-center gap-1.5">
            <legend class="sr-only">Category</legend>
            {categoryOptions.map(([c, label]) => (
              <button
                key={c}
                type="button"
                class="chip"
                aria-pressed={filters.categories.includes(c)}
                onClick={() => update({ categories: toggle(filters.categories, c) })}
              >
                {label}
              </button>
            ))}
          </fieldset>

          <div class="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <select
              class="field"
              aria-label="Add product filter"
              value=""
              onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value;
                if (v) update({ products: toggle(filters.products, v) });
              }}
            >
              <option value="">Product…</option>
              {productCategories.map((c) => (
                <optgroup key={c} label={categoryLabels[c]}>
                  {props.products
                    .filter((p) => p.category === c)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {filters.products.includes(p.id) ? "✓ " : ""}
                        {p.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            <select
              class="field"
              aria-label="Add vendor filter"
              value=""
              onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value;
                if (v) update({ vendors: toggle(filters.vendors, v) });
              }}
            >
              <option value="">Vendor…</option>
              {vendors.map((v) => (
                <option key={v} value={v}>
                  {filters.vendors.includes(v) ? "✓ " : ""}
                  {v}
                </option>
              ))}
            </select>
            <select
              class="field"
              aria-label="Minimum EPSS"
              value={String(filters.minEpss)}
              onChange={(e) => update({ minEpss: Number((e.target as HTMLSelectElement).value) })}
            >
              {EPSS_OPTIONS.map(([v, label]) => (
                <option key={v} value={String(v)}>
                  {label}
                </option>
              ))}
            </select>
            <select
              class="field"
              aria-label="Match confidence"
              value={filters.conf}
              onChange={(e) => update({ conf: (e.target as HTMLSelectElement).value as ConfLevel })}
            >
              {CONF_OPTIONS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {(filters.products.length > 0 || filters.vendors.length > 0) && (
            <div class="flex flex-wrap gap-1.5">
              {filters.products.map((p) => (
                <button
                  key={p}
                  type="button"
                  class="chip"
                  aria-pressed="true"
                  aria-label={`Remove product filter ${productMap.get(p)?.name ?? p}`}
                  onClick={() => update({ products: toggle(filters.products, p) })}
                >
                  {productMap.get(p)?.name ?? p} ✕
                </button>
              ))}
              {filters.vendors.map((v) => (
                <button
                  key={v}
                  type="button"
                  class="chip"
                  aria-pressed="true"
                  aria-label={`Remove vendor filter ${v}`}
                  onClick={() => update({ vendors: toggle(filters.vendors, v) })}
                >
                  Vendor: {v} ✕
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div class="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <p class="soft" aria-live="polite">
          {ready ? (
            <>
              <strong>{filtered.length.toLocaleString("en")}</strong>{" "}
              {filtered.length === 1 ? "CVE" : "CVEs"}
              {filters.from || filters.to
                ? " in custom range"
                : ` · ${rangeLabels[filters.range].toLowerCase()}`}
            </>
          ) : (
            <>Newest database CVEs</>
          )}
          {loading && <span class="muted"> · loading older data…</span>}
        </p>
        {loadError && <span class="text-sm text-red-600">Could not load data: {loadError}</span>}
        <div class="ml-auto flex gap-2">
          {isFiltered(filters) && (
            <button
              type="button"
              class="btn !min-h-8 !py-1 text-xs"
              onClick={() => setFilters(defaultFilters())}
            >
              Reset filters
            </button>
          )}
          <button type="button" class="btn !min-h-8 !py-1 text-xs" onClick={copyLink}>
            {copied ? "Link copied" : "Copy link"}
          </button>
        </div>
      </div>

      {props.total === 0 ? (
        <EmptyState
          title="No CVEs yet"
          body="No database CVEs have been collected. Once the daily sync runs, they appear here newest-first."
        />
      ) : filtered.length === 0 && ready && !loading ? (
        <EmptyState
          title="No CVEs match these filters"
          body="Try widening the date range, lowering the EPSS threshold, or clearing filters."
          action={
            <button type="button" class="btn" onClick={() => setFilters(defaultFilters())}>
              Reset filters
            </button>
          }
        />
      ) : (
        <>
          <ul class="card overflow-hidden px-2 sm:px-3" aria-label="CVE feed">
            {(ready ? filtered : rows).slice(0, visible).map((r) => (
              <CveRow
                key={r.id}
                row={r}
                products={productMap}
                timeZone={props.timeZone}
                now={now}
              />
            ))}
          </ul>
          {ready && filtered.length > visible && (
            <div class="mt-4 text-center">
              <button type="button" class="btn" onClick={() => setVisible((v) => v + PAGE)}>
                Show {Math.min(PAGE, filtered.length - visible)} more (
                {(filtered.length - visible).toLocaleString("en")} left)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: preact.ComponentChildren;
}) {
  return (
    <div class="card px-6 py-12 text-center">
      <p class="text-base font-semibold">{title}</p>
      <p class="muted mx-auto mt-1 max-w-md text-sm">{body}</p>
      {action && <div class="mt-4">{action}</div>}
    </div>
  );
}
