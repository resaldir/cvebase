/**
 * DATA_MODE controls the demo banner and notices. In the demo stage the default is
 * "demo"; the real build (BRIEF phase 1+) sets DATA_MODE=live.
 */
export const DEMO_NOTICE = "Demo data — not real vulnerabilities";

export function dataMode(): "demo" | "live" {
  return (process.env.DATA_MODE ?? "demo") === "live" ? "live" : "demo";
}

export const isDemo = () => dataMode() === "demo";
