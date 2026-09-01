"""The composition passes (rules C1–C5, composition.py) do what the mining
doc says: pivot sinking, attachment hosting, cluster clumps, water layering."""

import math

import pytest

from .composition import CLUSTER_MEAN_PIECES, CLUSTER_SINK_M, Composition
from .scatter import (
    ANCHOR_ATTACHED,
    ANCHOR_TERRAIN,
    ANCHOR_WATER_SURFACE,
    Fields,
    Instance,
    Layer,
    decode,
    encode,
)

TREE = "bmv:landscape/trees/cypress1"
WILLOW = "bmv:landscape/trees/treewillow01a"
CLUSTER = "bmv:landscape/trees/tropicalplant01"
FERN = "bmv:landscape/plants/fernlarge03"
VINES = "bmv:landscape/trees/hangingvines1"
ROOT = "bmv:architecture/phitt/ashlands/tramaroot01"
LILY = "bmv:landscape/trees/gkblillipad2"
KELP = "bmv:landscape/grass/waterkelptall01"


@pytest.fixture(scope="module")
def comp() -> Composition:
    return Composition.load()


def fields(depth=0.0, slope=0.0, height=5.0, region=7):
    return Fields(
        height=lambda x, z: height,
        water_depth=lambda x, z: depth,
        slope=lambda x, z: slope,
        region=lambda x, z: region,
    )


def inst(species, x=10.0, z=10.0, scale=1.0):
    return Instance(species=species, tier="T1", x=x, y=5.0, z=z,
                    yaw=0.0, scale=scale, tilt_x=0.0, tilt_z=0.0)


# --- classification and layer split ------------------------------------------


def test_classes_match_the_mined_json(comp):
    assert comp.klass(TREE) == "standalone"
    assert comp.klass(VINES) == "attachment"
    assert comp.klass(CLUSTER) == "cluster-part"
    assert comp.klass(LILY) == "water-surface"
    assert comp.klass(KELP) == "bed-anchored-aquatic"


def test_split_layers_pulls_attachments_and_compensates_cluster_density(comp):
    layers = [Layer(species=TREE, instances_per_hectare=10.0),
              Layer(species=VINES, instances_per_hectare=40.0),
              Layer(species=CLUSTER, instances_per_hectare=35.0)]
    scatter, attachments = comp.split_layers(layers)
    assert [l.species for l in attachments] == [VINES]
    assert [l.species for l in scatter] == [TREE, CLUSTER]
    assert scatter[1].instances_per_hectare == pytest.approx(
        35.0 / CLUSTER_MEAN_PIECES)


# --- C1/C2: pivot sink --------------------------------------------------------


def test_sink_is_deeper_on_slopes_and_capped(comp):
    flat = comp.sink_m(TREE, 0.0, rand=0.5)          # jitter factor = 1.0
    sloped = comp.sink_m(TREE, 25.0, rand=0.5)
    assert 0.3 < flat < 2.0                           # cypress mined p50 1.24
    assert sloped > flat
    assert comp.sink_m(TREE, 89.0, rand=0.5) <= 2.5   # class cap


def test_willow_snaps_to_terrain_not_bbox(comp):
    # treewillow01a: mined pivot offset p50 exactly 0 with 4 m of geometry
    # below the pivot — the sink must be ~0, never a bbox lift.
    assert comp.sink_m(WILLOW, 0.0, rand=0.5) == pytest.approx(0.0)


def test_finalise_anchors_sets_modes_and_water_surface_y(comp):
    pad, kelp, tree = inst(LILY), inst(KELP), inst(TREE)
    comp.finalise_anchors([pad, kelp, tree], fields(depth=1.5, height=5.0), seed=1)
    assert pad.anchor == ANCHOR_WATER_SURFACE
    assert pad.y == pytest.approx(6.5)                # ground + depth = surface
    assert pad.sink == 0.0
    assert kelp.anchor == ANCHOR_TERRAIN              # bed-anchored = terrain
    assert tree.anchor == ANCHOR_TERRAIN
    assert tree.sink > 0.0


