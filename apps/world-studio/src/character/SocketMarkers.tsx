import { useEffect, useMemo } from "react";
import { Html, Line } from "@react-three/drei";
import { parseSettlementSockets } from "@elder-souls/game-core/settlement/sockets";
import {
  useSettlementBundle, useSettlementBundleSource,
} from "@elder-souls/game-core/settlement/settlementIndex";
import type { SettlementSocket } from "@elder-souls/game-core/settlement/types";
import { socketsToDraw, type ShownCellSockets } from "@elder-souls/game-core/interior/interiorSockets";

/**
 * Studio debug overlay (decision 0103 decision 6): every published place
 * socket as a coloured post with its kind and id, so the owner can see on a
 * walk where the people, containers and idle spots stand. Mounted while the
 * character view's "sockets" checkbox is on; `socketsOverlayEnabled()`
 * (`?sockets=1`) gives that checkbox its start state. It reads the places in
 * range from the app's settlement source (`settlementIndex.ts`, S8): the set
 * the settlement layer last picked, else a load at `startAt` (the position
 * when the overlay was switched on); it follows the layer's re-picks as the
 * player walks. Inside a cell (`shown`) it draws that cell's sockets where
 * the cell is shown (interior/interiorSockets.ts), and outside it hides the
 * sockets that belong to a cell. A work socket's interact point (decision
 * 0113) is a small diamond joined to its post by a line: white where a
 * customer stands, the socket's colour where the player works the station.
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
/** Height of the interact diamond and its link above the floor. */
const USE_M = 1.0;

export function SocketMarkers({ baseUrl, groundAt, startAt, shown = null }: {
  baseUrl: string;
  groundAt: (xM: number, zM: number) => number | null | undefined;
  /** Where to pick the places in range if the settlement layer has not yet. */
  startAt: { x: number; z: number };
  /** The cell on screen (InteriorDoors `onShown`), or null outside. */
  shown?: ShownCellSockets | null;
}) {
  const source = useSettlementBundleSource(baseUrl);
  const { bundle, error } = useSettlementBundle(source, startAt);
  useEffect(() => { if (error) console.error("socket overlay:", error); }, [error]);
  const placeSockets = useMemo<SettlementSocket[]>(
    () => (bundle?.settlements ?? []).flatMap((s) => parseSettlementSockets(s)), [bundle]);
  const sockets = useMemo(() => socketsToDraw(placeSockets, shown), [placeSockets, shown]);
  return (
    <group name="socket-markers">
      {sockets.map((s) => {
        const [x, y, z] = s.positionM;
        const base = s.clampToGround ? Math.max(groundAt(x, z) ?? y, y) : y;
        const use = s.interact;
        const useAt: [number, number, number] | null = use
          ? [use.positionM[0] - x, use.positionM[1] - base, use.positionM[2] - z] : null;
        return (
          <group key={s.id} position={[x, base, z]}>
            {use && useAt && (
              <>
                <mesh position={[useAt[0], useAt[1] + USE_M, useAt[2]]}>
                  <octahedronGeometry args={[0.12]} />
                  <meshBasicMaterial color={use.kind === "customer" ? "#ffffff" : KIND_COLOUR[s.kind]} />
                </mesh>
                <Line points={[[0, USE_M, 0], [useAt[0], useAt[1] + USE_M, useAt[2]]]}
                  color={use.kind === "customer" ? "#ffffff" : KIND_COLOUR[s.kind]} lineWidth={1} />
              </>
            )}
            <mesh position={[0, POST_M / 2, 0]}>
              <cylinderGeometry args={[0.05, 0.05, POST_M, 6]} />
              <meshBasicMaterial color={KIND_COLOUR[s.kind]} />
            </mesh>
            <Html position={[0, POST_M + 0.2, 0]} center distanceFactor={12}>
              <div style={{ color: KIND_COLOUR[s.kind], font: "11px monospace", whiteSpace: "nowrap",
                background: "rgba(0,0,0,0.6)", padding: "1px 4px" }}>
                {s.kind} {s.id}{use ? ` (use: ${use.kind})` : ""}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
