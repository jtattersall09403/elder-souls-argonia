import { CATALOGUE, text } from "@elder-souls/text-catalogue";

/** A HUD or debug-panel line from the text catalogue, by its full ID. */
export function t(id: string): string {
  return text(CATALOGUE, id);
}
