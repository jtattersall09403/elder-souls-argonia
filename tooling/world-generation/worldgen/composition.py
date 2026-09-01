"""Composition passes over the scattered instances — the mined C-rules
(docs/research/vegetation-composition-rules.md, machine form
world/sources/placement/composition-rules.json).

Four things the plain sampler cannot know, because they are about how the
source authors COMPOSE models rather than where they put them:

* **C1/C2 — pivot anchoring + sink.** The anchor is the model pivot, never
  bbox-min; pivots sink 0.2–0.8 m into flat ground and ~2× that on slopes.
  `finalise_anchors` bakes a per-instance sink (per-species flat depth from
  the mined p50s, slope term from the class table, ±50 % jitter).
* **C3 — attachments.** Hanging vines/moss and the tramaroot pieces are never
  free-standing in any source; they are composed onto a host (same XY as a
  bush/tree, pivot metres up). `split_layers` pulls them out of the scatter
  pools; `spawn_attachments` hangs them on placed hosts afterwards.
* **C4 — cluster-parts.** Every mid-storey bush in the palette is placed by
  the sources as a merged multi-piece stack (80–100 % companion rate within
  2 m, deep-sunk). `expand_clusters` turns each placed instance into a small
  clump template: anchor + 1–4 companions within 2 m, sunk 0.5–1.6 m.
* **C5 — water layering.** Lilypads anchor to the WATER surface (pivot at the
  model top); kelp anchors to the bed below. `finalise_anchors` bakes the
  water-surface elevation into `y` and flags the anchor mode so the renderer
  stops re-grounding pads to the terrain.

Everything is driven by `hash64(seed, pass-salt, quantised position)` so the
passes are as deterministic and order-independent as the sampler itself.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path

from .scatter import (
    ANCHOR_ATTACHED,
    ANCHOR_TERRAIN,
    ANCHOR_WATER_SURFACE,
    Fields,
    Instance,
    Layer,
    hash64,
    uniform_at,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
RULES_PATH = REPO_ROOT / "world" / "sources" / "placement" / "composition-rules.json"
KIT_MANIFEST_PATH = (REPO_ROOT / "apps" / "world-studio" / "public" / "kits"
                     / "flora-province-v1.kit.json")

# Pass salts — distinct hash streams per pass.
_SALT_SINK = 0x51D3
_SALT_CLUSTER = 0xC1057
_SALT_ATTACH = 0xA77AC4

#: Extras per cluster anchor are 1–4 (uniform), so a placed cluster-part
#: instance becomes on average 1 + 2.5 = 3.5 pieces. Densities of
#: cluster-part layers are divided by this so the clump pass never changes
#: how much of a species there is.
CLUSTER_MEAN_PIECES = 3.5
CLUSTER_RADIUS_M = 2.0                    # C4: members 0–2 m apart
CLUSTER_SINK_M = (0.5, 1.6)               # C4: deep-sunk into one bush mass

#: Ceiling on attachments hung on one host — moss can repeat on a big tree,
#: but a host must never become a beard of vines (mined ratio: ~0.4
#: tramaroots per tropicalplant host).
MAX_ATTACH_PER_HOST = 2


def _quantised(x: float, z: float) -> tuple[int, int]:
    """A stable integer identity for a placed position (1/16 m grid)."""
    return int(round(x * 16.0)) & 0xFFFFFFFF, int(round(z * 16.0)) & 0xFFFFFFFF


@dataclass
class TrunkCapsule:
    """A tree's measured trunk, from the kit manifest (collision v2: offsets
    are pivot-relative, world axes). The attachment pass hangs things ON this
    axis — round 5 hung them in a ±0.5 m square around the model pivot, which
    for off-axis trunks (the willow's is 7 m from its pivot) meant vines
    stuck to outer leaves and to empty air (owner round-5 feedback)."""
    x: float          # pivot -> trunk axis, metres, unrotated local frame
    z: float
    base_y: float     # pivot -> trunk base
    radius: float
    height: float


def load_trunk_capsules(path: Path = KIT_MANIFEST_PATH) -> dict[str, TrunkCapsule]:
    """species id -> trunk, for every kit asset carrying a v2 trunk capsule.
    Returns {} when the kit manifest is absent (unit tests, bare checkouts)."""
    if not path.exists():
        return {}
    trunks: dict[str, TrunkCapsule] = {}
    for asset in json.loads(path.read_text()).get("assets", []):
        capsule = asset.get("collisionCapsule")
        if not capsule or asset.get("collisionFrame") != "pivot-yup-v2":
            continue
        base = capsule.get("baseOffsetM", [0.0, 0.0, 0.0])
        trunks[asset["id"]] = TrunkCapsule(
            x=base[0], z=base[2], base_y=base[1],
            radius=capsule["radiusM"], height=capsule["heightM"])
    return trunks


@dataclass
class SpeciesRule:
    klass: str                            # standalone | attachment | ...
    sink_flat_m: float                    # mined pivot depth on flat ground
    hosts: tuple[str, ...] = ()
    attach_height_m: tuple[float, float, float] = (0.0, 0.0, 0.0)  # p25/p50/p75
    companions: tuple[str, ...] = ()


class Composition:
    """The composition-rules JSON, digested into what the passes need."""

    #: Class sink defaults (C2's recommendedSinkDepthM): flat depth used only
    #: when a species has no mined p50, slope term and cap used always.
    CLASS_SINK = {
        "tree": (0.5, 0.05, 2.5),
        "shrub": (0.3, 0.07, 2.0),
        "plant": (0.05, 0.02, 0.5),
        "grass": (0.3, 0.05, 1.5),
        # Rocks were falling into "plant" on the path test and getting a 0.05 m
        # sink — a 10 m cliff shell resting on the surface (owner round 4).
        # A rock settles INTO the ground, and more so on a slope where debris
        # banks up behind it. Per-species depths in the rules file scale this
        # with the mesh; these are the fallback.
        "rock": (0.4, 0.05, 3.0),
    }

    #: A canopy host must have at least this much measured trunk — it is what
    #: culls the shrubby "/trees/" pseudo-trees (tropicalplant, bambooplant…)
    #: that round 5 hung 2–6 m vines on, well above the whole plant.
    MIN_HOST_TRUNK_M = 6.0

    def __init__(self, data: dict, trunks: dict[str, TrunkCapsule] | None = None):
        self.trunks: dict[str, TrunkCapsule] = trunks or {}
        self.species: dict[str, SpeciesRule] = {}
        spawn = data.get("attachmentSpawn", {})
        #: species -> {"default": p, host-id: p} — per-host spawn probability.
        self.attach_rates: dict[str, dict[str, float]] = {
            k: dict(v) for k, v in spawn.get("perHostProbability", {}).items()}
        self.humidity: dict[int, float] = {
            int(k): float(v)
            for k, v in spawn.get("regionHumidityMultiplier", {}).items()}
        rec = data.get("anchoring", {}).get("recommendedSinkDepthM", {})
        for klass, spec in rec.items():
            if isinstance(spec, dict):
                self.CLASS_SINK[klass] = (
                    spec["flat"], spec["perSlopeDegOver10"], spec["max"])
        for name, entry in data.get("species", {}).items():
            klass = entry.get("class", "standalone")
            heights = entry.get("attachHeightM") or {}
            if "recommended" in heights:
                lo, hi = heights["recommended"]
                p25, p50, p75 = lo, (lo + hi) / 2.0, hi
            else:
                p25 = heights.get("p25", 0.0)
                p50 = heights.get("p50", 0.0)
                p75 = heights.get("p75", 0.0)
            self.species[name] = SpeciesRule(
                klass=klass,
                sink_flat_m=self._mined_sink(entry),
                hosts=tuple(entry.get("hosts", ())),
                attach_height_m=(p25, p50, p75),
                companions=tuple(entry.get("companions", ())),
            )
        # Generic hosts for "tree-canopy"/"branch"/"overhang". With kit trunk
        # data: every asset with a real measured trunk (which both drops the
        # shrubby pseudo-trees and admits canopy species the rules file has
        # never heard of). Without it (tests): the old name-substring rule.
        if self.trunks:
            self.tree_hosts = tuple(sorted(
                name for name, trunk in self.trunks.items()
                if trunk.height >= self.MIN_HOST_TRUNK_M
                and self.klass(name) in ("standalone", "cluster-part")
                and "lillipad" not in name
            ))
        else:
            self.tree_hosts = tuple(sorted(
                name for name, rule in self.species.items()
                if "/trees/" in name and rule.klass in ("standalone", "cluster-part")
                and "lillipad" not in name
            ))

    @classmethod
    def load(cls, path: Path = RULES_PATH,
             kit_path: Path = KIT_MANIFEST_PATH) -> "Composition":
        return cls(json.loads(path.read_text()), load_trunk_capsules(kit_path))

    # -- classification --------------------------------------------------

    def klass(self, species: str) -> str:
        rule = self.species.get(species)
        return rule.klass if rule else "standalone"

    def anchor_mode(self, species: str) -> int:
        k = self.klass(species)
        if k == "water-surface":
            return ANCHOR_WATER_SURFACE
        if k == "attachment":
            return ANCHOR_ATTACHED
        return ANCHOR_TERRAIN            # standalone, cluster-part, bed-anchored

    def _size_class(self, species: str) -> str:
        if "/rocks/" in species:
            return "rock"
        if "/grass/" in species:
            return "grass"
        # A measured trunk capsule IS the definition of a tree, and it is the
        # only one that survives round 7's composites — `composite:jungle/
        # anvil-canopy-tree` has no "/trees/" in its id because the id is ours,
        # not a mod path. The substring rule stays as the no-kit fallback.
        if species in self.trunks or "/trees/" in species:
            return "tree"
        if "shrub" in species or "bush" in species:
            return "shrub"
        return "plant"

    @staticmethod
    def _mined_sink(entry: dict) -> float:
        offsets = entry.get("pivotOffsetM") or {}
        for key in ("vwFlatP50", "bmFlatP50", "bmP50", "p50"):
            value = offsets.get(key)
            if isinstance(value, (int, float)):
                return max(0.0, -float(value))   # sunk = negative offset
        return float("nan")                      # no mined figure — class default

    # -- pass 0: layer split (C3 + C4 density compensation) ---------------

    def split_layers(self, layers: list[Layer]) -> tuple[list[Layer], list[Layer]]:
        """(scatter layers, attachment layers).

        Attachment-class species leave free scatter entirely; cluster-part
        layers stay but with density pre-divided by the mean clump size the
        expansion pass will multiply back in.
        """
        scatter, attachments = [], []
        for layer in layers:
            k = self.klass(layer.species)
            if k == "attachment":
                attachments.append(layer)
            elif k == "cluster-part":
                layer.instances_per_hectare /= CLUSTER_MEAN_PIECES
                scatter.append(layer)
            else:
                scatter.append(layer)
        return scatter, attachments

    # -- pass 1: pivot sink + water layering (C1, C2, C5) ------------------

    def sink_m(self, species: str, slope_deg: float, rand: float) -> float:
        flat, per_deg, cap = self.CLASS_SINK[self._size_class(species)]
        rule = self.species.get(species)
        if rule and not math.isnan(rule.sink_flat_m):
            flat = rule.sink_flat_m
        sink = flat + per_deg * max(0.0, slope_deg - 10.0)
        return min(cap, max(0.0, sink)) * (0.5 + rand)   # ±50 % jitter

    def finalise_anchors(self, instances: list[Instance], fields: Fields,
                         seed: int) -> None:
        """Bake anchor mode, sink and (for water species) the surface Y."""
        salt = hash64(seed, _SALT_SINK)
        for inst in instances:
            mode = self.anchor_mode(inst.species)
            inst.anchor = mode
            if mode == ANCHOR_WATER_SURFACE:
                # y becomes the ABSOLUTE water-surface elevation: ground plus
                # standing depth. The renderer must use it as-is (C5).
                depth = max(0.0, fields.water_depth(inst.x, inst.z))
                inst.y = fields.height(inst.x, inst.z) + depth
                inst.sink = 0.0
                continue
            qx, qz = _quantised(inst.x, inst.z)
            inst.sink = self.sink_m(
                inst.species, fields.slope(inst.x, inst.z),
                uniform_at(salt, qx, qz))

    # -- pass 2: cluster expansion (C4) ------------------------------------

    def expand_clusters(self, instances: list[Instance], fields: Fields,
                        seed: int, allowed: set[str]) -> list[Instance]:
        """Companion pieces for every placed cluster-part instance."""
        salt = hash64(seed, _SALT_CLUSTER)
        extras: list[Instance] = []
        for inst in instances:
            rule = self.species.get(inst.species)
            if not rule or rule.klass != "cluster-part":
                continue
            companions = [c for c in rule.companions if c in allowed] or [inst.species]
            qx, qz = _quantised(inst.x, inst.z)
            key = hash64(salt, qx, qz)
            count = 1 + int(uniform_at(key, 0) * 4.0)     # 1–4 extras
            for member in range(count):
                mkey = hash64(key, member + 1)
                angle = uniform_at(mkey, 0) * math.tau
                radius = CLUSTER_RADIUS_M * math.sqrt(uniform_at(mkey, 1))
                px = inst.x + math.cos(angle) * radius
                pz = inst.z + math.sin(angle) * radius
                species = companions[int(uniform_at(mkey, 2) * len(companions))
                                     % len(companions)]
                lo, hi = CLUSTER_SINK_M
                extras.append(Instance(
                    species=species, tier=inst.tier,
                    x=px, z=pz, y=fields.height(px, pz),
                    yaw=uniform_at(mkey, 3) * math.tau,
                    scale=inst.scale * (0.75 + 0.5 * uniform_at(mkey, 4)),
                    tilt_x=inst.tilt_x, tilt_z=inst.tilt_z,
                    anchor=self.anchor_mode(species),
                    sink=lo + (hi - lo) * uniform_at(mkey, 5),
                ))
        return extras

    # -- pass 3: attachments (C3) ------------------------------------------

    #: Host tokens that mean "somewhere up a tree". `cliff-face` is NOT one of
    #: them: it used to resolve here too, so anything the sources hung on rock
    #: was silently hung on trees instead. We place no cliff-face hosts, so the
    #: token now resolves to nothing and a species whose only hosts are cliff
    #: faces simply does not spawn as an attachment (round 5).
    CANOPY_HOST_TOKENS = ("tree-canopy", "branch", "overhang")

    def _hosts_for(self, species: str) -> set[str]:
        resolved: set[str] = set()
        for host in self.species[species].hosts if species in self.species else ():
            if host in self.CANOPY_HOST_TOKENS:
                resolved.update(self.tree_hosts)
            elif host == "cliff-face":
                continue
            else:
                resolved.add(host)
        return resolved

    def spawn_attachments(self, instances: list[Instance],
                          attachment_layers: list[Layer], fields: Fields,
                          seed: int, area_ha: float) -> list[Instance]:
        """Hang attachment species on eligible placed hosts.

        Attachments are ACCENTS (coordinator ruling, round 4): the spawn is a
        per-host PROBABILITY from `attachmentSpawn.perHostProbability` in the
        rules JSON (mined co-occurrence for tramaroot-on-tropicalplant, sparse
        8–12 % defaults for the zero-precedent vines/moss), scaled by the
        host region's humidity multiplier. The layer's authored per-ha is NOT
        the driver — a chunk full of trees must not grow a beard."""
        salt = hash64(seed, _SALT_ATTACH)
        spawned: list[Instance] = []
        for layer in attachment_layers:
            hosts_wanted = self._hosts_for(layer.species)
            hosts = [i for i in instances if i.species in hosts_wanted
                     and i.anchor == ANCHOR_TERRAIN]
            if not hosts:
                continue
            rates = self.attach_rates.get(layer.species, {"default": 0.1})
            p25, p50, p75 = self.species[layer.species].attach_height_m
            lsalt = hash64(salt, *[ord(c) for c in layer.species])
            for host in hosts:
                # Region/depth/altitude gates still apply — an attachment
                # layer authored for the swamp must not dress jungle hosts.
                depth = fields.water_depth(host.x, host.z)
                slope = fields.slope(host.x, host.z)
                if not layer.gate(depth, slope,
                                  fields.region(host.x, host.z),
                                  fields.land_cover(host.x, host.z),
                                  altitude_m=fields.height(host.x, host.z),
                                  shore_m=fields.shore(host.x, host.z),
                                  coast_m=fields.coast(host.x, host.z)):
                    continue
                qx, qz = _quantised(host.x, host.z)
                key = hash64(lsalt, qx, qz)
                per_host = min(
                    float(MAX_ATTACH_PER_HOST),
                    rates.get(host.species, rates.get("default", 0.1))
                    * self.humidity.get(fields.region(host.x, host.z), 1.0))
                count = int(per_host)
                if uniform_at(key, 0) < per_host - count:
                    count += 1
                trunk = self.trunks.get(host.species)
                for member in range(count):
                    mkey = hash64(key, member + 1)
                    # Piecewise-linear percentile sample of the mined heights.
                    r = uniform_at(mkey, 0)
                    if r < 0.5:
                        height = p25 + (p50 - p25) * (r / 0.5)
                    else:
                        height = p50 + (p75 - p50) * ((r - 0.5) / 0.5)
                    hang_m = height * max(1.0, host.scale)
                    lo, hi = layer.scale_range
                    if trunk is not None:
                        # On the TRUNK: a random angle around the measured
                        # trunk axis (pivot + yaw-rotated base offset), a
                        # hair inside the bark so the mesh bites in, facing
                        # outward — never in the crown, never in mid-air.
                        s = host.scale
                        cy, sy = math.cos(host.yaw), math.sin(host.yaw)
                        ax = host.x + (trunk.x * cy + trunk.z * sy) * s
                        az = host.z + (-trunk.x * sy + trunk.z * cy) * s
                        phi = uniform_at(mkey, 1) * math.tau
                        radius = trunk.radius * 0.9 * s
                        px = ax + math.cos(phi) * radius
                        pz = az + math.sin(phi) * radius
                        # Clamp to the usable trunk, so nothing hangs above
                        # the tree it is supposed to be hanging from.
                        hang_m = min(hang_m,
                                     (trunk.base_y + trunk.height * 0.8) * s)
                        yaw = math.atan2(math.cos(phi), math.sin(phi))
                    else:
                        jitter = 0.5
                        px = host.x + (uniform_at(mkey, 1) * 2 - 1) * jitter
                        pz = host.z + (uniform_at(mkey, 2) * 2 - 1) * jitter
                        yaw = uniform_at(mkey, 3) * math.tau
                    spawned.append(Instance(
                        species=layer.species, tier=layer.tier,
                        x=px, z=pz,
                        # ABSOLUTE elevation: host ground + attach height,
                        # scaled with the host so big trees hang things higher.
                        y=fields.height(host.x, host.z) + hang_m,
                        yaw=yaw,
                        scale=lo + (hi - lo) * uniform_at(mkey, 4),
                        tilt_x=0.0, tilt_z=0.0,
                        anchor=ANCHOR_ATTACHED, sink=0.0,
                    ))
        return spawned

    # -- the whole post-scatter chain --------------------------------------

    def compose(self, instances: list[Instance],
                attachment_layers: list[Layer], fields: Fields, seed: int,
                area_ha: float, allowed: set[str]) -> tuple[list[Instance], dict]:
        """Run every pass in order; returns (instances, counts-for-report)."""
        self.finalise_anchors(instances, fields, seed)
        clumped = self.expand_clusters(instances, fields, seed, allowed)
        attached = self.spawn_attachments(
            instances + clumped, attachment_layers, fields, seed, area_ha)
        return instances + clumped + attached, {
            "clumpPieces": len(clumped), "attachments": len(attached)}
