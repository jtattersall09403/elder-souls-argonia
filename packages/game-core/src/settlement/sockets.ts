/**
 * Place sockets (decision 0103 decision 5): parse and validate the
 * `sockets[]` a settlement entry of the bundle carries. The compile
 * (`worldgen/sockets.py`) already gates the record against the vocabulary;
 * this is the runtime's refusal of a malformed or version-skewed record, so
 * Phase 13 and 10b read typed sockets and never guess.
 */
import {
  SETTLEMENT_SOCKET_KINDS,
  SETTLEMENT_SOCKETS_SCHEMA_VERSIONS,
  SOCKET_INTERACT_KINDS,
  type SettlementSocket,
} from "./types";

const PURPOSES = new Set(["work", "home", "evening", "leisure"]);
const KINDS = new Set<string>(SETTLEMENT_SOCKET_KINDS);

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isStrOrNull(v: unknown): boolean {
  return v === null || typeof v === "string";
}

const INTERACT_KINDS = new Set<string>(SOCKET_INTERACT_KINDS);

/** Whether a socket is a work socket, which carries `interact` from schema 2 (decision 0113). */
export function isWorkSocket(s: { kind?: unknown; activity?: unknown }): boolean {
  return s.kind === "station" || (s.kind === "idle" && s.activity === "work-at");
}

function interactErrors(id: string, v: unknown): string[] {
  const x = v as Record<string, unknown> | null;
  const pos = x?.position;
  if (!x || typeof x !== "object" || !INTERACT_KINDS.has(String(x.kind))
    || !Array.isArray(pos) || pos.length !== 3 || !pos.every(isNum) || !isNum(x.facing))
    return [`${id}: interact is not {kind: customer|station, position: [x, y, z], facing}`];
  return [];
}

/**
 * Every reason one raw socket is malformed (empty when it is well formed).
 * `schemaVersion` 2 requires `interact` on a work socket (decision 0113).
 */
export function socketErrors(raw: unknown, schemaVersion: number = SETTLEMENT_SOCKETS_SCHEMA_VERSIONS[1]): string[] {
  if (typeof raw !== "object" || raw === null) return ["socket is not an object"];
  const s = raw as Record<string, unknown>;
  const id = typeof s.id === "string" && s.id ? s.id : "?";
  const out: string[] = [];
  if (id === "?") out.push("socket has no id");
  if (typeof s.kind !== "string" || !KINDS.has(s.kind)) out.push(`${id}: kind ${String(s.kind)} is not a socket kind`);
  const pos = s.positionM;
  if (!Array.isArray(pos) || pos.length !== 3 || !pos.every(isNum)) out.push(`${id}: positionM is not [x, y, z]`);
  if (!isNum(s.yawDeg)) out.push(`${id}: yawDeg is not a number`);
  for (const f of ["parcelId", "interiorCell", "host"]) {
    if (!isStrOrNull(s[f])) out.push(`${id}: ${f} is not a string or null`);
  }
  if (typeof s.why !== "string") out.push(`${id}: why is not a string`);
  if (s.interact !== undefined) out.push(...interactErrors(id, s.interact));
  else if (schemaVersion >= 2 && isWorkSocket(s)) out.push(`${id}: work socket has no interact point`);
  switch (s.kind) {
    case "npc":
      if (typeof s.rosterSlotId !== "string") out.push(`${id}: npc socket has no rosterSlotId`);
      if (!Array.isArray(s.schedule)) out.push(`${id}: npc socket has no schedule[]`);
      else
        for (const e of s.schedule as Record<string, unknown>[]) {
          if (typeof e?.dayPhase !== "string" || typeof e?.socketId !== "string" || !PURPOSES.has(String(e?.purpose)))
            out.push(`${id}: schedule entry is not {dayPhase, socketId, purpose}`);
        }
      break;
    case "idle":
      if (typeof s.activity !== "string") out.push(`${id}: idle socket has no activity`);
      break;
    case "item":
      if (typeof s.itemClass !== "string") out.push(`${id}: item socket has no itemClass`);
      break;
    case "station":
      if (typeof s.stationClass !== "string") out.push(`${id}: station socket has no stationClass`);
      break;
    case "sign":
      if (!Array.isArray(s.pointsTo) || !s.pointsTo.length
        || !s.pointsTo.every((t) => typeof t === "string" && /^(route|place)\./.test(t)))
        out.push(`${id}: sign socket's pointsTo is not one route. or place. id per arm`);
      break;
    case "container":
      if (typeof s.containerClass !== "string") out.push(`${id}: container socket has no containerClass`);
      if (!isStrOrNull(s.fillRule)) out.push(`${id}: fillRule is not a string or null`);
      break;
    default:
      break;
  }
  return out;
}

/**
 * The sockets of one settlement entry, or a thrown error naming every
 * defect: a version the runtime does not read, a malformed socket, a
 * duplicate id, a schedule entry naming no idle socket. An entry with no
 * sockets (a bundle older than 0103) parses to [].
 */
export function parseSettlementSockets(entry: {
  id: string;
  socketsSchemaVersion?: unknown;
  sockets?: unknown;
}): SettlementSocket[] {
  if (entry.sockets === undefined) return [];
  const errors: string[] = [];
  const version = entry.socketsSchemaVersion as number;
  if (!(SETTLEMENT_SOCKETS_SCHEMA_VERSIONS as readonly number[]).includes(version))
    errors.push(`socketsSchemaVersion ${String(entry.socketsSchemaVersion)} is not one of ${SETTLEMENT_SOCKETS_SCHEMA_VERSIONS.join(", ")}`);
  if (!Array.isArray(entry.sockets)) errors.push("sockets is not an array");
  const raw = Array.isArray(entry.sockets) ? entry.sockets : [];
  for (const s of raw) errors.push(...socketErrors(s, version));
  const kindOf = new Map<string, string>();
  for (const s of raw as { id?: string; kind?: string }[]) {
    if (typeof s?.id !== "string") continue;
    if (kindOf.has(s.id)) errors.push(`${s.id}: id used twice`);
    kindOf.set(s.id, String(s.kind));
  }
  for (const s of raw as { id?: string; kind?: string; schedule?: { socketId?: string }[] }[]) {
    if (s?.kind !== "npc" || !Array.isArray(s.schedule)) continue;
    for (const e of s.schedule) {
      if (kindOf.get(String(e?.socketId)) !== "idle")
        errors.push(`${s.id}: schedule names ${String(e?.socketId)}, which is no idle socket`);
    }
  }
  if (errors.length) throw new Error(`settlement ${entry.id} sockets: ${errors.join("; ")}`);
  return raw as SettlementSocket[];
}
