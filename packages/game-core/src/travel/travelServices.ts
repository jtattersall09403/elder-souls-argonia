/**
 * The talk-to-service contract (16e, decision 0068): Morrowind-style travel.
 *
 * The world record `travel-services.json` (published copy under
 * `province/travel-services.json`) is the province's one service graph:
 * ferrymen, boat owners, rootworm Waykeepers, later guides, carts and
 * porters. At a station an operator socket offers the service; the player
 * talks, pays and arrives. No vessel is simulated. This module is the small
 * contract the build-out's dialogue and economy systems will grow from
 * (docs/phases/buildout/README.md, "Dialogue/interaction UI" row): pure
 * functions over the record and an injected view of the world state, with
 * no rendering and no singleton. The gate predicates are the typed
 * vocabulary of docs/quests/85; an unknown predicate name is a data error
 * and throws, never a silent pass.
 */

/** A measured shortfall the record REPORTS rather than gates on (16g rule 2):
 * a hop or a berth shallower than the craft's hull needs. The service still
 * runs; the number is what 16h answers with a craft or a jetty. */
export interface TravelWarning {
  kind: "shallow-hop" | "shallow-berth";
  depthM: number | null;
  needM: number;
  at: string;
}

export interface TravelStation {
  id: string;
  kind: "place" | "ferry-landing" | "root-node";
  placeId?: string | null;
  /** null only while a station's place is deferred and has no position yet. */
  positionM: [number, number] | null;
  status: "active" | "placeholder" | "deferred" | "unmatched";
  berth?: {
    entityId: string;
    entityKind: string;
    depthM: number;
    hullClass: string;
    floats: boolean;
    positionM?: [number, number];
    jettyM?: number | null;
  };
  piece?: string;
  warnings?: TravelWarning[];
  /** A rootworm node's role in the network: hub, ordinary stop, or seasonal. */
  rootKind?: "hub" | "station" | "seasonal";
  operator?: { role: string; slotId: string; socket: { stationId: string } };
}

export interface GatePredicate {
  predicate: string;
  is?: string;
  place?: string;
  region?: string;
  value?: number;
}

export interface TravelHop {
  from: string;
  to: string;
  /** One of `lane`, `lanes` (the chain of published lanes walked), `road`,
   * `rootway` or `reaches`. */
  follows: Record<string, unknown>;
  lengthM: number | null;
  unresolved?: boolean;
}

export interface TravelService {
  id: string;
  serviceKind: "ferry" | "boat" | "rootworm" | "guide" | "cart" | "porter";
  form: "road-crossing" | "station-run";
  status: "active" | "placeholder" | "deferred" | "unmatched";
  stations?: string[];
  landings?: string[];
  hops: TravelHop[];
  operator: { role: string; slotId: string; socket: { stationId: string }; nearestPlaceId?: string };
  fare: { gold: number; freeIf: GatePredicate[] };
  available: GatePredicate[];
  refusedIf: GatePredicate[];
  text: { name: string; hail: string; refusal?: string };
  hullClass?: string;
  craft?: string;
  warnings?: TravelWarning[];
}

/** Where each major city boards a boat (16g rule 4). `placeId` is null while
 * the harbour has not been chosen. */
export interface HarbourStation {
  stationId: string | null;
  placeId: string | null;
  why: string | null;
}

export interface TravelServiceGraph {
  schemaVersion: number;
  stations: TravelStation[];
  services: TravelService[];
  rootways?: { id: string; from: string; to: string; status: string }[];
  harbourStations?: Record<string, HarbourStation>;
}

/** What a gate may ask the world. Apps supply it; nothing here reads a store. */
export interface WorldStateReader {
  placeStance(placeId: string): string | undefined;
  weather(): string;
  season(): string;
  carriedValue(): number;
  /** The Owing ledger for a region (docs/quests/85 `owingAtLeast`; the
   * crime-as-Owing model of decision 0039): 0 when nothing is owed. */
  owing(region: string): number;
}

export const TRAVEL_PREDICATES = ["placeStanceIs", "weatherIs", "seasonIs", "carriedValueAtLeast", "owingAtLeast"] as const;

/** One predicate against the world. Throws on a name outside the vocabulary
 * this contract implements: the quest vocabulary (docs/quests/85) is closed,
 * and a gate nobody can evaluate must fail loudly at load, not pass. */
export function evaluatePredicate(p: GatePredicate, world: WorldStateReader): boolean {
  switch (p.predicate) {
    case "placeStanceIs":
      return p.place !== undefined && world.placeStance(p.place) === p.is;
    case "weatherIs":
      return world.weather() === p.is;
    case "seasonIs":
      return world.season() === p.is;
    case "carriedValueAtLeast":
      return world.carriedValue() >= (p.value ?? 0);
    case "owingAtLeast":
      return p.region !== undefined && world.owing(p.region) >= (p.value ?? 0);
    default:
      throw new Error(`travel: predicate '${p.predicate}' is not in the vocabulary this contract evaluates`);
  }
}

export interface TravelGraphIndex {
  graph: TravelServiceGraph;
  stationById: Map<string, TravelStation>;
  serviceById: Map<string, TravelService>;
  /** Services offered at a station (its operator socket stands there or it
   * is one of the service's stations). */
  servicesAtStation: Map<string, TravelService[]>;
}

