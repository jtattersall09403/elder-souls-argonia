"""What a parcel IS: `building`, `structure` or `prop` (97 C5/C6/C7/C12).

Implementation-lead decision 2026-09-07 (0041 Taste ledger), from the Round A
audit §7.1: a works yard is authored as parcels, so the 8 m spacing floor, the
density band and the use histogram were reading racks, ovens, carts and notice
boards as buildings and calling a drying yard a village. Every parcel therefore
carries a derived `kind`:

  building   encloses a room or has an entrance — the interiors index says so
  structure  a deck, scaffold, platform, bridge, gate, wall, tower: walked on,
             passed through or stood under, with nothing inside
  prop       a rack, oven, cart, board, trough, cairn: the trade's furniture

The kind is DERIVED, never asserted (97 E2, geometry not labels): the interiors
index first (enclosure/entrance), then the piece's own class tokens, then the
measured hull. A parcel may pin it with `kind:` where the derivation is wrong,
and then it says why in `why.what` like everything else.

Consequences, all held in code:
  * props are exempt from the C5 8 m floor (the 1.3 m passage still applies),
    from the C6 density band and from the C7 use histogram; C12 counts them as
    dressing;
  * structures count for C6 but not C7 (a deck is not a use);
  * a `stacksOn` piece adds nothing to any count — it is the same building
    seen from higher up (audit §6.5, the Standing Charge declaring 3 for two
    structures).
"""

from __future__ import annotations

from . import blueprint_footprints as fp
from . import blueprint_interiors as bi

KINDS = ("building", "structure", "prop")

# Tokens in a kit asset id, in the order they are tested. Props first: a piece
# whose id says "rack" is a rack even where its `use` says "work".
PROP_TOKENS = (
    "rack", "oven", "smelter", "forge", "bellows", "workbench", "cart", "wagon",
    "board", "trough", "cairn", "barrel", "crate", "basket", "bucket", "urn",
    "sack", "firewoodpile", "rubblepile", "ore", "saltpile", "coal",
    "shovel", "pitchfork", "wheel", "totem", "chime", "beam", "plank",
    "well", "cattail",
)
STRUCTURE_TOKENS = (
    "deck", "platform", "scaffold", "stair", "stairs", "ramp", "bridge",
    "gate", "wall", "tower", "walkway", "pier", "quay", "dock", "arch",
    "column", "pillar", "dias", "fence", "palisade", "stockade", "awning",
    "passl", "circle", "statue", "block", "floor", "causeway",
)
# `use` values that say the parcel is a structure whatever the mesh is called.
STRUCTURE_USES = {
    "gate", "wall", "fence", "palisade", "hedge", "stair", "ramp", "deck",
    "quay", "dock", "scaffold", "market", "frontage", "entrance", "conduit",
    "under-construction", "watch", "ruin",
}
# A piece the tokens call a prop but that measures like a building is a
# structure: the geometry decides, not the name (CLAUDE.md, 97 E2).
PROP_MAX_PLAN_M = 6.0
PROP_MAX_HEIGHT_M = 5.0
# The last resort when nothing is measured or tokenised.
SMALL_PLAN_M = 2.5
SMALL_HEIGHT_M = 2.5


def _tokens(asset_ref) -> str:
    """The piece's own name. A blueprint under validation may carry anything at
    all in `assetRef` (the schema check reports that separately), so a
    non-string is simply nameless here rather than an exception."""
    return asset_ref.rsplit("/", 1)[-1].lower() if isinstance(asset_ref, str) else ""


def _measures(asset_ref: str, scale: float,
              foot: "fp.FootprintLibrary | None") -> tuple[float, float, float]:
    """(plan width, plan depth, height) in metres, or zeros when unmeasured."""
    lib = foot if foot is not None else fp.library()
    rec = lib.get(asset_ref) if asset_ref else None
    if not rec:
        return 0.0, 0.0, 0.0
    poly = rec.get("footprintM") or rec.get("planOutlineM") or []
    if poly:
        w = (max(p[0] for p in poly) - min(p[0] for p in poly)) * scale
        d = (max(p[1] for p in poly) - min(p[1] for p in poly)) * scale
    else:
        w = d = float(rec.get("depthM") or 0.0) * scale
    return w, d, float(rec.get("heightM") or 0.0) * scale


def parcel_kind(parcel: dict, interiors=None, foot=None) -> str:
    """The derived kind of one parcel. Cheap enough to call in a loop; the
    libraries are process-wide caches."""
    pinned = parcel.get("kind")
    if pinned in KINDS:
        return pinned
    asset = parcel.get("assetRef")
    asset = asset if isinstance(asset, str) else ""
    scale = parcel.get("scale", 1.0)
    scale = float(scale) if isinstance(scale, (int, float)) and scale > 0 else 1.0
    lib = interiors if interiors is not None else bi.library()
    record = lib.get(asset) if (lib and asset) else None
    if record is not None:
        # "has a way in" is the interiors index's word, and that word is being
        # settled (`entrance`, formerly `doorways`); read whichever it carries.
        way_in = record.get("entrance") or record.get("doorways")
        if record.get("interior") in bi.NEEDS_INTERIOR or way_in:
            return "building"
    if (parcel.get("interior") or {}).get("kind") in ("kit", "matched", "tileset", "shell"):
        return "building"

    name = _tokens(asset)
    w, d, h = _measures(asset, scale, foot)
    if any(t in name for t in PROP_TOKENS):
        big = (max(w, d) > PROP_MAX_PLAN_M) or (h > PROP_MAX_HEIGHT_M)
        if not big:
            return "prop"
        return "structure"
    if (parcel.get("use") or "").lower() in STRUCTURE_USES:
        return "structure"
    if any(t in name for t in STRUCTURE_TOKENS):
        return "structure"
    if w and max(w, d) <= SMALL_PLAN_M and h <= SMALL_HEIGHT_M:
        return "prop"
    return "structure"


def kinds_of(bp: dict, interiors=None, foot=None) -> dict[str, str]:
    """`{parcel id: kind}` for a whole blueprint, derived once."""
    lib = interiors if interiors is not None else bi.library()
    flib = foot if foot is not None else fp.library()
    return {p.get("id"): parcel_kind(p, lib, flib) for p in bp.get("parcels", []) or []}


def counted_parcels(bp: dict, kinds: dict[str, str] | None = None,
                    include: tuple[str, ...] = ("building", "structure")) -> list[dict]:
    """The parcels a count is taken over: the wanted kinds, and never a piece
    that `stacksOn` another (the top of a scaffold is not a second building)."""
    kinds = kinds if kinds is not None else kinds_of(bp)
    return [p for p in bp.get("parcels", []) or []
            if kinds.get(p.get("id")) in include and not p.get("stacksOn")]
