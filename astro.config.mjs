// @ts-check
import preact from "@astrojs/preact";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// Base path: GitHub Pages project sites live under /<repo>/, a custom domain
// serves from /. The Pages workflow passes BASE_PATH (from configure-pages).
const base = process.env.BASE_PATH || "/";
const site = process.env.SITE_URL || undefined;

export default defineConfig({
  output: "static",
  // Keep normal HTML whitespace rules (inline text next to elements keeps its spaces).
  compressHTML: false,
  site,
  base,
  trailingSlash: "ignore",
  build: { format: "directory" },
  integrations: [preact()],
  vite: {
    plugins: [tailwindcss()],
  },
});
