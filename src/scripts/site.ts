import { hoursSince, relativeTime } from "../lib/format";

/** Small progressive enhancements shared by every page. */

function updateRelativeTimes() {
  const now = Date.now();
  for (const el of document.querySelectorAll<HTMLElement>("[data-rel]")) {
    const iso = el.dataset.rel;
    if (iso) el.textContent = relativeTime(iso, now);
  }
}

/** Staleness is computed client-side so a missed run shows even on an old build. */
function updateStaleness() {
  const src = document.querySelector<HTMLElement>("[data-updated]");
  if (!src) return;
  const updated = src.dataset.updated;
  const after = Number(src.dataset.staleAfter ?? 30);
  const stale = !updated || hoursSince(updated) > after;
  const banner = document.querySelector<HTMLElement>("[data-stale-warning]");
  if (banner) banner.hidden = !stale;
  const dot = document.querySelector<HTMLElement>("[data-stale-dot]");
  if (dot) {
    dot.classList.toggle("bg-emerald-500", !stale);
    dot.classList.toggle("bg-orange-500", stale);
  }
  document.documentElement.dataset.stale = stale ? "1" : "0";
  document.dispatchEvent(new CustomEvent("cvebase:staleness", { detail: { stale } }));
}

function initThemeToggle() {
  for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]")) {
    btn.addEventListener("click", () => {
      const dark = !document.documentElement.classList.contains("dark");
      document.documentElement.classList.toggle("dark", dark);
      try {
        localStorage.setItem("theme", dark ? "dark" : "light");
      } catch {
        /* storage unavailable — theme still applies for this page */
      }
      document.dispatchEvent(new CustomEvent("cvebase:theme", { detail: { dark } }));
    });
  }
}

updateRelativeTimes();
updateStaleness();
initThemeToggle();
setInterval(() => {
  updateRelativeTimes();
  updateStaleness();
}, 60_000);
