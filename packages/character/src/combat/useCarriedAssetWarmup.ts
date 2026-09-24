import { assetUrl } from "../assetBase";
import type { Sex } from "@elder-souls/game-core/actors/races";
import { useGLTF } from "@react-three/drei";
import { useEffect } from "react";
import { itemAsset } from "@elder-souls/game-core/inventory/registry";
import { useInventoryStore } from "@elder-souls/game-core/inventory/store";

/**
 * Warm the item cache while the player is busy.
 *
 * Every actor suspends when it is handed a mesh the browser has not fetched, so
 * the first time a weapon is equipped it blinks. Fetching what the player is
 * already carrying, slowly, in the background, costs nothing anyone notices and
 * removes that entirely. Deliberately paced: firing fifty requests at once
 * would compete with whatever the scene still needs.
 */
export function useCarriedAssetWarmup(enabled: boolean, sex: Sex) {
  const stacks = useInventoryStore((state) => state.inventory.stacks);
  useEffect(() => {
    if (!enabled) return undefined;
    const urls = [...new Set(stacks.map((stack) => itemAsset(stack.itemId, sex)).filter(Boolean))]
      .map((asset) => assetUrl(asset as string));
    let index = 0;
    let timer = 0;
    const step = () => {
      if (index >= urls.length) return;
      useGLTF.preload(urls[index]);
      index += 1;
      timer = window.setTimeout(step, WARMUP_INTERVAL_MS);
    };
    timer = window.setTimeout(step, WARMUP_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, sex, stacks]);
}

export const WARMUP_DELAY_MS = 2500;
export const WARMUP_INTERVAL_MS = 140;
