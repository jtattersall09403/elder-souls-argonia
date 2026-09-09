"""Compile the authored route structures into placed kit pieces.

    cd tooling/world-generation
    python3 -m worldgen.compile_route_structures

Reads `world/sources/routes/route-structures.json` (authored by
`worldgen.author_route_structures` from the grader's measured over-cap
stretches), the route geometry and the graded heightfield, and lays real kit
pieces along each way's centreline between the structure's `fromM` and `toM`.

Writes:

  * `output/route-structures/<way-slug>.json` (gitignored) — placements with
    GenerationProvenance fields, in the shape `compile_settlement` emits.
  * `world/sources/sites/route-structures.md` (committed) — per way: the kind,
    the pieces placed, the total rise carried and the residual over-cap metres
    left after the structure.

Scope: this compiler produces PLACEMENTS (position, yaw, asset id). Rendering
the pieces in 3D is Round B's job; nothing here loads a mesh.

GEOMETRY RULES (measured, never inferred from a piece's name)
------------------------------------------------------------
Every piece's run, rise and width below is read off the built kit
(`tooling/asset-pipeline/output/kits/route-structures-v1.kit.json`,
`sizeM` / `originOffsetM`) and re-checked against it at load: rebuild the kit
with different geometry and this module fails rather than placing a piece that
no longer fits. Families never mix pieces from different authored sets
(CLAUDE.md: kits only combine pieces designed to combine).

Caps:
  * FLIGHT_MAX_DEG (35) — the steepest a masonry flight may be. A piece
    steeper than this is not a flight and the compiler refuses it.
  * LADDER_MAX_DEG (48) — lashed-timber companionway pieces (the stockade
    scaffold stair, the passerelle stair segment) are authored steeper than
    masonry on purpose; they are stepped, hand-over-rail climbs, and this is
    the cap that applies to them. Recorded separately so the masonry rule is
    never quietly relaxed.
  * RAMP_MAX_DEG (12) — a deck or span is a surface a cart crosses, so its
    end-to-end grade may not exceed this. A window steeper than that is a
    stair, and `author_route_structures._kind` must not have called it a deck.
"""

from __future__ import annotations

import json
import math
import os
import shutil
import tempfile
from pathlib import Path

import numpy as np

from .grade_routes import (FLAT_WIDTH_M, STRUCTURES_PATH, resample,
                          sample_bilinear, ways)
from .scale import RAW_M

SCHEMA_VERSION = 1
GENERATOR_ID = "worldgen.compile_route_structures"
GENERATOR_VERSION = 1

KIT = "route-structures-v1"
SPAN_KIT = "route-spans-v1"
_KIT_DIR = Path(__file__).resolve().parents[2] / "asset-pipeline" / "output" / "kits"
KIT_PATH = _KIT_DIR / f"{KIT}.kit.json"
SPAN_KIT_PATH = _KIT_DIR / f"{SPAN_KIT}.kit.json"
OUT_DIR = Path(__file__).resolve().parents[1] / "output" / "route-structures"
REPORT_PATH = (Path(__file__).resolve().parents[3] / "world" / "sources"
               / "sites" / "route-structures.md")
STUDIO_PATH = (Path(__file__).resolve().parents[3] / "apps" / "world-studio"
               / "public" / "province" / "route-structures.json")

FLIGHT_MAX_DEG = 35.0
LADDER_MAX_DEG = 48.0
RAMP_MAX_DEG = 12.0
SIZE_TOLERANCE_M = 0.15        # how far a piece may drift before we refuse it

# Family -> role -> piece. `runM` is the chainage a piece consumes along the
# way, `riseM` the height it carries, `widthM` the cross-way extent; each is a
# measured extent of the built asset, named in the comment beside it. `ladder`
# marks a lashed-timber climb (LADDER_MAX_DEG rather than FLIGHT_MAX_DEG).
FAMILIES: dict[str, dict] = {
    "stone-civic": {          # roads and trunk roads: Imperial engineering
        "culture": "imperial",
        # A crossing is one authored bridge where one fits, and the Nordic
        # viaduct where none does: the vanilla landscape bridges stop at
        # 52.188 m and nothing in the vault chains them.
        "span": {"monolith": "stone-arch", "chain": "nordic-viaduct"},
        "stair": {"asset": "vanilla:architecture/whiterun/wrterrain/wrcastlestairs01",
                  # sizeM [13.212, 18.652, 12.609]: run = y, rise = z, width = x
                  "runM": 18.652, "riseM": 12.609, "widthM": 13.212},
        "landing": {"asset": "vanilla:architecture/whiterun/wrterrain/wrstairsplatform01",
                    # sizeM [30.021, 29.632, 12.144]; the flight's own platform
                    "runM": 29.632, "riseM": 0.0, "widthM": 30.021},
        "deck": {"asset": "vanilla:architecture/whiterun/wrterrain/wrbridgestone01",
                 # sizeM [4.216, 4.047, 1.302]: a free-standing stone road span
                 "runM": 4.216, "riseM": 0.0, "widthM": 4.047},
    },
    "stone-rural": {          # the Imperial fringe's farm-terrace stone
        "culture": "imperial-fringe",
        "span": {"monolith": "stone-arch", "chain": "nordic-viaduct"},
        "stair": {"asset": "vanilla:architecture/farmhouse/stonewall/stonewallterracestairs01",
                  # sizeM [7.283, 8.232, 2.495]: run = y, rise = z -> 16.9 deg
                  "runM": 8.232, "riseM": 2.495, "widthM": 7.283},
        "landing": {"asset": "vanilla:architecture/farmhouse/stonewall/stonewallterrace01",
                    # sizeM [3.641, 8.265, 2.486]: the set's retaining terrace
                    "runM": 3.641, "riseM": 0.0, "widthM": 8.265},
        "deck": {"asset": "vanilla:architecture/farmhouse/stonewall/stonewallterracerampup01",
                 # sizeM [7.283, 8.497, 3.355]: the terrace's own ramp
                 "runM": 8.497, "riseM": 0.0, "widthM": 7.283},
    },
    "dunmer-stone": {         # the Dunmer north: Hlaalu Hammerfell masonry
        "culture": "dunmer",
        # The Hlaalu trgmbridge pieces stay as FLIGHT landings only: no plugin
        # in any mined set places two of them end to end, so there is no
        # authored evidence they may be chained into a crossing (they were
        # being chained, up to 29 deep). A Dunmer-north crossing is a stone
        # arch or a viaduct, like every other stone way.
        "span": {"monolith": "stone-arch", "chain": "nordic-viaduct"},
        "stair": {"asset": "hlaalu:hlaaluarchitecture/hammerfell/stairs01",
                  # sizeM [7.35, 6.064, 2.283]: run = y, rise = z -> 20.6 deg
                  "runM": 6.064, "riseM": 2.283, "widthM": 7.350},
        "landing": {"asset": "hlaalu:hlaaluarchitecture/hammerfell/trgmbridge01",
                    # sizeM [6.654, 3.03, 3.124]: the short span, same set,
                    # authored at the same deck height as the flights
                    "runM": 6.654, "riseM": 0.0, "widthM": 3.030},
        "deck": {"asset": "hlaalu:hlaaluarchitecture/hammerfell/trgmbridge02",
                 # sizeM [13.312, 3.11, 5.485]: the long span
                 "runM": 13.312, "riseM": 0.0, "widthM": 3.110},
    },
    "root-timber": {          # the Hist heartland: BM&V passerelle deck
        "culture": "argonian-root",
        "span": {"chain": "root-passerelle"},
        "ladder": True,
        "stair": {"asset": "bmv:architecture/citebosmer/passerelles/troncons/passesc128h64d01",
                  # 128-unit run / 64-unit rise at 0.014224 m per unit (the
                  # author's encoded contract), x extent 1.982 m confirms it
                  "runM": 1.821, "riseM": 0.910, "widthM": 3.081},
        "landing": {"asset": "bmv:architecture/citebosmer/passerelles/troncons/passl128d01",
                    # sizeM [1.982, 3.081, 3.031]: the flat 128-unit segment
                    "runM": 1.821, "riseM": 0.0, "widthM": 3.081},
        "deck": {"asset": "bmv:architecture/citebosmer/passerelles/troncons/passl256d01",
                 # sizeM [3.803, 3.081, 3.031]: the flat 256-unit segment
                 "runM": 3.641, "riseM": 0.0, "widthM": 3.081},
    },
    "scaffold-timber": {      # the pirate freeholds: lashed stockade scaffold
        "culture": "freehold",
        "span": {"chain": "stockade-trestle"},
        "ladder": True,
        "stair": {"asset": "vanilla:clutter/stockade/stockadescaffoldstairs01",
                  # sizeM [3.583, 3.457, 3.448]: run = y, rise = z -> 44.9 deg,
                  # a companionway, base-anchored (originOffsetM z = 0)
                  "runM": 3.457, "riseM": 3.448, "widthM": 3.583},
        "landing": {"asset": "vanilla:clutter/stockade/stockadescaffoldbridge01",
                    # sizeM [6.579, 3.798, 1.209]: the short scaffold deck
                    "runM": 6.579, "riseM": 0.0, "widthM": 3.798},
        "deck": {"asset": "vanilla:clutter/stockade/stockadescaffoldbridgenarrow",
                 # sizeM [12.041, 1.997, 1.543]: the long footpath-width deck
                 "runM": 12.041, "riseM": 0.0, "widthM": 1.997},
    },
}

