"""Can this ground ever carry this record's typed TERRAIN promise?

`macro_plot` honours typed footprints, typed proximity and isolation floors,
but until now it never read `terrainRequests[]`. So a record whose whole
reason to exist is a forty-metre cliff or a forty-metre drowned sinkhole
could be plotted on a 28 m slope or a 2 m puddle, and nothing noticed until
`terrain_request_postconditions` measured the finished province ten minutes
of chain later.

This module closes that gap. It answers ONE question per request, at plot
time, from the shipped rasters:

    can the carve this request will run MAKE the promised state here?

A request is a promise to CUT, not only to find, so every predicate adds the
operation's own executable magnitude (`terrain_requests.delivery_delta`, the
same number the raster stage applies) to the ground as it stands, and only
then compares with the promise. What the carve cannot manufacture is where
this gate binds:

* a raise adds height, so a bench 40 m above its own support needs ground
  that already supplies `heightM - deltaM` of relief;
* a carve adds depth to water that is ALREADY THERE. Digging a hole in dry
  ground does not fill it — water arrives from the solved hydrology, not
  from the spade — so a wet promise on dry ground can never be delivered;
* a carve lowers a rim and can never raise a water level, so "flooded to
  within a rim's tolerance" fails on ground the water already covers;
* neither a carve nor a raise makes a river slack: the flow field is solved
  from drainage. A constriction or a basin can slow water somewhat, never by
  an order of magnitude.

The thresholds are IMPORTED from `terrain_request_postconditions`, never
restated: the plot and the final gate must judge the same promise by the same
numbers, or a record passes one and fails the other.
"""

from __future__ import annotations

import math

import numpy as np

from . import terrain_requests as tr
from .terrain_request_postconditions import (
    DEPTH_MINIMUMS, FLOOD_CLEARANCE_M, RIM_TOLERANCE_M, STORM_CLEARANCE_M,
    WET_MIN_M, load_known_red,
)

# A carve/raise reshapes a cross-section and can slow water inside its own
# support; it does not re-solve the drainage. Water arriving at twice the
# promised class speed can never be made to satisfy it here.
CURRENT_CARVE_FACTOR = 2.0
CURRENT_RANGES = {"standing": 0.05, "slack": 0.15, "slow": 0.5,
                  "flowing": 1.0, "swift": 3.0}

# A raise lifts its whole support, not only its centre, so the RELIEF it
# delivers is less than its magnitude. Measured on the shipped chain: the
# 40 m `one-sided-cliff-bench` at the-two-lamps-hermitage delivered 28.29 m
# of centre-to-support-minimum relief (terrain-request-postconditions.json,
# 2026-09-09), a ratio of 0.71. Depth is not scaled: a carve deepens against
# a water level that does not move with it.
RELIEF_EFFICIENCY = 0.7

# `cut` links a place to a channel; the link may be dug, but only to water
# that exists. This is how far the linking cut may reach for it.
CHANNEL_REACH_FACTOR = 2.0

# Relations that need standing/open water present in the support.
WET_RELATION_MIN_M = {
    "open-water": WET_MIN_M, "standing-water": WET_MIN_M,
    "water-over-threshold": WET_MIN_M, "underwater-entry": 1.2,
    "below-lake-bed": 1.2, "ringed-by-water": WET_MIN_M,
    "water-on-three-sides": WET_MIN_M,
}
CHANNEL_RELATIONS = {"channel-edge", "channel-linked", "waterward-outlet"}
CLEARANCE_RELATIONS = {"above-flood": FLOOD_CLEARANCE_M,
                       "above-storm-water": STORM_CLEARANCE_M}
CLEARANCE_HEIGHT_CLASSES = {"flood-free": FLOOD_CLEARANCE_M,
                            "storm-free": STORM_CLEARANCE_M}
# A labelled STANDING BODY, as `body_full` means it: water that is neither
# the sea nor the channel network. The plot cannot read those labels, so it
# reads what the shipped rasters publish — measured water, off the channel
# raster, standing above sea level (sea level is y = 0, decision 0003).
# Measured against `body_full` over the whole province at >= 1.2 m
# (2026-09-09): recall 0.92, precision 0.90. Adding the water CLASS to the
# test costs 15 points of recall for 2 of precision, because the class
# raster is authored intent and disagrees with the solved bodies.
SEA_LEVEL_M = 0.0
SEA_LEVEL_EPS_M = 0.05


