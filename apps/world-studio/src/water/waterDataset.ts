/** A review URL selects one coherent water/terrain dataset for this page. */
const pageSearch = typeof window === "undefined" ? "" : window.location.search;

export function waterDatasetPath(search = pageSearch): string {
  return new URLSearchParams(search).get("waterDataset") === "preview" ? "water/preview/" : "water/v2/";
}

export function physicalWaterMapFiles(search = pageSearch): Record<string, string> {
  return new URLSearchParams(search).get("waterDataset") === "preview"
    ? { rivers: "water/preview/coverage-maximum.png", "flood-wet": "water/preview/coverage-seasonal.png" }
    : {};
}