# --------------------------------------------------------------------------
# SPAN SYSTEMS — the vocabulary a crossing needs, which the flight table above
# does not have: a deck carried ABOVE the ground on piers, an abutment that
# terminates the run, and a whole authored bridge that needs no chaining at all.
#
# Every offset here is the authors' own, mined into
# `world/sources/placement/kit-assemblies-mined.json`, with the template id and
# the number of times vanilla/BM&V placed it that way. Nothing is inferred from
# a piece's name and nothing is jammed together because it sounds compatible.
#
# ANCHORING is the concept the flight table lacked. A flight is placed by its
# FOOT: it stands on the ground. A viaduct deck, a pier and every one of the
# vanilla landscape bridges are placed by their DECK LINE — their pivot is the
# walking surface and the structure hangs below it (`nortmpextplattower01`
# carries 21.848 m of shaft under its pivot; the landscape bridges carry 14.373
# m of arch). Placed on the deck line they find their own springing and bury
# nothing; placed on the foot line they would float the road 14–22 m in the air.
# `anchor: "deck-line"` means EXACTLY that: do not subtract the piece's own
# height, the ground is not where this piece begins.
#
# NO EMBANKMENTS (owner ruling 2026-09-09): a span is additive geometry and
# changes no ground. The deck runs on the straight chord between the window's
# two ground endpoints, so it meets the road at both ends and the gap under it
# is bridged, never filled.
DECK_LINE, FOOT, MID_PIVOT = "deck-line", "foot", "mid-pivot"

# How far a whole authored bridge may be longer than the gap it is asked to
# cross before it stops being the honest answer. Overhang lands the arch's
# abutment on ground short of the gap, which is what an abutment is for; too
# much of it and the deck runs 14 m above open hillside at the ends.
MONOLITH_OVERHANG_MAX_M = 12.0
# A whole authored bridge has a flat deck. Laid at the higher of the crossing's
# two ends it buries nothing, but it meets the lower end this far above the
# road, and past this the step is a wall rather than an abutment.
MONOLITH_END_STEP_MAX_M = 2.0
# A pier is only placed where the deck is clear of the ground by more than the
# deck's OWN thickness — below that the deck module's underside is already on
# the ground and a 26.8 m tower would be entirely buried under it. Each system
# names its deck's measured thickness; this is the floor under all of them.
PIER_MIN_DROP_M = 0.4

