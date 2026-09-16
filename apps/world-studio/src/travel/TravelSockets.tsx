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
import { createStudioWorldState } from "./studioWorldState";
import { nearestSocket, TALK_RADIUS_M, type SocketPoint } from "./nearestSocket";

/** Debug purse the studio traveller carries. */
const STUDIO_PURSE_GOLD = 100;
/** Sockets beyond this are not drawn: their ground is not loaded anyway. */
const DRAW_RADIUS_M = 3000;
const ARRIVED_MS = 3000;

/** Catalogue lookup that survives a record naming a string nobody wrote:
 * this is a debug seam, so a missing id shows as the id. */
function safeText(id: string): string {
  try {
    return text(CATALOGUE, id);
  } catch {
    return id;
  }
}

/** `{name}` substitution. The catalogue stores the string; the caller fills it. */
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
}

interface Placed extends SocketPoint {
  y: number;
}

export function TravelSockets({ positionRef, groundAt, teleportTo, baseUrl }: {
  /** Live character position in world metres (east, south). */
  positionRef: React.MutableRefObject<{ x: number; z: number }>;
  /** Terrain height at a world point, or null where no chunk is loaded. */
  groundAt: (xM: number, zM: number) => number | null;
  /** Move the character to a world point (the app owns the body). */
  teleportTo: (xM: number, zM: number) => void;
  baseUrl: string;
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
  useFrame((_, delta) => {
    const { x, z } = positionRef.current;
    setNear((prev) => {
      const next = nearestSocket(sockets, x, z, TALK_RADIUS_M);
      return next?.serviceId === prev?.serviceId ? prev : next;
    });
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") { setMenu(null); return; }
      if (e.code !== "KeyE") return;
      if (menu) { setMenu(null); return; }
      if (near) { e.preventDefault(); openMenu(near); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, menu, index, world]);

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

  const panel = menu?.menu;
  const service = panel?.service;

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
      <Html fullscreen zIndexRange={[20, 10]} style={{ pointerEvents: "none" }}>
        {loadError && (
          <div style={{ position: "absolute", top: 120, left: 12, color: "#ff9a9a", font: "12px system-ui" }}>
            travel sockets: {loadError}
          </div>
        )}
        {near && !menu && (
          <div data-travel-prompt style={{
            position: "absolute", bottom: "26%", left: "50%", transform: "translateX(-50%)",
            background: "rgba(10,14,20,0.8)", padding: "8px 18px", borderRadius: 8,
            font: "18px system-ui", color: "#ffd9a0", whiteSpace: "nowrap",
          }}>
            {fill(text(CATALOGUE, "text.travel.prompt-talk"), { role: near.role })} <span style={{ opacity: 0.7 }}>[E]</span>
          </div>
        )}
        {notice && !menu && (
          <div role="status" data-travel-notice style={{
            position: "absolute", top: "34%", left: "50%", transform: "translate(-50%, -50%)",
            background: "rgba(10,14,20,0.8)", padding: "12px 22px", borderRadius: 10,
            font: "20px system-ui", color: "#ffd9a0", whiteSpace: "nowrap",
          }}>
            {notice}
          </div>
        )}
        {panel && service && (
          <div data-travel-menu style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            width: 380, maxHeight: "70vh", overflowY: "auto", pointerEvents: "auto",
            background: "rgba(10,14,20,0.92)", border: "1px solid #3a4550", borderRadius: 10,
            padding: "14px 16px", font: "14px system-ui", color: "#e6ecf5",
          }}>
            <div style={{ font: "600 16px system-ui", marginBottom: 6 }}>{safeText(service.text.name)}</div>
            <div style={{ opacity: 0.9, marginBottom: 8 }}>
              {safeText(panel.refusal ? panel.refusal.textId : service.text.hail)}
            </div>
            <div style={{ marginBottom: 10, opacity: 0.85 }}>
              {panel.refusal
                ? null
                : panel.unavailable
                  ? text(CATALOGUE, "text.travel.unavailable")
                  : panel.fareGold === 0
                    ? text(CATALOGUE, "text.travel.menu-free")
                    : fill(text(CATALOGUE, "text.travel.menu-fare"), { gold: String(panel.fareGold) })}
              <span style={{ float: "right", opacity: 0.7 }}>purse {purse}</span>
            </div>
            {panel.destinations.map((d) => (
              <button key={d.stationId} onClick={() => travel(d.stationId)} style={{
                display: "block", width: "100%", textAlign: "left", marginBottom: 6,
                padding: "6px 8px", cursor: "pointer",
              }}>
                {d.stationId} · {Math.round(d.lengthM)} m
              </button>
            ))}
            <button onClick={() => setMenu(null)} style={{ marginTop: 6, padding: "4px 10px", cursor: "pointer" }}>
              Esc
            </button>
          </div>
        )}
      </Html>
    </group>
  );
}
