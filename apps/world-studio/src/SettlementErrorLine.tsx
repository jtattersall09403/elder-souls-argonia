import type { CSSProperties } from "react";
import type { SettlementLayerError } from "@elder-souls/game-core/settlement/types";

/**
 * The settlement layer's failure as one red line (decision 0052 addendum
 * 2026-09-28): the layer reports through its injected `onError`; every
 * studio view that mounts the layer shows this, never a shape in the world.
 */
export function SettlementErrorLine({ error, style }: {
  error: SettlementLayerError | null; style?: CSSProperties;
}) {
  if (!error) return null;
  return (
    <div role="alert" data-settlement-error style={{
      color: "#ff5a5a", fontWeight: 700, whiteSpace: "normal", font: "700 13px system-ui", ...style,
    }}>
      {error.fatal ? "SETTLEMENT LAYER FAILED" : "SETTLEMENT EFFECT FAILED (places drawn without it)"}: {error.message}
    </div>
  );
}