SPAN_SYSTEMS: dict[str, dict] = {
    # Whole vanilla landscape bridges: arch, piers, abutments and parapet all
    # modelled in. `bridgeshort01`/`bridgenarrow01` are the same 23.435 m span
    # at two widths. NOTHING here chains — no source plugin ever placed two of
    # them end to end — so this system is one piece per crossing or nothing.
    "stone-arch": {
        "authoredSet": "vanilla:landscape/bridges",
        "monoliths": [
            {"asset": "vanilla:landscape/bridges/bridgenarrow01",
             "runM": 23.435, "widthM": 4.832, "anchor": DECK_LINE},
            {"asset": "vanilla:landscape/bridges/bridgeshort01",
             "runM": 23.435, "widthM": 7.451, "anchor": DECK_LINE},
            {"asset": "vanilla:landscape/bridges/bridge01",
             "runM": 42.084, "widthM": 9.133, "anchor": DECK_LINE},
            {"asset": "vanilla:landscape/bridges/bridgelong01",
             "runM": 52.188, "widthM": 9.133, "anchor": DECK_LINE},
        ],
    },
    # The Nordic temple-exterior platform tower: the only deck+pier system in
    # the vault whose deck-to-deck AND deck-to-pier joins are both mined.
    "nordic-viaduct": {
        "authoredSet": "vanilla:dungeons/nordic/exterior",
        "deck": {"asset": "vanilla:dungeons/nordic/exterior/nortmpextplattowerbridge01",
                 # sizeM [2.873, 5.462, 1.479]; self-chains at 5.46 m
                 "runM": 5.462, "widthM": 2.873, "anchor": DECK_LINE,
                 "thicknessM": 1.479,
                 "connector": "vanilla:t0029", "connectorCount": 25},
        "pier": {"asset": "vanilla:dungeons/nordic/exterior/nortmpextplattower01",
                 # sizeM [3.475, 5.047, 26.825], originOffsetM z 21.848 — the
                 # pivot IS the deck level, 21.85 m of shaft below it
                 "runM": 5.047, "widthM": 3.475, "anchor": DECK_LINE,
                 "dropM": 21.848, "everyM": 5.462,
                 "connector": "vanilla:t0038", "connectorCount": 22},
        "abutment": {"asset": "vanilla:dungeons/nordic/exterior/nortmpextplattowerbridgeendcap01",
                     # sizeM [2.788, 0.963, 1.366]; the deck's own 2.79 m width
                     "runM": 0.963, "widthM": 2.788, "anchor": DECK_LINE},
    },
    # The lashed stockade scaffold. The ONE family in which every join,
    # parapet included, is proven from vanilla's own templates.
    "stockade-trestle": {
        "authoredSet": "vanilla:clutter/stockade",
        "deck": {"asset": "vanilla:clutter/stockade/stockadescaffoldtop2sided01",
                 # sizeM [3.535, 3.739, 0.957]: a railed plate, rail 0.679 m
                 # over the 0.278 m plate. Plates tile at 3.64 m (t0100, n=14).
                 "runM": 3.641, "widthM": 3.535, "anchor": DECK_LINE,
                 "thicknessM": 0.278,
                 "connector": "vanilla:t0100", "connectorCount": 14},
        "pier": {"asset": "vanilla:clutter/stockade/stockadescaffoldbase4sided01",
                 # sizeM [3.704, 3.843, 2.731], originOffsetM z 0 — foot-
                 # anchored and stacked in 2.731 m storeys (t0019, n=28); the
                 # plate goes on the top storey at +2.73 m (t0230, n=9).
                 "runM": 3.843, "widthM": 3.704, "anchor": FOOT,
                 "storeyM": 2.731, "everyM": 3.641,
                 "connector": "vanilla:t0230", "connectorCount": 9},
        "abutment": {"asset": "vanilla:clutter/stockade/stockadescaffoldtop0sided01",
                     # sizeM [3.535, 3.739, 0.278]: the plain plate, the piece
                     # the run ends on where the deck meets the ground
                     "runM": 3.739, "widthM": 3.535, "anchor": DECK_LINE},
    },
    # The BM&V Bosmer passerelle, which carries its own posts: an authored
    # walkway chain (passl128 self-chained n=188), no separate pier.
    "root-passerelle": {
        "authoredSet": "bmv:architecture/citebosmer/passerelles",
        # Both pieces have their pivot at mid-height (originOffsetM z 1.516 of
        # a 3.031 m piece), so neither the deck line nor the foot is the pivot:
        # the walk is 1.515 m above it (the piece's own top) and the posts run
        # 1.516 m below. The posts are the support, so this system needs no
        # separate pier — but they are only 1.516 m long, and a deck further
        # than that above the ground is reported, never floated.
        "deck": {"asset": "bmv:architecture/citebosmer/passerelles/troncons/passl256d01",
                 # sizeM [3.803, 3.081, 3.031]; run is the author's 256-unit
                 # contract at 0.014224 m/unit = 3.641 m
                 "runM": 3.641, "widthM": 3.081, "anchor": MID_PIVOT,
                 "deckOffsetM": 1.515, "dropM": 1.516,
                 "connector": "bmv-valenwood:t0113", "connectorCount": 154},
        "abutment": {"asset": "bmv:architecture/citebosmer/passerelles/troncons/passl128d01",
                     # sizeM [1.982, 3.081, 3.031]; the 128-unit segment
                     "runM": 1.821, "widthM": 3.081, "anchor": MID_PIVOT,
                     "deckOffsetM": 1.515, "dropM": 1.516},
    },
}

# The piece each structure kind chains, by role.
KIND_ROLE = {"stair": "stair", "stepped-ascent": "stair",
             "deck": "deck", "bridge": "deck", "lip-step": "landing"}

# The kinds that lay a level surface a cart crosses, and so answer to
# RAMP_MAX_DEG rather than to a flight cap.
RAMP_KINDS = frozenset({"deck", "bridge", "lip-step"})

# The kinds that CROSS a gap and so go through the span systems rather than
# tiling a flight piece along the ground. `lip-step` is deliberately not one:
# it is a single step over a terrace lip, not a crossing, and a 23 m stone
# bridge is the wrong answer to a 2 m rise.
SPAN_KINDS = frozenset({"deck", "bridge"})


# --------------------------------------------------------------------------
# kit validation
# --------------------------------------------------------------------------
def load_kit(path: Path | None = None) -> dict:
    """Both built kits in one lookup.

    A FAMILY still never mixes authored sets — that rule lives in the tables
    below and in `validate` — but the pieces of one authored set are split
    across two kit FILES (the flights are in route-structures-v1, the span
    systems in route-spans-v1), so the manifest lookup spans both.
    """
    if path is not None:
        return {a["id"]: a for a in json.loads(path.read_text())["assets"]}
    out: dict = {}
    for p in (KIT_PATH, SPAN_KIT_PATH):
        if p.exists():
            out.update({a["id"]: a for a in json.loads(p.read_text())["assets"]})
    return out


def validate(kit: dict, families: dict | None = None) -> None:
    """Refuse a family whose pieces no longer measure what the table claims, or
    whose flight is steeper than its cap."""
    for fam, spec in (families or FAMILIES).items():
        cap = LADDER_MAX_DEG if spec.get("ladder") else FLIGHT_MAX_DEG
        for role, piece in spec.items():
            if role == "span" or not isinstance(piece, dict):
                continue
            asset = kit.get(piece["asset"])
            if asset is None:
                raise ValueError(f"{fam}/{role}: {piece['asset']} is not in kit {KIT}")
            extents = [round(v, 3) for v in asset["sizeM"]]
            for key in ("runM", "widthM"):
                if not any(abs(piece[key] - e) <= SIZE_TOLERANCE_M for e in extents) \
                        and not (key == "runM" and spec.get("ladder")):
                    raise ValueError(
                        f"{fam}/{role}: {key}={piece[key]} is no longer an extent of "
                        f"{piece['asset']} (sizeM {extents}); re-measure the kit")
            if piece["riseM"] > 0.0:
                # Built manifests are [x, plan-y, vertical-z].  Checking rise
                # against "any extent" let a horizontal width accidentally
                # certify a flight.  A tread-to-tread rise may be smaller than
                # the full vertical bbox (the root passerelle includes its
                # supporting posts), but it can never exceed it.
                vertical_m = extents[2]
                if piece["riseM"] > vertical_m + SIZE_TOLERANCE_M:
                    raise ValueError(
                        f"{fam}/{role}: riseM={piece['riseM']} exceeds the vertical z bbox "
                        f"{vertical_m} m of {piece['asset']} (sizeM {extents}); the x/y plan "
                        f"extents cannot certify a climb")
                deg = math.degrees(math.atan(piece["riseM"] / piece["runM"]))
                if deg > cap + 1e-6:
                    raise ValueError(
                        f"{fam}/{role}: {piece['asset']} climbs {deg:.1f} deg, over the "
                        f"{cap:.0f} deg cap for this family — it is not a walkable flight")
    validate_spans(kit, families or FAMILIES)


