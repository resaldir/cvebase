import type { APIRoute, GetStaticPaths } from "astro";
import { listDataFiles, readDataFile } from "../../lib/data/repo";

/**
 * Static JSON API: every file under data/ is published at /data/<path>.
 * (latest.json, cves/<year>/<id>.json, epss/*, index/*, events/*, status, stats.)
 */
export const getStaticPaths: GetStaticPaths = () =>
  listDataFiles()
    .filter((f) => f !== "state.json")
    .map((file) => ({ params: { file } }));

export const GET: APIRoute = ({ params }) =>
  new Response(readDataFile(String(params.file)), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