def _disc_coords(px_m: float, x: float, z: float, radius_m: float, shape) -> tuple[np.ndarray, np.ndarray]:
    """World-space centres of the cells of one raster inside a disc."""
    n0, n1 = shape[0], shape[1]
    x0 = max(0, int(math.floor((x - radius_m) / px_m)))
    x1 = min(n1 - 1, int(math.ceil((x + radius_m) / px_m)))
    z0 = max(0, int(math.floor((z - radius_m) / px_m)))
    z1 = min(n0 - 1, int(math.ceil((z + radius_m) / px_m)))
    xs = np.arange(x0, x1 + 1) * px_m
    zs = np.arange(z0, z1 + 1) * px_m
    mask = (xs[None, :] - x) ** 2 + (zs[:, None] - z) ** 2 <= radius_m ** 2
    if not mask.any():
        mask = np.zeros_like(mask); mask[0, 0] = True
    zz, xx = np.nonzero(mask)
    return xs[xx], zs[zz]


def _sample(array: np.ndarray, px_m: float, world_x: np.ndarray, world_z: np.ndarray) -> np.ndarray:
    """Nearest samples of one raster at world points from ANOTHER raster.

    The water stack publishes ground at 2017, flow and class at 1345. Reading
    one grid at the other's pitch silently addresses the wrong cells — it read
    a dry bank as the river's own speed — so a cross-grid question always goes
    through world metres.
    """
    rows = np.clip(np.rint(world_z / px_m).astype(int), 0, array.shape[0] - 1)
    cols = np.clip(np.rint(world_x / px_m).astype(int), 0, array.shape[1] - 1)
    return array[rows, cols]


def _disc(array: np.ndarray, px_m: float, x: float, z: float, radius_m: float) -> np.ndarray:
    """Raster samples inside a world-space disc; never empty."""
    n0, n1 = array.shape[0], array.shape[1]
    x0 = max(0, int(math.floor((x - radius_m) / px_m)))
    x1 = min(n1 - 1, int(math.ceil((x + radius_m) / px_m)))
    z0 = max(0, int(math.floor((z - radius_m) / px_m)))
    z1 = min(n0 - 1, int(math.ceil((z + radius_m) / px_m)))
    xs = np.arange(x0, x1 + 1) * px_m
    zs = np.arange(z0, z1 + 1) * px_m
    mask = (xs[None, :] - x) ** 2 + (zs[:, None] - z) ** 2 <= radius_m ** 2
    window = array[z0:z1 + 1, x0:x1 + 1]
    if not mask.any():                      # radius below one pixel
        return window.reshape(-1)[:1]
    return window[mask]