def validate_spans(kit: dict, families: dict | None = None,
                   systems: dict | None = None) -> None:
    """Hold the invariants the span vocabulary adds.

    A family that carries a way over a gap must SAY how, and a span system must
    be complete: a deck with nothing to terminate it leaves a slab hanging in
    the air, which is the defect this whole kit exists to fix. Anchoring is
    checked too — a `deck-line` piece whose manifest says its pivot is at its
    own foot would be placed 22 m too high.

    MUTATION: delete the abutment requirement and a chain system can ship a run
    that ends in mid-air with nothing failing.
    """
    systems = SPAN_SYSTEMS if systems is None else systems
    for fam, spec in (FAMILIES if families is None else families).items():
        span = spec.get("span")
        if not span:
            raise ValueError(
                f"{fam}: no `span` block. Every family must say how it carries a "
                f"way over a gap; without one the compiler falls back to tiling a "
                f"flight piece across open air, which is the defect route-spans-v1 "
                f"was built to end")
        for key in ("monolith", "chain"):
            name = span.get(key)
            if name is None:
                continue
            if name not in systems:
                raise ValueError(f"{fam}/{key}: unknown span system {name!r}")
        if not span.get("chain"):
            raise ValueError(
                f"{fam}: names no chain system, so a gap longer than its longest "
                f"whole bridge could not be crossed at all")
    for name, sysspec in systems.items():
        monos = sysspec.get("monoliths") or []
        pieces = [p for p in (sysspec.get(r) for r in ("deck", "pier", "abutment"))
                  if p] + monos
        if not pieces:
            raise ValueError(f"span system {name}: no pieces")
        if sysspec.get("deck") and not sysspec.get("abutment"):
            raise ValueError(
                f"span system {name}: declares a repeating deck but no abutment. "
                f"A chained deck must be terminated at both ends or the run stops "
                f"in mid-air")
        if monos and (sysspec.get("deck") or sysspec.get("pier")):
            raise ValueError(
                f"span system {name}: mixes whole authored bridges with a chained "
                f"deck. No plugin places a landscape bridge against a viaduct deck; "
                f"a system is one or the other")
        runs = [m["runM"] for m in monos]
        if runs != sorted(runs):
            raise ValueError(f"span system {name}: monoliths must be listed by "
                             f"ascending runM so the smallest that fits is chosen")
        for p in pieces:
            asset = kit.get(p["asset"])
            if asset is None:
                raise ValueError(f"span system {name}: {p['asset']} is not in "
                                 f"{KIT} or {SPAN_KIT}")
            extents = [round(v, 3) for v in asset["sizeM"]]
            if not any(abs(p["widthM"] - e) <= SIZE_TOLERANCE_M for e in extents):
                raise ValueError(
                    f"span system {name}: widthM={p['widthM']} is no longer an "
                    f"extent of {p['asset']} (sizeM {extents}); re-measure the kit")
            if p["anchor"] not in (DECK_LINE, FOOT, MID_PIVOT):
                raise ValueError(f"span system {name}: unknown anchor {p['anchor']!r}")
            off = asset.get("originOffsetM")
            if off is None:
                continue
            vertical_pivot = round(float(off[2]), 3)
            if p["anchor"] == MID_PIVOT:
                # A piece whose pivot is neither its walking surface nor its
                # foot must state, in measured metres, where each of those is.
                for key in ("deckOffsetM", "dropM"):
                    if key not in p:
                        raise ValueError(
                            f"span system {name}: {p['asset']} is {MID_PIVOT!r} "
                            f"anchored and must declare {key}")
                if p["deckOffsetM"] > extents[2] + SIZE_TOLERANCE_M:
                    raise ValueError(
                        f"span system {name}: deckOffsetM={p['deckOffsetM']} is "
                        f"taller than the {extents[2]} m piece {p['asset']}")
                if abs(p["dropM"] - vertical_pivot) > SIZE_TOLERANCE_M:
                    raise ValueError(
                        f"span system {name}: dropM={p['dropM']} does not match the "
                        f"{vertical_pivot} m the manifest measures below "
                        f"{p['asset']}'s pivot")
                continue
            if p["anchor"] == DECK_LINE and vertical_pivot < 0.2 * extents[2] - 1e-6:
                raise ValueError(
                    f"span system {name}: {p['asset']} is anchored {DECK_LINE!r} but "
                    f"its pivot sits {vertical_pivot} m up a {extents[2]} m piece — "
                    f"that is a foot-anchored piece and placing it on the deck line "
                    f"would bury it")
            if p["anchor"] == FOOT and vertical_pivot > 0.2 * extents[2] + 1e-6:
                raise ValueError(
                    f"span system {name}: {p['asset']} is anchored {FOOT!r} but its "
                    f"pivot is {vertical_pivot} m up a {extents[2]} m piece — placed "
                    f"on the ground it would float")
            drop = p.get("dropM")
            if drop is not None and abs(drop - vertical_pivot) > SIZE_TOLERANCE_M:
                raise ValueError(
                    f"span system {name}: pier dropM={drop} does not match the "
                    f"{vertical_pivot} m of shaft the manifest measures below "
                    f"{p['asset']}'s pivot")


# --------------------------------------------------------------------------
# placement
# --------------------------------------------------------------------------
def _profile(way: dict, heights: np.ndarray):
    """(chainage m, world x m, world z m, ground height m) along the centreline."""
    pts = resample(way["px"])
    ds = np.maximum(np.hypot(*np.diff(pts, axis=0).T) * RAW_M, 1e-6)
    chain = np.concatenate([[0.0], np.cumsum(ds)])
    z = sample_bilinear(heights, pts[:, 0], pts[:, 1])
    return chain, pts[:, 0] * RAW_M, pts[:, 1] * RAW_M, z


def _at(chain, xs, zs, hs, c: float):
    """World position and ground height at chainage `c` (linear)."""
    return (float(np.interp(c, chain, xs)), float(np.interp(c, chain, zs)),
            float(np.interp(c, chain, hs)))


def _yaw_deg(chain, xs, zs, c: float, run: float) -> float:
    """Heading of the centreline at `c`, degrees. 0 = +X (east), increasing
    towards +Z (south) — the studio/world convention (module 00-core §8)."""
    x0, z0, _ = _at(chain, xs, zs, zs, max(c - run * 0.5, float(chain[0])))
    x1, z1, _ = _at(chain, xs, zs, zs, min(c + run * 0.5, float(chain[-1])))
    return round(math.degrees(math.atan2(z1 - z0, x1 - x0)), 2)


def measure_window(chain: np.ndarray, hs: np.ndarray,
                   from_m: float, to_m: float) -> dict:
    """THE measurement of a structure window. One function, both modules.

    `author_route_structures._kind` chooses the piece from a window's shape and
    this module refuses a piece the shape cannot carry. When the two measured
    the same window separately they disagreed — the author read a raw stored
    `toM` and a rise taken on a different heightfield, the compiler clipped
    `toM` to the current route end and read the rise on the current ground — so
    the author emitted lip-steps the compiler then correctly refused (four of
    them, 2026-09-09, one at 12.2 deg over a 12 deg cap). Both callers now take
    the span, the rise and the grade from here, so a kind the author approves is
    a kind this module can build.

    `toM` is clipped to the route's current end: chainage past the end does not
    name ground. Heights are interpolated at the exact endpoints, never snapped
    to the nearest route sample.
    """
    end = float(chain[-1])
    a = float(from_m)
    b = min(float(to_m), end)
    span = max(b - a, 0.0)
    rise = float(np.interp(b, chain, hs)) - float(np.interp(a, chain, hs))
    grade = math.degrees(math.atan(abs(rise) / max(span, 1e-6)))
    return {"fromM": a, "toM": b, "spanM": span, "riseM": rise,
            "gradeDeg": grade, "routeEndM": end}


