/**
 * Base-path aware links. GitHub Pages project sites are served under /<repo>/,
 * a custom domain from /. Every internal link and data fetch goes through url().
 */

/** Join a base path ("/", "/cvebase", "/cvebase/") with a site path. Pure, for tests. */
export function joinBase(base: string, path: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("//")) return path; // absolute URL
  const b = `/${base.replace(/^\/+|\/+$/g, "")}`.replace(/^\/$/, "");
  const [rawPath = "", suffix = ""] = splitSuffix(path);
  const p = rawPath.replace(/^\/+/, "");
  const joined = p ? `${b}/${p}` : `${b}/`;
  return `${joined}${suffix}`;
}

function splitSuffix(path: string): [string, string] {
  const i = path.search(/[?#]/);
  return i === -1 ? [path, ""] : [path.slice(0, i), path.slice(i)];
}

/** Strip the base from a pathname (for active-nav detection). */
export function stripBase(base: string, pathname: string): string {
  const b = `/${base.replace(/^\/+|\/+$/g, "")}`;
  if (b !== "/" && (pathname === b || pathname.startsWith(`${b}/`))) {
    return pathname.slice(b.length) || "/";
  }
  return pathname;
}

export function url(path: string): string {
  return joinBase(import.meta.env.BASE_URL ?? "/", path);
}

export const cveUrl = (id: string) => url(`/cve/${id}/`);
export const productUrl = (id: string) => url(`/products/${id}/`);
export const dataUrl = (rel: string) => url(`/data/${rel.replace(/^\/+/, "")}`);
export const cveDataPath = (id: string) => `cves/${id.slice(4, 8)}/${id}.json`;