export function serviceStations(s: TravelService): string[] {
  return s.form === "road-crossing" ? (s.landings ?? []) : (s.stations ?? []);
}

export function indexTravelGraph(graph: TravelServiceGraph): TravelGraphIndex {
  const stationById = new Map(graph.stations.map((s) => [s.id, s] as const));
  const serviceById = new Map(graph.services.map((s) => [s.id, s] as const));
  const servicesAtStation = new Map<string, TravelService[]>();
  for (const svc of graph.services) {
    for (const st of serviceStations(svc)) {
      if (!stationById.has(st)) throw new Error(`travel: service ${svc.id} names unknown station ${st}`);
      const list = servicesAtStation.get(st) ?? [];
      list.push(svc);
      servicesAtStation.set(st, list);
    }
    if (!stationById.has(svc.operator.socket.stationId)) {
      throw new Error(`travel: service ${svc.id} has its operator at unknown station ${svc.operator.socket.stationId}`);
    }
  }
  return { graph, stationById, serviceById, servicesAtStation };
}

/** Every operator socket: where a "talk" prompt exists in the world. */
export function operatorSockets(index: TravelGraphIndex): { serviceId: string; stationId: string; positionM: [number, number]; role: string }[] {
  return index.graph.services
    .filter((s) => s.status === "active" || s.status === "placeholder")
    .flatMap((s) => {
      const st = index.stationById.get(s.operator.socket.stationId)!;
      // A station whose place is not sited yet has no point to stand on.
      if (!st.positionM) return [];
      return [{ serviceId: s.id, stationId: st.id, positionM: st.positionM, role: s.operator.role }];
    });
}

export interface ServiceMenu {
  service: TravelService;
  /** Where the player is standing (the station the socket belongs to). */
  fromStationId: string;
  destinations: { stationId: string; positionM: [number, number]; lengthM: number }[];
  /** The fare after `freeIf`; 0 when a free predicate holds. */
  fareGold: number;
  refusal?: { predicate: GatePredicate; textId: string };
  unavailable?: { predicate: GatePredicate };
}

/** The menu a socket opens: destinations, the fare owed, or the refusal. */
export function serviceMenu(index: TravelGraphIndex, serviceId: string, fromStationId: string, world: WorldStateReader): ServiceMenu {
  const service = index.serviceById.get(serviceId);
  if (!service) throw new Error(`travel: no service ${serviceId}`);
  const stations = serviceStations(service);
  if (!stations.includes(fromStationId)) throw new Error(`travel: ${serviceId} does not call at ${fromStationId}`);
  const menu: ServiceMenu = { service, fromStationId, destinations: [], fareGold: service.fare.gold };
  const refused = service.refusedIf.find((p) => evaluatePredicate(p, world));
  if (refused) {
    menu.refusal = { predicate: refused, textId: service.text.refusal ?? service.text.hail };
    return menu;
  }
  const blocked = service.available.find((p) => !evaluatePredicate(p, world));
  if (blocked) {
    menu.unavailable = { predicate: blocked };
    return menu;
  }
  if (service.fare.freeIf.some((p) => evaluatePredicate(p, world))) menu.fareGold = 0;
  // destinations: every other station of the service, at the hop distance
  // summed along the station order (a run) or the one hop (a crossing)
  const order = stations;
  const i = order.indexOf(fromStationId);
  const hopLen = new Map(service.hops.map((h) => [`${h.from}>${h.to}`, h.lengthM] as const));
  const between = (a: number, b: number): number => {
    let m = 0;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    for (let k = lo; k < hi; k++) {
      m += hopLen.get(`${order[k]}>${order[k + 1]}`) ?? hopLen.get(`${order[k + 1]}>${order[k]}`) ?? 0;
    }
    return m;
  };
  for (let j = 0; j < order.length; j++) {
    if (j === i) continue;
    const st = index.stationById.get(order[j])!;
    if (!st.positionM) continue;
    menu.destinations.push({ stationId: st.id, positionM: st.positionM, lengthM: between(i, j) });
  }
  return menu;
}

export type TripOutcome =
  | { kind: "refused"; textId: string }
  | { kind: "unavailable" }
  | { kind: "cannot-pay"; fareGold: number }
  | { kind: "arrive"; fareGold: number; stationId: string; positionM: [number, number] };

/** Talk, pay, arrive. `purseGold` is what the player carries; the caller
 * deducts the fare and moves the character on `arrive`. */
export function resolveTrip(index: TravelGraphIndex, serviceId: string, fromStationId: string, toStationId: string,
                            purseGold: number, world: WorldStateReader): TripOutcome {
  const menu = serviceMenu(index, serviceId, fromStationId, world);
  if (menu.refusal) return { kind: "refused", textId: menu.refusal.textId };
  if (menu.unavailable) return { kind: "unavailable" };
  const dest = menu.destinations.find((d) => d.stationId === toStationId);
  if (!dest) throw new Error(`travel: ${serviceId} has no destination ${toStationId} from ${fromStationId}`);
  if (purseGold < menu.fareGold) return { kind: "cannot-pay", fareGold: menu.fareGold };
  return { kind: "arrive", fareGold: menu.fareGold, stationId: dest.stationId, positionM: dest.positionM };
}