def ramp_ok(kind: str, grade_deg: float) -> bool:
    """Whether a level-surface kind may sit on this grade (RAMP_MAX_DEG)."""
    return kind not in RAMP_KINDS or grade_deg <= RAMP_MAX_DEG + 1e-6


def _piece_y(piece: dict, deck_y: float) -> float:
    """Where a piece's PIVOT goes so its walking surface lands on `deck_y`."""
    if piece["anchor"] == DECK_LINE:
        return deck_y
    if piece["anchor"] == FOOT:
        return deck_y - piece.get("deckOffsetM", 0.0)
    return deck_y - piece["deckOffsetM"]


def _piece_bottom(piece: dict, deck_y: float) -> float:
    """The lowest point of the piece once placed — what must reach the ground."""
    return _piece_y(piece, deck_y) - piece.get("dropM", 0.0)


def deck_profile(chain: np.ndarray, hs: np.ndarray, a: float, b: float,
                 sample_m: float = 2.0) -> tuple[np.ndarray, np.ndarray]:
    """The deck line of a crossing: a taut string from (a, ground) to (b, ground)
    lying ON OR ABOVE the ground the whole way.

    This is the upper convex hull of the ground profile inside the window, and
    it is the one profile that satisfies all three of the rules a span must
    obey at once. It meets the road at both ends (the endpoints are on the
    ground); it never dips into the terrain (a straight chord does — measured
    2026-09-09: on the shipped windows a chord buried the deck up to 8.25 m,
    because an over-cap stretch is not a clean void and the hummocks inside it
    rise above the line between its ends); and it moves no ground, which the
    owner's no-embankment ruling requires. Its kinks are where the piers want
    to be, exactly as a real viaduct is laid out.
    """
    n = max(int(math.ceil((b - a) / sample_m)) + 1, 2)
    cs = np.linspace(a, b, n)
    ys = np.interp(cs, chain, hs)
    # Monotone-chain upper hull over (cs, ys), endpoints always kept.
    hull: list[int] = []
    for i in range(n):
        while len(hull) >= 2:
            i0, i1 = hull[-2], hull[-1]
            cross = ((cs[i1] - cs[i0]) * (ys[i] - ys[i0])
                     - (ys[i1] - ys[i0]) * (cs[i] - cs[i0]))
            if cross > 0:            # i1 is below the line i0->i: drop it
                hull.pop()
            else:
                break
        hull.append(i)
    return cs[hull], ys[hull]


def choose_monolith(system: dict, span_m: float, need_width_m: float) -> dict | None:
    """The smallest whole authored bridge that covers this gap at this width.

    THE MONOLITH RULE (decision 0049). A crossing that one authored piece spans
    is built as that piece: `bridgelong01` carries its own arch, piers,
    abutments and parapet, and no chain of deck modules will ever look like a
    bridge. So: take the SMALLEST monolith whose run covers the gap and whose
    deck is at least as wide as the way's running surface, provided it overhangs
    the gap by no more than MONOLITH_OVERHANG_MAX_M. Past that the bridge's ends
    would sit 14 m above open hillside, and the honest answer is a viaduct that
    puts piers on the ground it actually crosses.
    """
    for m in system.get("monoliths") or []:
        if m["runM"] + 1e-6 < span_m:
            continue
        if m["widthM"] + 1e-6 < need_width_m:
            continue
        if m["runM"] - span_m > MONOLITH_OVERHANG_MAX_M:
            break                     # ascending, so nothing longer fits either
        return m
    return None


