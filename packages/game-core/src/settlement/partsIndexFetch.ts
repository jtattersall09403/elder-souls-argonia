import { parseKitPartsIndex, type KitPartsIndex } from "../assets/kitParts";

/**
 * Fetch and parse one kit's exterior parts index. Every failure (network, HTTP, a parse error such as a wrong
 * schemaVersion) resolves to null and is logged once with the kit name, so the caller records the kit as failed and
 * never refetches it (webgpu diag22 C1: the parse throw escaped the rejection handler and was refetched every pass).
 */
export function loadExteriorPartsIndex(
  url: string, kitId: string, source: string,
  fetchFn: (url: string, init?: RequestInit) => Promise<Response> = fetch,
  log: (msg: string) => void = (msg) => console.error(msg),
): Promise<KitPartsIndex | null> {
  return fetchFn(url, { priority: "high" } as RequestInit)
    .then((r) => (r.ok ? r.json() : null))
    .then((raw) => {
      const index = raw ? parseKitPartsIndex(raw, kitId, source) : null;
      return index?.exterior ? index : null;
    })
    .catch((e: unknown) => {
      log(`settlement kit ${kitId}: parts index failed, kit not placed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    });
}
