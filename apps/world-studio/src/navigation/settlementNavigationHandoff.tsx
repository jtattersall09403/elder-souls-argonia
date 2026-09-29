import { useEffect, useMemo } from "react";
import {
  useSettlementBundle, useSettlementBundleSource,
} from "@elder-souls/game-core/settlement/settlementIndex";

interface NavmeshCut {
  id: string;
  placementId: string;
  polygonM: [number, number][];
  order: number;
}

interface NavmeshLink {
  id: string;
  placementId: string;
  kind: string;
  bidirectional: boolean;
}

export interface SettlementNavigationExport {
  navmeshCuts?: NavmeshCut[];
  navmeshLinks?: NavmeshLink[];
}

export interface SettlementNavigationHandoffStatus {
  status: "loading" | "blocked-no-navigation-runtime" | "invalid-export" | "missing-export";
  cuts: number;
  links: number;
  errors: string[];
}

declare global {
  interface Window {
    __STUDIO_SETTLEMENT_NAVIGATION__?: SettlementNavigationHandoffStatus;
  }
}

const finitePoint = (point: unknown): point is [number, number] =>
  Array.isArray(point) && point.length === 2
  && Number.isFinite(point[0]) && Number.isFinite(point[1]);

/** Validate the exported hand-off independently of a future pathfinder. The
 * current Studio has character physics but no navigation-mesh/pathfinding
 * runtime, so valid data must remain visibly blocked rather than being called
 * delivered merely because it reached JSON. */
export function inspectSettlementNavigation(
  bundle: SettlementNavigationExport,
): SettlementNavigationHandoffStatus {
  const cuts = Array.isArray(bundle.navmeshCuts) ? bundle.navmeshCuts : [];
  const links = Array.isArray(bundle.navmeshLinks) ? bundle.navmeshLinks : [];
  const errors: string[] = [];
  const ids = new Set<string>();
  const cutPlacements = new Set<string>();
  for (const [index, cut] of cuts.entries()) {
    if (!cut || typeof cut.id !== "string" || !cut.id) errors.push(`navmeshCuts[${index}] has no id`);
    else if (ids.has(cut.id)) errors.push(`duplicate navigation id ${cut.id}`);
    else ids.add(cut.id);
    if (typeof cut?.placementId !== "string" || !cut.placementId) {
      errors.push(`navmeshCuts[${index}] has no placementId`);
    } else cutPlacements.add(cut.placementId);
    if (!Array.isArray(cut?.polygonM) || cut.polygonM.length < 3
        || !cut.polygonM.every(finitePoint)) {
      errors.push(`navmeshCuts[${index}] has no valid footprint polygon`);
    }
    if (!Number.isFinite(cut?.order)) errors.push(`navmeshCuts[${index}] has no order`);
  }
  for (const [index, link] of links.entries()) {
    if (!link || typeof link.id !== "string" || !link.id) errors.push(`navmeshLinks[${index}] has no id`);
    else if (ids.has(link.id)) errors.push(`duplicate navigation id ${link.id}`);
    else ids.add(link.id);
    if (typeof link?.placementId !== "string" || !cutPlacements.has(link.placementId)) {
      errors.push(`navmeshLinks[${index}] does not name a cut placement`);
    }
    if (typeof link?.kind !== "string" || !link.kind) errors.push(`navmeshLinks[${index}] has no kind`);
    if (typeof link?.bidirectional !== "boolean") {
      errors.push(`navmeshLinks[${index}] has no bidirectional contract`);
    }
  }
  if (errors.length) return { status: "invalid-export", cuts: cuts.length, links: links.length, errors };
  if (!cuts.length) {
    return {
      status: "missing-export", cuts: 0, links: links.length,
      errors: ["the settlement bundle contains no building navigation cuts"],
    };
  }
  return { status: "blocked-no-navigation-runtime", cuts: cuts.length, links: links.length, errors: [] };
}

const LOADING: SettlementNavigationHandoffStatus = {
  status: "loading", cuts: 0, links: 0, errors: [],
};

/**
 * The hand-off readout is a developer's line, never the owner's (walk 4 d):
 * it shows only with `?dev=1`. The studio carries no other debug switch
 * (`studioTools.ts` forbids gating on the build mode), so this is that switch.
 */
export function navigationHandoffShown(search: string): boolean {
  return new URLSearchParams(search).get("dev") === "1";
}

export function SettlementNavigationHandoff({
  baseUrl,
  visible: requested,
}: {
  baseUrl: string;
  visible: boolean;
}) {
  const visible = requested && navigationHandoffShown(window.location.search);
  // The places the settlement layer has in range (the app's settlement
  // source, S8): this toast has no position of its own, so it only follows
  // the layer's sets and loads nothing itself; read only while it can show.
  const source = useSettlementBundleSource(baseUrl);
  const { bundle, error } = useSettlementBundle(source, undefined, visible);
  const result = useMemo<SettlementNavigationHandoffStatus>(() => {
    if (error) {
      return { status: "missing-export", cuts: 0, links: 0, errors: [error.message] };
    }
    return bundle ? inspectSettlementNavigation(bundle as SettlementNavigationExport) : LOADING;
  }, [bundle, error]);

  useEffect(() => {
    window.__STUDIO_SETTLEMENT_NAVIGATION__ = result;
    return () => { delete window.__STUDIO_SETTLEMENT_NAVIGATION__; };
  }, [result]);

  if (!visible || result.status === "loading") return null;
  const invalid = result.status !== "blocked-no-navigation-runtime";
  const detail = invalid
    ? result.errors[0]
    : `${result.cuts} building cuts and ${result.links} deck links exported; no pathfinding runtime consumes them yet.`;
  return (
    <div role="status" data-settlement-navigation-status={result.status} style={{
      position: "fixed", right: 12, bottom: 12, zIndex: 80, maxWidth: 390,
      padding: "7px 10px", borderRadius: 6,
      border: `1px solid ${invalid ? "#ff6677" : "#d8a83e"}`,
      background: "rgba(18, 15, 12, 0.9)", color: invalid ? "#ffb3bc" : "#ffe4a8",
      font: "12px/1.35 system-ui", pointerEvents: "none",
    }}>
      <strong>Settlement navigation is not active.</strong> {detail}
    </div>
  );
}