def compile_span(st: dict, fam: dict, chain, xs, zs, hs, m: dict,
                 need_width_m: float) -> tuple[list[dict], dict]:
    """Build one crossing: a whole bridge if one fits, otherwise a viaduct.

    The deck runs on the straight chord between the window's two GROUND
    endpoints, so it meets the road at both ends and changes no terrain (owner
    ruling 2026-09-09: no embankments — a span is additive geometry).

    Returns the placements and a measured `spanFacts` block: how far each end of
    the deck is from the ground it lands on (0 = neither floating nor buried),
    and for every pier whether its shaft reaches the ground under it.
    """
    span_spec = fam["span"]
    a, b, span = m["fromM"], m["toM"], m["spanM"]
    ya = float(np.interp(a, chain, hs))
    yb = float(np.interp(b, chain, hs))
    hull_c, hull_y = deck_profile(chain, hs, a, b)

    def deck_y(c: float) -> float:
        return float(np.interp(c, hull_c, hull_y))

    placements: list[dict] = []
    facts = {"spanM": round(span, 2), "endDropM": [0.0, 0.0]}

    def emit(piece: dict, role: str, c: float, run: float, y: float,
             surface: float | None = None, extra: dict | None = None) -> None:
        x, z, _ = _at(chain, xs, zs, hs, c)
        p = {
            "id": f"{st['id']}.p{len(placements) + 1}",
            "assetId": piece["asset"],
            "role": role,
            "posM": [round(x, 3), round(y, 3), round(z, 3)],
            "yawDeg": _yaw_deg(chain, xs, zs, min(c + run * 0.5, b), max(run, 1.0)),
            "fromM": round(c, 2), "toM": round(min(c + run, b), 2),
            "anchor": piece["anchor"],
            # The walking surface this piece carries, in world metres. Written
            # so the proof "the deck meets the road and floats nowhere" is a
            # subtraction anyone can redo against the heightfield, rather than a
            # claim about a pivot that may sit anywhere inside the mesh.
            "deckSurfaceM": round(surface if surface is not None else y, 3),
            "provenance": {
                "sourceStructureId": st["id"], "sourceWayId": st["wayId"],
                "generatorId": GENERATOR_ID, "generatorVersion": GENERATOR_VERSION,
                "seed": st["id"],
                "ruleId": f"route-span/{st['kind']}/{st['family']}/{role}",
                "assetId": piece["asset"], "sourceDataHashes": [],
            },
        }
        if extra:
            p.update(extra)
        placements.append(p)

    mono_system = SPAN_SYSTEMS.get(span_spec.get("monolith") or "", {})
    mono = choose_monolith(mono_system, span, need_width_m)
    if mono is not None:
        # A whole authored bridge has a FLAT deck, so it can only be used where
        # a level deck meeting both ends clears the ground the whole way. Where
        # the ground humps up inside the window, a flat bridge would be buried
        # in it and the chained viaduct — which follows the taut profile — is
        # the honest answer.
        level_flat = max(ya, yb)
        if float(np.max(hull_y)) > level_flat + 0.05:
            mono = None
        elif abs(yb - ya) > MONOLITH_END_STEP_MAX_M:
            mono = None
    if mono is not None:
        # One authored bridge, placed at the mid-point of the gap on the mean
        # of the two ground endpoints, its arch finding its own springing.
        c = 0.5 * (a + b)
        level = level_flat
        emit(mono, "bridge", c - 0.5 * mono["runM"], mono["runM"],
             _piece_y(mono, level), level)
        facts.update({"system": span_spec["monolith"], "arrangement": "monolith",
                      "pieceRunM": mono["runM"], "pieceWidthM": mono["widthM"],
                      "overhangM": round(mono["runM"] - span, 2),
                      "piers": 0, "piersShort": 0,
                      # A flat deck laid at the higher of the two ends buries
                      # nothing, but it meets the lower end this far up. The
                      # step is measured, never hidden.
                      "endStepM": round(abs(yb - ya), 2)})
        return placements, facts

    system = SPAN_SYSTEMS[span_spec["chain"]]
    deck, abut = system["deck"], system["abutment"]
    pier = system.get("pier")
    emit(abut, "abutment", a, abut["runM"], _piece_y(abut, ya), ya)
    c = a + abut["runM"]
    deck_end = b - abut["runM"]
    n_deck = 0
    while c < deck_end - 0.05 and n_deck < 400:
        emit(deck, "deck", c, deck["runM"], _piece_y(deck, deck_y(c)), deck_y(c))
        c += deck["runM"]
        n_deck += 1
    emit(abut, "abutment", deck_end, abut["runM"], _piece_y(abut, yb), yb)

    piers = short = 0
    if pier is not None:
        pc = a + pier["everyM"]
        min_drop = max(PIER_MIN_DROP_M, deck.get("thicknessM", 0.0))
        while pc < deck_end - 0.05:
            dy = deck_y(pc)
            _, _, ground = _at(chain, xs, zs, hs, pc)
            drop = dy - ground
            if drop > min_drop:
                if pier["anchor"] == FOOT:
                    # A stacked trestle. The storeys are whole 2.731 m modules
                    # and the ground is not, so the stack is built DOWNWARD from
                    # the deck: the top storey's head is exactly at the deck
                    # line and the bottom storey ends up to one storey below the
                    # ground. Buried is right — that is a foundation — whereas
                    # stacking upward from the ground leaves the plate floating
                    # by whatever the drop is not a multiple of.
                    storey = pier["storeyM"]
                    n = max(int(math.ceil(drop / storey - 1e-6)), 1)
                    for k in range(n):
                        emit(pier, "pier", pc, pier["runM"],
                             dy - (k + 1) * storey, dy,
                             {"storey": k + 1, "storeysM": round(n * storey, 2)})
                    piers += 1
                    bottom = dy - n * storey
                    facts["maxBuriedM"] = round(
                        max(facts.get("maxBuriedM", 0.0), ground - bottom), 2)
                    if bottom > ground + 0.05:
                        short += 1
                else:
                    emit(pier, "pier", pc, pier["runM"], _piece_y(pier, dy), dy,
                         {"shaftBottomM": round(_piece_bottom(pier, dy), 2),
                          "groundM": round(ground, 2)})
                    piers += 1
                    if _piece_bottom(pier, dy) > ground + 0.05:
                        short += 1
            pc += pier["everyM"]
    elif deck.get("dropM"):
        # A self-supporting deck: its own posts are the only support, so a deck
        # further above the ground than the posts are long is a finding.
        worst = 0.0
        cc = a
        while cc < b:
            _, _, g = _at(chain, xs, zs, hs, cc)
            worst = max(worst, deck_y(cc) - g - deck["dropM"])
            cc += deck["runM"]
        facts["postShortfallM"] = round(max(worst, 0.0), 2)

    facts.update({"system": span_spec["chain"], "arrangement": "chain",
                  "decks": n_deck, "piers": piers, "piersShort": short})
    return placements, facts


def compile_structure(st: dict, way: dict, heights: np.ndarray,
                      kit: dict) -> tuple[list[dict], dict]:
    """Placements for one structure, plus its summary row."""
    fam = FAMILIES[st["family"]]
    role = KIND_ROLE[st["kind"]]
    piece, landing = fam[role], fam["landing"]
    chain, xs, zs, hs = _profile(way, heights)
    m = measure_window(chain, hs, st["fromM"], st["toM"])
    a, b, span, rise = m["fromM"], m["toM"], m["spanM"], m["riseM"]
    if span <= 0.05:
        raise ValueError(
            f"{st['id']}: authored window {a:.2f}-{float(st['toM']):.2f} m "
            f"does not overlap the current {m['routeEndM']:.2f} m route; "
            "re-run author_route_structures against the current route geometry"
        )

    corrected = None
    if not ramp_ok(st["kind"], m["gradeDeg"]):
        # The author measures between the two grading passes and this compiler
        # measures after the second, so a window's ground CAN move between them
        # even though pass 2 leaves the inside of a window alone: its endpoints
        # sample the shoulder the second pass benched. Refusing to build was the
        # right instinct while the two modules measured differently, but they no
        # longer do — `ramp_ok` is one rule and this measurement is the
        # authoritative one, so the honest act is to build what the ground can
        # carry and SAY SO, rather than stop the chain on a piece nobody chose
        # deliberately. A ramp that cannot be a ramp is a flight; the record is
        # rewritten by the next author pass, and the correction is reported so
        # the drift stays visible rather than becoming a quiet fixup.
        corrected = {"id": st["id"], "wayId": st["wayId"], "was": st["kind"],
                     "now": "stepped-ascent", "gradeDeg": round(m["gradeDeg"], 1),
                     "recordRiseM": round(float(st.get("riseM", 0.0)), 2),
                     "groundRiseM": round(rise, 2)}
        st = dict(st, kind="stepped-ascent")
        role = KIND_ROLE[st["kind"]]
        piece, landing = fam[role], fam["landing"]

    if st["kind"] in SPAN_KINDS:
        placements, facts = compile_span(st, fam, chain, xs, zs, hs, m,
                                         FLAT_WIDTH_M.get(way["kind"], 3.6))
        row = {"structureId": st["id"], "wayId": st["wayId"], "kind": st["kind"],
               "family": st["family"], "pieces": len(placements),
               "spanM": round(span, 1), "riseM": round(rise, 2),
               "fromM": round(a, 2), "toM": round(b, 2), "span": facts}
        if corrected is not None:
            row["kindCorrected"] = corrected
        return placements, row

    placements: list[dict] = []
    c = a
    n = 0
    while c < b - 0.05 and n < 400:
        run = piece["runM"]
        use = piece
        if piece["riseM"] > 0.0:
            # A landing goes in wherever the ground over the next run is flatter
            # than the flight itself: a stair laid there would leave a step at
            # its foot instead of meeting the ground.
            _, _, h0 = _at(chain, xs, zs, hs, c)
            _, _, h1 = _at(chain, xs, zs, hs, min(c + run, b))
            if abs(h1 - h0) < 0.5 * piece["riseM"]:
                use, run = landing, landing["runM"]
        x, z, h = _at(chain, xs, zs, hs, c)
        placements.append({
            "id": f"{st['id']}.p{n + 1}",
            "assetId": use["asset"],
            "role": "landing" if use is landing and use is not piece else role,
            "posM": [round(x, 3), round(h, 3), round(z, 3)],
            "yawDeg": _yaw_deg(chain, xs, zs, min(c + run * 0.5, b), run),
            "fromM": round(c, 2), "toM": round(min(c + run, b), 2),
            "provenance": {
                "sourceStructureId": st["id"],
                "sourceWayId": st["wayId"],
                "generatorId": GENERATOR_ID,
                "generatorVersion": GENERATOR_VERSION,
                "seed": st["id"],
                "ruleId": f"route-structure/{st['kind']}/{st['family']}",
                "assetId": use["asset"],
                "sourceDataHashes": [],
            },
        })
        c += run
        n += 1
    row = {"structureId": st["id"], "wayId": st["wayId"], "kind": st["kind"],
           "family": st["family"], "pieces": len(placements),
           "spanM": round(span, 1), "riseM": round(rise, 2),
           "fromM": round(a, 2), "toM": round(b, 2)}
    if corrected is not None:
        row["kindCorrected"] = corrected
    return placements, row


