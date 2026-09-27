/**
 * Travel sockets in the studio's character view (16e deliverable 7).
 *
 * A ferry can be USED before any boat or NPC is drawn: the published record
 * `province/travel-services.json` is indexed through the contract in
 * `@elder-souls/game-core/travel/travelServices`, every operator socket gets
 * a dev-only pole where its operator will stand, and standing at one opens
 * the talk-pay-arrive menu. Nothing is simulated — the trip resolves in the
 * contract and the character is moved.
 *
 * This is a debug seam, so it lives in the app and not in the package: the
 * game will draw an actual operator at the same socket and open the same
 * menu. What the game must reuse is the contract and the `WorldStateReader`
 * shape, both of which this component only consumes.
 *
 * Mounted inside the Canvas (it draws) and behind the character view only.
 * Its screen UI (prompt, notice, menu) is `TravelOverlay`, put in the
 * character view's screen overlay (DOM over the canvas), never a drei
 * full-screen `Html`: that one projected a world-origin anchor (walk 2 D2).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { CATALOGUE, text } from "@elder-souls/text-catalogue";
import {
  indexTravelGraph,
  operatorSockets,
  resolveTrip,
  serviceMenu,
  type ServiceMenu,
  type TravelGraphIndex,
  type TravelServiceGraph,
} from "@elder-souls/game-core/travel/travelServices";
import type { InteractionArbiter } from "@elder-souls/game-core/interaction/arbiter";
import { createStudioWorldState } from "./studioWorldState";
import { nearestSocket, TALK_RADIUS_M, type SocketPoint } from "./nearestSocket";
import { TALK_TEXT_ID, TravelOverlay } from "./travelOverlay";
import type { ScreenOverlayChannel } from "../character/screenOverlay";

/** Debug purse the studio traveller carries. */
const STUDIO_PURSE_GOLD = 100;
/** Sockets beyond this are not drawn: their ground is not loaded anyway. */
const DRAW_RADIUS_M = 3000;
const ARRIVED_MS = 3000;

/** The socket's id as the interaction arbiter knows it. */
const candidateId = (s: SocketPoint) => `travel:${s.serviceId}:${s.stationId}`;

interface Placed extends SocketPoint {
  y: number;
}

