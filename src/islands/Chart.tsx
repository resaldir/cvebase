import { useEffect, useRef } from "preact/hooks";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

/**
 * Small uPlot wrapper. Series colors are CSS custom properties so the chart follows
 * the theme (re-rendered when the theme toggles).
 */
export type ChartSeries = {
  label: string;
  colorVar: string;
  values: (number | null)[];
  fill?: boolean;
};

type Props = {
  /** x values: unix seconds */
  x: number[];
  series: ChartSeries[];
  height?: number;
  yMax?: number;
  yFormat?: "percent" | "count";
  bars?: boolean;
  stacked?: boolean;
  ariaLabel: string;
};

const cssVar = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";

export default function Chart(props: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let plot: uPlot | null = null;

    const build = () => {
      plot?.destroy();
      const axisColor = cssVar("--fg-mute");
      const grid = { stroke: cssVar("--border"), width: 1 };
      const fmt = (v: number) =>
        props.yFormat === "percent" ? `${Math.round(v * 100)}%` : String(Math.round(v));

      // Stacked: draw cumulative sums so later series sit on top of earlier ones.
      let data = props.series.map((s) => s.values);
      if (props.stacked) {
        const acc = props.x.map(() => 0);
        data = props.series.map((s) =>
          s.values.map((v, i) => {
            acc[i] = (acc[i] ?? 0) + (v ?? 0);
            return acc[i] as number;
          }),
        );
        data = [...data].reverse();
      }
      const seriesDefs = props.stacked ? [...props.series].reverse() : props.series;

      const opts: uPlot.Options = {
        width: el.clientWidth || 600,
        height: props.height ?? 220,
        legend: { show: props.series.length > 1 },
        cursor: { drag: { x: false, y: false } },
        scales: {
          x: { time: true },
          y: { range: (_u, _min, max) => [0, props.yMax ?? Math.max(1, max * 1.1)] },
        },
        axes: [
          { stroke: axisColor, grid, ticks: grid },
          { stroke: axisColor, grid, ticks: grid, values: (_u, vals) => vals.map(fmt), size: 48 },
        ],
        series: [
          {},
          ...seriesDefs.map((s) => {
            const color = cssVar(s.colorVar);
            return {
              label: s.label,
              stroke: color,
              width: props.bars ? 0 : 2,
              fill: props.bars || s.fill || props.stacked ? color : undefined,
              points: { show: !props.bars && props.x.length < 40, size: 5, fill: color },
              paths: props.bars ? uPlot.paths.bars?.({ size: [0.8, 24] }) : undefined,
              // Legend shows the series' own value, not the stacked cumulative.
              value: (_u: uPlot, v: number | null, _s: number, idx: number | null) => {
                const own = props.stacked && idx !== null ? (s.values[idx] ?? null) : v;
                return own === null ? "—" : fmt(own);
              },
            };
          }),
        ],
      };
      plot = new uPlot(opts, [props.x, ...data] as uPlot.AlignedData, el);
    };

    build();
    const ro = new ResizeObserver(() => {
      if (plot && el.clientWidth && Math.abs(plot.width - el.clientWidth) > 4) {
        plot.setSize({ width: el.clientWidth, height: props.height ?? 220 });
      }
    });
    ro.observe(el);
    const onTheme = () => build();
    document.addEventListener("cvebase:theme", onTheme);
    return () => {
      ro.disconnect();
      document.removeEventListener("cvebase:theme", onTheme);
      plot?.destroy();
    };
  }, [props]);

  return (
    <div
      ref={ref}
      role="img"
      aria-label={props.ariaLabel}
      class="w-full"
      style={{ minHeight: `${(props.height ?? 220) + (props.series.length > 1 ? 40 : 0)}px` }}
    />
  );
}