def compile_all(structures: list[dict], ways_by_id: dict, heights: np.ndarray,
                kit: dict) -> tuple[dict[str, dict], list[dict]]:
    by_way: dict[str, dict] = {}
    rows: list[dict] = []
    familyless: list[str] = []
    for st in sorted(structures, key=lambda s: s["id"]):
        # `author_route_structures` emits a survivor whose region has no family
        # anyway, because the grader needs the exclusion window or its second
        # pass cuts the hillside away. Nobody has said who builds there, so
        # there is no kit to lay and nothing to compile — this used to be a bare
        # KeyError: None. The debt is gated by
        # test_route_structure_authoring.test_no_shipped_route_structure_is_unauthored.
        if not st.get("family"):
            familyless.append(st["id"])
            continue
        way = ways_by_id[st["wayId"]]
        placements, row = compile_structure(st, way, heights, kit)
        doc = by_way.setdefault(st["wayId"], {
            "schemaVersion": SCHEMA_VERSION, "wayId": st["wayId"], "kit": KIT,
            "generator": {"id": GENERATOR_ID, "version": GENERATOR_VERSION},
            "structures": [], "placements": []})
        doc["structures"].append({k: v for k, v in st.items()})
        doc["placements"].extend(placements)
        rows.append(row)
    corrections = [r["kindCorrected"] for r in rows if r.get("kindCorrected")]
    if corrections:
        print(f"[route-structures] {len(corrections)} structure(s) could not carry "
              f"the piece the author chose on the ground this compile measures, and "
              f"were built as a flight instead — the author runs between the two "
              f"grading passes and this compiler after the second:")
        for c in corrections:
            print(f"    {c['id']} ({c['wayId']}): {c['was']} -> {c['now']}, "
                  f"{c['gradeDeg']} deg; record rise {c['recordRiseM']} m, "
                  f"ground rise {c['groundRiseM']} m")
    if familyless:
        print(f"[route-structures] {len(familyless)} authored structures name no "
              f"family and cannot be built: {', '.join(sorted(familyless)[:6])}"
              f"{' …' if len(familyless) > 6 else ''}")
    return by_way, rows


# --------------------------------------------------------------------------
# residual + report
# --------------------------------------------------------------------------
def residual_over_cap(stretch_doc: dict, structures: list[dict]) -> dict[str, float]:
    """Over-cap metres per way that no structure window covers."""
    spans: dict[str, list[tuple[float, float]]] = {}
    for st in structures:
        spans.setdefault(st["wayId"], []).append((st["fromM"], st["toM"]))
    out: dict[str, float] = {}
    for entry in stretch_doc["ways"]:
        wid, cap = entry["wayId"], entry["capDeg"]
        left = 0.0
        for s in entry["stretches"]:
            if s["worstDeg"] <= cap + 1.0:
                continue
            covered = any(a - 0.01 <= s["fromM"] and s["toM"] <= b + 0.01
                          for a, b in spans.get(wid, []))
            if not covered:
                left += s["overM"]
        if left > 0.0:
            out[wid] = round(left, 1)
    return out


