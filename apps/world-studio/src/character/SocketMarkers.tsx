import { useEffect, useMemo } from "react";
import { Html } from "@react-three/drei";
import { parseSettlementSockets } from "@elder-souls/game-core/settlement/sockets";
import {
  useSettlementBundle, useSettlementBundleSource,
} from "@elder-souls/game-core/settlement/settlementIndex";
import type { SettlementSocket } from "@elder-souls/game-core/settlement/types";

/**
 * Studio debug overlay (decision 0103 decision 6): every published place
 * socket as a coloured post with its kind and id, so the owner can see on a
 * walk where the people, containers and idle spots stand. Mounted while the
 * character view's "sockets" checkbox is on; `socketsOverlayEnabled()`
 * (`?sockets=1`) gives that checkbox its start state. It reads the places in
 * range from the app's settlement source (`settlementIndex.ts`, S8): the set
 * the settlement layer last picked, else a load at `startAt` (the position
 * when the overlay was switched on); it follows the layer's re-picks as the
 * player walks.
 */
export function socketsOverlayEnabled(search: string = window.location.search): boolean {
  return new URLSearchParams(search).get("sockets") === "1";
}

const KIND_COLOUR: Record<SettlementSocket["kind"], string> = {
  npc: "#ff4fd8", idle: "#4fd2ff", item: "#ffd24f", container: "#ff9a3c",
  station: "#c8a064", sign: "#9cffd8",
  encounter: "#ff3c3c", fauna: "#8cff4f", ambience: "#b89cff", marker: "#ffffff",
};
const POST_M = 1.8;

export function SocketMarkers({ baseUrl, groundAt, startAt }: {
  baseUrl: string;
  groundAt: (xM: number, zM: number) => number | null | undefined;
  /** Where to pick the places in range if the settlement layer has not yet. */
  startAt: { x: number; z: number };
}) {
  const source = useSettlementBundleSource(baseUrl);
  const { bundle, error } = useSettlementBundle(source, startAt);
  useEffect(() => { if (error) console.error("socket overlay:", error); }, [error]);
  const sockets = useMemo<SettlementSocket[]>(
    () => (bundle?.settlements ?? []).flatMap((s) => parseSettlementSockets(s)), [bundle]);
  return (
    <group name="socket-markers">
      {sockets.map((s) => {
        const [x, y, z] = s.positionM;
        const ground = groundAt(x, z) ?? y;
        const base = Math.max(ground, y);
        return (
          <group key={s.id} position={[x, base, z]}>
            <mesh position={[0, POST_M / 2, 0]}>
              <cylinderGeometry args={[0.05, 0.05, POST_M, 6]} />
              <meshBasicMaterial color={KIND_COLOUR[s.kind]} />
            </mesh>
            <Html position={[0, POST_M + 0.2, 0]} center distanceFactor={12}>
              <div style={{ color: KIND_COLOUR[s.kind], font: "11px monospace", whiteSpace: "nowrap",
                background: "rgba(0,0,0,0.6)", padding: "1px 4px" }}>
                {s.kind} {s.id}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
