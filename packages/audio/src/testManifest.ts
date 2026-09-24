import { readFileSync } from "node:fs";
import { parseManifest, type AudioManifest } from "./manifest";

/** The shipped manifest, for tests that hold the contracts to real data. */
export function shippedManifest(): AudioManifest {
  return parseManifest(JSON.parse(readFileSync(new URL("../files/audio-manifest.json", import.meta.url), "utf8")));
}