def write_report(rows: list[dict], residual: dict[str, float], path: Path) -> str:
    by_way: dict[str, list[dict]] = {}

    for r in rows:
        by_way.setdefault(r["wayId"], []).append(r)
    lines = [
        "# Route structures",
        "",
        "Generated by `python3 -m worldgen.compile_route_structures` "
        "(deterministic).",
        "",
        f"The {len(by_way)} ways that stayed over their gradient cap after "
        "grading are walked on built geometry instead of on a deeper cut: a flight, a "
        "stepped ascent, a ramped deck, a span or one step over a lip. The "
        "windows come from the grader's own measurement "
        "(`output/route-grading-stretches.json`) and the pieces from "
        f"`{KIT}`. Each family uses one authored set only.",
        "",
        f"Caps: a flight may reach {FLIGHT_MAX_DEG:.0f} deg in masonry and "
        f"{LADDER_MAX_DEG:.0f} deg in lashed timber; a deck or span may grade "
        f"{RAMP_MAX_DEG:.0f} deg end to end.",
        "",
        "| way | structures | kinds | pieces | rise m | residual over-cap m |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for wid in sorted(by_way):
        rs = by_way[wid]
        kinds = ", ".join(sorted({r["kind"] for r in rs}))
        lines.append("| `{}` | {} | {} | {} | {:.1f} | {:.0f} |".format(
            wid, len(rs), kinds, sum(r["pieces"] for r in rs),
            sum(abs(r["riseM"]) for r in rs), residual.get(wid, 0.0)))
    lines += ["", "| structure | kind | family | from m | to m | rise m | pieces |",
              "| --- | --- | --- | --- | --- | --- | --- |"]
    for r in sorted(rows, key=lambda r: r["structureId"]):
        lines.append("| `{}` | {} | {} | {:.0f} | {:.0f} | {:.1f} | {} |".format(
            r["structureId"], r["kind"], r["family"], r["fromM"], r["toM"],
            r["riseM"], r["pieces"]))
    spans = [r for r in rows if r.get("span")]
    if spans:
        mono = [r for r in spans if r["span"]["arrangement"] == "monolith"]
        chained = [r for r in spans if r["span"]["arrangement"] == "chain"]
        piers = sum(r["span"]["piers"] for r in chained)
        short = sum(r["span"]["piersShort"] for r in chained)
        buried = max([r["span"].get("maxBuriedM", 0.0) for r in chained] or [0.0])
        by_sys: dict[str, int] = {}
        for r in spans:
            by_sys[r["span"]["system"]] = by_sys.get(r["span"]["system"], 0) + 1
        lines += [
            "", "## Crossings", "",
            "A crossing is built as ONE whole authored bridge wherever a single "
            "piece covers the gap at the way's running width, overhangs it by no "
            f"more than {MONOLITH_OVERHANG_MAX_M:.0f} m and can lie flat over it "
            f"without burying itself or meeting the road more than "
            f"{MONOLITH_END_STEP_MAX_M:.0f} m up. Otherwise the family's "
            "own viaduct is chained: an abutment at each end, a run of deck "
            "modules and piers on the authored spacing.",
            "",
            "The deck line is a taut string from one end of the window to the "
            "other, lying on or above the ground the whole way. It meets the "
            "road at both ends, does not dip into the terrain and moves no "
            "ground. A straight chord did dip, by up to 8.25 m, because an "
            "over-cap stretch is a slope with hummocks in it.",
            "",
            "That is also why so few crossings are a single arch. The windows "
            "come from the grader's over-cap stretches and their median fall is "
            "3.9 m, so a flat vanilla bridge laid across one of those meets the "
            "lower road several metres in the air. A chained viaduct steps down "
            "with the ground, one module at a time.",
            "",
            f"* {len(spans)} crossings, {sum(r['pieces'] for r in spans)} pieces.",
            f"* {len(mono)} are one authored bridge (worst overhang "
            f"{max([r['span']['overhangM'] for r in mono] or [0.0]):.1f} m); "
            f"{len(chained)} are chained.",
            f"* {piers} piers placed, {short} that do not reach the ground under "
            f"them; deepest foundation buried {buried:.2f} m (one trestle storey "
            "is 2.731 m).",
            "* systems: " + ", ".join(f"`{k}` {v}" for k, v in sorted(by_sys.items())) + ".",
            "",
            "| crossing | way | system | arrangement | span m | pieces | piers |",
            "| --- | --- | --- | --- | --- | --- | --- |",
        ]
        for r in sorted(spans, key=lambda r: r["structureId"]):
            f = r["span"]
            lines.append("| `{}` | `{}` | {} | {} | {:.0f} | {} | {} |".format(
                r["structureId"], r["wayId"], f["system"], f["arrangement"],
                f["spanM"], r["pieces"], f["piers"]))
        gaps = [r for r in spans if r["span"].get("postShortfallM", 0.0) > 0.1]
        lines += ["", "Crossings whose deck stands higher above the ground "
                  "than the length of the system's own posts, so that the "
                  "system has no footing: " + ("none." if not gaps else ", ".join(
                      f"`{r['structureId']}` ({r['span']['postShortfallM']:.1f} m)"
                      for r in sorted(gaps, key=lambda r: r["structureId"]))
                      + ". The BM&V passerelle set ships no pier. This is a "
                        "recorded sourcing gap.")]

    left = {k: v for k, v in residual.items() if v > 0.0}
    lines += ["", "Ways with over-cap metres no structure covers: "
              + ("none." if not left else
                 ", ".join(f"`{k}` ({v:.0f} m)" for k, v in sorted(left.items()))), ""]
    text = "\n".join(lines) + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    return text


def studio_export(by_way: dict[str, dict], rows: list[dict]) -> dict:
    """The studio feed: one segment per structure in world metres, plus the
    label the routes layer shows on hover. 3D rendering of the pieces is Round
    B's job — this is the 2D footprint only."""
    row_by_id = {r["structureId"]: r for r in rows}
    out = []
    unplaced: list[str] = []
    unauthored: list[str] = []
    for wid in sorted(by_way):
        doc = by_way[wid]
        for st in doc["structures"]:
            ps = [p for p in doc["placements"] if p["provenance"]["sourceStructureId"] == st["id"]]
            r = row_by_id[st["id"]]
            # A window no piece of its family fits carries no piece, so there
            # is nothing for the studio to draw and nothing built on the
            # ground. It stays in the authored record — that is where the debt
            # lives — but shipping it here would publish a structure of zero
            # pieces as if it existed. Re-grading changes the window lengths,
            # so this is a moving set: the count is printed every run.
            if not r["pieces"]:
                unplaced.append(st["id"])
                continue
            # The studio labels a structure with its authored sentence, so a
            # record without one has nothing to publish: shipping `why: null`
            # puts an empty label on the map and breaks the feed's contract
            # (apps/world-studio/src/routes/routesData.test.ts). The window
            # stays in world/sources/routes/route-structures.json, which is
            # where the authoring debt is carried and gated.
            if not isinstance(st.get("why"), str) or not st["why"].strip():
                unauthored.append(st["id"])
                continue
            out.append({
                "id": st["id"], "wayId": wid, "kind": st["kind"],
                "family": st["family"], "pieces": r["pieces"],
                "riseM": r["riseM"], "spanM": r["spanM"], "why": st["why"],
                "pointsM": [[p["posM"][0], p["posM"][2]] for p in ps],
            })
    for label, ids in (("place no piece", unplaced),
                       ("carry no authored `why`", unauthored)):
        if ids:
            print(f"[route-structures] {len(ids)} structures {label} and are not "
                  f"published: {', '.join(sorted(ids)[:6])}"
                  f"{' …' if len(ids) > 6 else ''}")
    return {"schemaVersion": SCHEMA_VERSION,
            "_": "Route structures for the studio routes layer, world metres "
                 "(X east, Z south). Written by worldgen.compile_route_structures. "
                 "Structures whose window fits no piece of their family are "
                 "recorded in world/sources/routes/route-structures.json but not "
                 "published here: nothing is built on the ground.",
            "structures": out}


def publish_route_outputs(by_way: dict[str, dict], out_dir: Path = OUT_DIR) -> None:
    """Publish the exact compiled file set without retaining stale way files.

    Every JSON is completed in a sibling staging directory before the prior
    shelf moves aside. A failed write leaves the old complete shelf in place;
    a process death during the two renames leaves no shelf rather than a stale
    file falsely satisfying an authored way.
    """
    out_dir.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=f".{out_dir.name}.stage.", dir=out_dir.parent))
    backup = stage.with_name(f"{stage.name}.previous")
    old_moved = False
    try:
        for wid, doc in sorted(by_way.items()):
            slug = wid.split(".", 1)[1].replace(".", "-")
            (stage / f"{slug}.json").write_text(
                json.dumps(doc, indent=2, sort_keys=True) + "\n")
        if out_dir.exists():
            os.replace(out_dir, backup)
            old_moved = True
        os.replace(stage, out_dir)
        if old_moved:
            shutil.rmtree(backup)
            old_moved = False
    except Exception:
        if old_moved and not out_dir.exists() and backup.exists():
            os.replace(backup, out_dir)
            old_moved = False
        raise
    finally:
        if stage.exists():
            shutil.rmtree(stage)
        if backup.exists() and not old_moved:
            shutil.rmtree(backup)


def main() -> None:
    from .compile_chunks import DEFAULT_HEIGHTS
    from .grade_routes import STRETCHES_PATH

    kit = load_kit()
    validate(kit)
    structures = json.loads(STRUCTURES_PATH.read_text())["structures"]
    heights = np.load(DEFAULT_HEIGHTS)
    by_way, rows = compile_all(structures, {w["id"]: w for w in ways()}, heights, kit)
    publish_route_outputs(by_way)
    residual = residual_over_cap(json.loads(STRETCHES_PATH.read_text()), structures)
    write_report(rows, residual, REPORT_PATH)
    STUDIO_PATH.write_text(json.dumps(studio_export(by_way, rows),
                                      indent=2, sort_keys=True) + "\n")
    print(f"{len(rows)} structures, {sum(r['pieces'] for r in rows)} pieces, "
          f"{len(by_way)} ways -> {OUT_DIR}")


if __name__ == "__main__":
    main()