export function TravelSockets({ positionRef, groundAt, teleportTo, baseUrl, interaction, offering, overlay }: {
  /** Live character position in world metres (east, south). */
  positionRef: React.MutableRefObject<{ x: number; z: number }>;
  /** Terrain height at a world point, or null where no chunk is loaded. */
  groundAt: (xM: number, zM: number) => number | null;
  /** Move the character to a world point (the app owns the body). */
  teleportTo: (xM: number, zM: number) => void;
  baseUrl: string;
  /** The scene's one arbiter: a socket answers `activate` only when it is the focus. */
  interaction: InteractionArbiter;
  /** False while nothing here can be reached (the player is inside a cell). */
  offering: boolean;
  /** Where the prompt, notice and menu are drawn: DOM over the canvas. */
  overlay: ScreenOverlayChannel;
}) {
  const [index, setIndex] = useState<TravelGraphIndex | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const world = useMemo(() => createStudioWorldState(), []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${baseUrl}province/travel-services.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`travel-services.json: HTTP ${r.status}`))))
      .then((graph: TravelServiceGraph) => { if (!cancelled) setIndex(indexTravelGraph(graph)); })
      .catch((e: unknown) => { if (!cancelled) setLoadError(String(e)); });
    return () => { cancelled = true; };
  }, [baseUrl]);

  const sockets = useMemo(() => (index ? operatorSockets(index) : []), [index]);

  // Near sockets, re-seated on the terrain as chunks stream in.
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [near, setNear] = useState<SocketPoint | null>(null);
  const reseat = useRef(0);
  const menuRef = useRef(false);
  const [focused, setFocused] = useState(false);
  useFrame((_, delta) => {
    const { x, z } = positionRef.current;
    const next = offering ? nearestSocket(sockets, x, z, TALK_RADIUS_M) : null;
    setNear((prev) => (next?.serviceId === prev?.serviceId ? prev : next));
    if (next) {
      const id = candidateId(next);
      if (interaction.answers(id)) {
        if (menuRef.current) setMenu(null);
        else openMenu(next);
      }
      interaction.offer({ id, kind: "travel", positionM: next.positionM, reachM: TALK_RADIUS_M, promptTextId: TALK_TEXT_ID });
      const isFocus = interaction.isFocused(id);
      setFocused((prev) => (prev === isFocus ? prev : isFocus));
    } else {
      setFocused((prev) => (prev ? false : prev));
    }
    reseat.current -= delta;
    if (reseat.current > 0) return;
    reseat.current = 1;
    const out: Placed[] = [];
    for (const s of sockets) {
      if (Math.hypot(s.positionM[0] - x, s.positionM[1] - z) > DRAW_RADIUS_M) continue;
      const y = groundAt(s.positionM[0], s.positionM[1]);
      if (y === null) continue;
      out.push({ ...s, y });
    }
    setPlaced((prev) =>
      prev.length === out.length && prev.every((p, i) => p.serviceId === out[i].serviceId && p.y === out[i].y)
        ? prev
        : out);
  });

  const [menu, setMenu] = useState<{ serviceId: string; stationId: string; menu: ServiceMenu } | null>(null);
  const [purse, setPurse] = useState(STUDIO_PURSE_GOLD);
  const [notice, setNotice] = useState<string | null>(null);

  const openMenu = (socket: SocketPoint) => {
    if (!index) return;
    try {
      setMenu({ serviceId: socket.serviceId, stationId: socket.stationId, menu: serviceMenu(index, socket.serviceId, socket.stationId, world) });
    } catch {
      // A gate this build cannot evaluate is a shut service, never a crash.
      setNotice(text(CATALOGUE, "text.travel.unavailable"));
    }
  };

  // `activate` (E, the pad's bottom face button, the tapped prompt) opens and
  // closes the menu through the arbiter above; Escape still closes it.
  menuRef.current = menu !== null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code === "Escape") setMenu(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), ARRIVED_MS);
    return () => window.clearTimeout(t);
  }, [notice]);

  const travel = (toStationId: string) => {
    if (!index || !menu) return;
    let outcome: ReturnType<typeof resolveTrip>;
    try {
      outcome = resolveTrip(index, menu.serviceId, menu.stationId, toStationId, purse, world);
    } catch {
      setNotice(text(CATALOGUE, "text.travel.unavailable"));
      setMenu(null);
      return;
    }
    if (outcome.kind === "arrive") {
      setPurse((g) => g - outcome.fareGold);
      teleportTo(outcome.positionM[0], outcome.positionM[1]);
      setNotice(text(CATALOGUE, "text.travel.arrived"));
    } else if (outcome.kind === "cannot-pay") {
      setNotice(text(CATALOGUE, "text.travel.cannot-pay"));
    } else {
      setNotice(text(CATALOGUE, "text.travel.unavailable"));
    }
    setMenu(null);
  };

  // The screen UI, handed to the DOM over the canvas whenever what it shows changes.
  const prompt = near && focused ? near : null;
  useEffect(() => {
    overlay.set("travel", (
      <TravelOverlay loadError={loadError} prompt={prompt} notice={notice} menu={menu?.menu ?? null}
        purse={purse} onTravel={travel} onClose={() => setMenu(null)} />
    ));
    // `travel` closes over index, menu, purse and teleportTo: all listed.
  }, [overlay, loadError, prompt, notice, menu, purse, index, teleportTo]);
  useEffect(() => () => overlay.set("travel", null), [overlay]);

  return (
    <group>
      {placed.map((s) => (
        <group key={s.serviceId} position={[s.positionM[0], s.y, s.positionM[1]]}>
          <mesh position={[0, 1, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 2, 6]} />
            <meshStandardMaterial color="#6b5a3a" />
          </mesh>
          <mesh position={[0, 2.15, 0]}>
            <sphereGeometry args={[0.18, 10, 8]} />
            <meshStandardMaterial color="#ffc85a" emissive="#5a3b00" />
          </mesh>
          <Html position={[0, 2.6, 0]} center distanceFactor={26} zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
            <div style={{ background: "rgba(10,14,20,0.78)", color: "#ffd9a0", font: "13px system-ui", padding: "2px 7px", borderRadius: 5, whiteSpace: "nowrap" }}>
              {s.role}
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}