# --- C4: cluster clumps -------------------------------------------------------


def test_cluster_expansion_makes_tight_sunk_mixed_clumps(comp):
    anchors = [inst(CLUSTER, x=50.0 + i * 30, z=50.0) for i in range(40)]
    allowed = {CLUSTER, FERN, "bmv:landscape/plants/esloebush08",
               "bmv:landscape/plants/braken",
               "bmv:landscape/plants/bigshrub2(colorful)"}
    extras = comp.expand_clusters(anchors, fields(), seed=7, allowed=allowed)
    assert len(extras) >= len(anchors)                # 1–4 extras each
    assert len(extras) <= 4 * len(anchors)
    for extra in extras:
        near = min(math.hypot(extra.x - a.x, extra.z - a.z) for a in anchors)
        assert near <= 2.0                            # members 0–2 m apart
        assert CLUSTER_SINK_M[0] <= extra.sink <= CLUSTER_SINK_M[1]
        assert extra.species in allowed
    assert {e.species for e in extras} - {CLUSTER}    # genuinely mixed


def test_standalone_species_are_not_clumped(comp):
    extras = comp.expand_clusters([inst(TREE)], fields(), seed=7, allowed={TREE})
    assert extras == []


# --- C3: attachments ----------------------------------------------------------


def test_attachments_hang_on_hosts_above_the_ground(comp):
    hosts = [inst(TREE, x=i * 20.0, z=30.0) for i in range(50)]
    for host in hosts:
        host.anchor = ANCHOR_TERRAIN
    layer = Layer(species=VINES, instances_per_hectare=40.0,
                  scale_range=(0.9, 1.6))
    spawned = comp.spawn_attachments(hosts, [layer], fields(height=5.0),
                                     seed=3, area_ha=1.0)
    assert spawned
    for vine in spawned:
        assert vine.anchor == ANCHOR_ATTACHED
        assert vine.species == VINES
        host = min(hosts, key=lambda h: math.hypot(vine.x - h.x, vine.z - h.z))
        # On the trunk bark, not the pivot: cypress1's measured base flare is
        # ~1.8 m radius, slightly off-pivot. Anything under ~2.5 m is on the
        # tree; the round-5 defect was hanging in air out to arbitrary crowns.
        assert math.hypot(vine.x - host.x, vine.z - host.z) <= 2.5
        assert 5.0 + 2.0 <= vine.y <= 5.0 + 7.0       # 2.5–6 m recommended band
    # ACCENT rate, not authored density: zero-precedent vines dress ~10 % of
    # eligible hosts (× the region-7 humidity multiplier), never most of them.
    assert 1 <= len(spawned) <= 15


def test_tramaroot_is_ground_anchored_not_hung(comp):
    """Owner ruling (Phase 10 round-4 feedback) overrides the mined rule.

    The sources hang tramaroots 3–10 m up a bush or cliff face; in our world
    that read as a big curved spiky root hovering in mid-air. The arch must
    always grow OUT OF the ground, so it is standalone with a terrain anchor
    — and it must never come back as an attachment.
    """
    hosts = [inst(CLUSTER, x=i * 15.0, z=10.0) for i in range(60)]
    layer = Layer(species=ROOT, instances_per_hectare=30.0)
    assert comp.klass(ROOT) == "standalone"
    assert comp.anchor_mode(ROOT) == ANCHOR_TERRAIN
    assert comp.spawn_attachments(hosts, [layer], fields(), seed=3,
                                  area_ha=1.0) == []
    # It stays in free scatter (an attachment-class layer would be split out),
    # and it sinks rather than floating.
    scatter, attachments = comp.split_layers([layer])
    assert [entry.species for entry in scatter] == [ROOT]
    assert attachments == []
    # Small on purpose: the pivot is at the arch centre, so terrain-anchoring
    # already half-buries it. A class-default sink would swallow it whole.
    assert 0.02 < comp.sink_m(ROOT, slope_deg=0.0, rand=0.5) < 0.3