class TerrainPromiseGate:
    """Judge a record's typed terrain promises against a candidate site.

    Built once per survey (the rasters are read-only), then asked per
    (record, x, z). Every answer is a list of stable blocker codes; an empty
    list is the contract, exactly like `typed_siting_violations`.
    """

    def __init__(self, survey) -> None:
        self.height = np.asarray(survey.fields.height_m)
        self.height_px_m = float(survey.height_px_m)
        self.level = np.asarray(survey.water_level_m)
        self.signed_depth = np.asarray(survey.water_signed_depth_m)
        self.water_px_m = float(survey.water.mpp2)
        self.flow = np.asarray(survey.water.flow)
        self.flow_px_m = float(survey.water.mppf)
        # `water-owner.png` is the compiler's own CHANNEL label (non-zero on
        # every `chan_full` cell of the solve and nowhere else), so a channel
        # relation is judged on labels, never inferred from a water class.
        self.channel = np.asarray(survey.water.owner2) > 0
        self.channel_px_m = self.water_px_m
        # The water-owned register, by the SAME request identity the
        # postcondition gate classifies on (`terrain_requests._request_id`),
        # so plot and postcondition exempt exactly the same rows.
        self.known_red = frozenset(load_known_red())

    # -- measurement ------------------------------------------------------
    def _centre_height(self, x: float, z: float) -> float:
        # Rounded, exactly like the postcondition gate's centre sample: a
        # floored index is half a pixel away and reads a different cell on a
        # cliff, which is where these promises live.
        n = self.height.shape[0]
        row = min(n - 1, max(0, int(round(z / self.height_px_m))))
        col = min(n - 1, max(0, int(round(x / self.height_px_m))))
        return float(self.height[row, col])

    def _wet_channel_cells(self, x: float, z: float, radius_m: float) -> int:
        """Labelled channel cells that measurably hold water in the disc."""
        wx, wz = _disc_coords(self.channel_px_m, x, z, radius_m, self.channel.shape)
        labelled = _sample(self.channel, self.channel_px_m, wx, wz)
        wet = _sample(self.signed_depth, self.water_px_m, wx, wz) > WET_MIN_M
        return int(np.count_nonzero(labelled & wet))

    def _standing_body_depth_m(self, x: float, z: float, radius_m: float) -> float:
        """Deepest water in the disc that belongs to a STANDING body.

        The final gate reads `body_full` — labelled standing water, which
        excludes both the sea and the channel network. Those labels are not
        published, so the plot reads the published equivalent.
        """
        wx, wz = _disc_coords(self.water_px_m, x, z, radius_m, self.signed_depth.shape)
        depth = _sample(self.signed_depth, self.water_px_m, wx, wz)
        standing = (depth > WET_MIN_M) & ~_sample(self.channel, self.channel_px_m, wx, wz)
        standing &= _sample(self.level, self.water_px_m, wx, wz) > SEA_LEVEL_M + SEA_LEVEL_EPS_M
        return float(depth[standing].max()) if standing.any() else 0.0

    # -- the gate ---------------------------------------------------------
    def blockers(self, requests, x: float, z: float,
                 place_id: str | None = None,
                 committed: tuple[float, float] | None = None) -> list[str]:
        """Blocker codes `kind:field detail`, known-red water rows excluded.

        A request already registered as WATER-OWNED in
        `terrain-request-known-red.json` is not this gate's to judge: its
        failure is a defect in the water solve, not in the ground under the
        dot, and blocking on it would make the plot chase a site that cannot
        exist anywhere. Those rows stay visible in the postcondition gate."""
        out: list[str] = []
        for request in requests or []:
            spec = tr.KIND_SPECS.get(request.get("kind"))
            delivery = request.get("delivery")
            radius = request.get("radiusM")
            if spec is None or not isinstance(delivery, dict) or not radius:
                continue                       # invalid input is terrain_requests' gate
            if place_id and tr._request_id(place_id, request) in self.known_red:
                continue
            radius_m = float(radius)
            # The shipped rasters ALREADY carry the last chain's carve. Inside
            # its own support a record would otherwise be credited its own
            # operation twice and a promise the compiler measurably failed to
            # deliver would read as deliverable.
            executed = committed is not None and \
                math.hypot(x - committed[0], z - committed[1]) <= radius_m
            for field, detail in self._request_blockers(spec, delivery, radius_m, x, z,
                                                        credit=not executed):
                out.append(f"{request['kind']}:{field} {detail}".strip())
        return sorted(set(out))

    def _request_blockers(self, spec: tr.KindSpec, delivery: dict, radius_m: float,
                          x: float, z: float, credit: bool = True) -> list[tuple[str, str]]:
        delta = tr.delivery_delta(spec, delivery) if credit else 0.0
        raise_gain = delta if spec.action == "raise" else 0.0
        carve_gain = delta if spec.action == "carve" else 0.0
        out: list[tuple[str, str]] = []

        ground = _disc(self.height, self.height_px_m, x, z, radius_m)
        centre = self._centre_height(x, z)
        signed = _disc(self.signed_depth, self.water_px_m, x, z, radius_m)
        levels = _disc(self.level, self.water_px_m, x, z, radius_m)
        wet = signed > WET_MIN_M
        max_wet_depth = float(signed[wet].max()) if wet.any() else 0.0
        # A 98th percentile, not the maximum: a single quantisation artefact
        # in the published surface must not decide a flood clearance.
        max_level = float(np.percentile(levels[wet], 98)) if wet.any() else None

        # 1. relief a raise must find or make
        if delivery.get("heightM") is not None:
            relief = centre - float(ground.min()) + raise_gain * RELIEF_EFFICIENCY
            if relief + 0.05 < float(delivery["heightM"]):
                out.append(("heightM", f"{relief:.1f}<{float(delivery['heightM']):.1f}"))

        # 2/3. depth: water must BE here, and the carve tops it up
        relation = delivery.get("waterRelation")
        depth_targets: list[tuple[str, float]] = []
        if delivery.get("depthM") is not None:
            depth_targets.append(("depthM", float(delivery["depthM"])))
        depth_class = delivery.get("depthClass")
        if depth_class in DEPTH_MINIMUMS:
            depth_targets.append(("depthClass", float(DEPTH_MINIMUMS[depth_class])))
        if relation in WET_RELATION_MIN_M:
            depth_targets.append(("waterRelation", WET_RELATION_MIN_M[relation]))
        water_field = depth_targets[0][0] if depth_targets else "waterRelation"
        if depth_targets and not wet.any():
            out.append((water_field, "no-water"))
        else:
            for field, target in depth_targets:
                if max_wet_depth + carve_gain + 0.05 < target:
                    out.append((field, f"{max_wet_depth + carve_gain:.1f}<{target:.1f}"))

        # 4. a standing body is a body, not a passing current
        if depth_class == "below-bed" or relation in {"below-lake-bed", "standing-water"}:
            need = max(WET_RELATION_MIN_M.get(relation, WET_MIN_M),
                       DEPTH_MINIMUMS.get(depth_class, WET_MIN_M))
            # A carve deepens a body that is already here; it cannot make the
            # sea or a channel into a standing body, so no water means no
            # credit at all.
            measured = self._standing_body_depth_m(x, z, radius_m)
            body = measured + carve_gain if measured > 0.0 else 0.0
            if body + 0.05 < need:
                out.append(("waterRelation" if relation else "depthClass",
                            f"standing-body {body:.1f}<{need:.1f}"))

        # 5. a cut links to a channel that exists; it does not invent one
        if relation in CHANNEL_RELATIONS:
            reach = radius_m * (CHANNEL_REACH_FACTOR if spec.action == "carve" else 1.0)
            if not self._wet_channel_cells(x, z, reach):
                out.append(("waterRelation", "no-wet-channel"))

        # 6. flooded to the rim: a carve lowers a rim, nothing raises the water
        if relation == "flooded-to-rim":
            # The ground and the water publish on the same 2017 grid, so the
            # dry rim is the support's ground where the signed depth is not
            # positive — the postcondition's own `ground[~wet]`.
            dry = ground[~wet] if ground.shape == wet.shape else \
                ground[ground > (max_level if max_level is not None else -math.inf)]
            if max_level is None:
                out.append(("waterRelation", "no-water"))
            elif not dry.size:
                out.append(("waterRelation", "rim-drowned no-dry-rim"))
            else:
                gap = float(dry.min()) - max_level
                if gap < -RIM_TOLERANCE_M:
                    out.append(("waterRelation", f"rim-drowned {gap:.2f}"))
                elif gap - carve_gain > RIM_TOLERANCE_M:
                    out.append(("waterRelation", f"rim-too-high {gap - carve_gain:.2f}"))

        # 7. clearance above the water a raise must win
        clearance = CLEARANCE_RELATIONS.get(relation) or \
            CLEARANCE_HEIGHT_CLASSES.get(delivery.get("heightClass"))
        clearance_field = "waterRelation" if relation in CLEARANCE_RELATIONS else "heightClass"
        if clearance is not None:
            context = max_level
            if context is None:
                context = self._nearest_level(x, z, radius_m)
            if context is None:
                out.append((clearance_field, "no-water-context"))
            elif centre + raise_gain - context < clearance:
                out.append((clearance_field, f"clearance {centre + raise_gain - context:.2f}<{clearance:.2f}"))

        # 8. drainage decides the current; a profile only trims it
        current = delivery.get("current")
        if current in CURRENT_RANGES:
            wx, wz = _disc_coords(self.flow_px_m, x, z, radius_m, self.flow.shape)
            speeds = _sample(self.flow, self.flow_px_m, wx, wz)
            wet_flow = _sample(self.signed_depth, self.water_px_m, wx, wz) > WET_MIN_M
            if wet_flow.any():
                speed = float(np.median(speeds[wet_flow]))
                ceiling = CURRENT_RANGES[current] * CURRENT_CARVE_FACTOR
                if speed > ceiling:
                    out.append(("current", f"{speed:.2f}>{ceiling:.2f}"))
        return out

    def _nearest_level(self, x: float, z: float, radius_m: float) -> float | None:
        """Highest water level in a bounded context around a dry support."""
        from .terrain_request_postconditions import WATER_CONTEXT_M
        wide = radius_m + WATER_CONTEXT_M
        signed = _disc(self.signed_depth, self.water_px_m, x, z, wide)
        levels = _disc(self.level, self.water_px_m, x, z, wide)
        wet = signed > WET_MIN_M
        return float(np.percentile(levels[wet], 98)) if wet.any() else None


def gate_for(survey) -> TerrainPromiseGate:
    """One gate per survey; the rasters behind it never change."""
    gate = getattr(survey, "_terrain_promise_gate", None)
    if gate is None:
        gate = TerrainPromiseGate(survey)
        survey._terrain_promise_gate = gate
    return gate