def test_cliff_face_hosts_never_resolve_to_trees(comp):
    """`cliff-face` used to resolve to the tree host list, so anything the
    sources hung on rock was silently hung on trees instead."""
    assert "cliff-face" not in comp._hosts_for(VINES)
    for host in comp._hosts_for(VINES):
        assert "/trees/" in host


def test_attachments_cling_to_the_measured_trunk():
    """Round 6: with kit trunk data, a vine hangs ON the trunk surface — not
    in a ±0.5 m square around the model pivot, which for the willow (trunk
    axis ~7 m from its pivot) meant vines stuck to outer leaves and empty air
    (owner round-5 feedback). Pseudo-trees with no real trunk stop hosting."""
    from .composition import RULES_PATH, TrunkCapsule
    import json as _json
    trunks = {WILLOW: TrunkCapsule(x=6.4, z=-4.2, base_y=0.0,
                                   radius=0.5, height=22.0)}
    comp2 = Composition(_json.loads(RULES_PATH.read_text()), trunks)
    assert WILLOW in comp2.tree_hosts
    assert CLUSTER not in comp2.tree_hosts   # no measured trunk, no beard
    hosts = [inst(WILLOW, x=i * 30.0, z=50.0) for i in range(80)]
    layer = Layer(species=VINES, instances_per_hectare=40.0,
                  scale_range=(0.9, 1.6))
    spawned = comp2.spawn_attachments(hosts, [layer], fields(height=5.0),
                                      seed=3, area_ha=1.0)
    assert spawned
    for vine in spawned:
        host = min(hosts, key=lambda h: math.hypot(vine.x - h.x, vine.z - h.z))
        # yaw=0 hosts: the trunk axis sits at pivot + (6.4, -4.2), and the
        # vine sits a hair inside the bark (0.9 × radius) — exactly on the
        # circle, never at the pivot, never past the crown.
        axis_d = math.hypot(vine.x - (host.x + 6.4), vine.z - (host.z - 4.2))
        assert axis_d == pytest.approx(0.45, abs=1e-6)
        assert vine.y <= 5.0 + 0.8 * 22.0


def test_attachments_without_hosts_spawn_nothing(comp):
    layer = Layer(species=VINES, instances_per_hectare=40.0)
    assert comp.spawn_attachments([inst(LILY)], [layer], fields(),
                                  seed=3, area_ha=1.0) == []


# --- determinism and bundle v2 -----------------------------------------------


def test_compose_is_deterministic(comp):
    def run():
        instances = [inst(CLUSTER, x=40, z=40), inst(TREE, x=90, z=90),
                     inst(LILY, x=120, z=120)]
        layer = Layer(species=VINES, instances_per_hectare=60.0)
        out, counts = comp.compose(instances, [layer], fields(depth=0.5),
                                   seed=11, area_ha=1.0,
                                   allowed={CLUSTER, FERN, TREE, LILY, VINES})
        return encode(out, sorted({i.species for i in out})), counts
    a, ca = run()
    b, cb = run()
    assert a == b and ca == cb


def test_bundle_v2_roundtrips_anchor_and_sink():
    tree = inst(TREE)
    tree.sink = 1.25
    pad = inst(LILY)
    pad.anchor = ANCHOR_WATER_SURFACE
    pad.y = 6.5
    blob = encode([tree, pad], [TREE, LILY])
    groups = {g["index"]: g for g in decode(blob)}
    assert groups[0]["anchor"] == ANCHOR_TERRAIN
    assert groups[0]["instances"][0]["sink"] == pytest.approx(1.25, abs=0.02)
    assert groups[1]["anchor"] == ANCHOR_WATER_SURFACE
    assert groups[1]["instances"][0]["y"] == pytest.approx(6.5)
    assert groups[1]["instances"][0]["sink"] == 0.0
