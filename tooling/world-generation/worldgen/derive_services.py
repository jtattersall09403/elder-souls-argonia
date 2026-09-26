"""Derive `services[]` for every catalogue record that owes the player one.

Why this exists (owner finding 2026-09-05). A record said
`rewardProfile.kinds: ["services"]` and `playerPurpose.primary: "service-hub"`,
and nothing anywhere said WHICH services. So no check could notice that
Lilmoth's blueprint had one shop parcel and no inn, trader, smith, apothecary
or temple hall. `services[]` types the promise; `worldgen.blueprint_promises`
checks the blueprint keeps it.

The derivation is DETERMINISTIC (standard 6) and rule-by-rule, so a reviewer
can read any record's list back to the rule that produced it:

  R0 scope      class ∈ {settlement, civic}, or playerPurpose service-hub.
                Everything else has no services[] at all.
  R1 status     ruined / abandoned / drowned / contested-with-no-population
                → nothing. Nobody keeps a shop in a ruin.
  R2 magnitude  the base list per band, calibrated on Morrowind (UESP
                Morrowind:Balmora — ~40 buildings carries 2 traders, an
                alchemist, a smith, a temple, three guild halls and two corner
                clubs; that is our M4). M5 adds the market, the moneylender and
                the seat of government; M3 keeps a trader and a shrine;
                M1/M2 keep nothing (settlement-register §1: "one family, one
                trade" / "transient or seasonal").
  R3 culture    what the lore says the culture does and does not build.
                argonian: no moneylender (the marsh economy is subsistence and
                barter, not lending — settlement-register §1, lore/tribes.md),
                no stable (no horse culture), and no `temple` at any size: the
                sacred place is the Hist court, a `shrine`, and it stays one in
                the largest cities too (lore/lilmoth.md — Lilmoth's sacred
                ground is the third Hist court and the sunken Xhon-Mehl shrine,
                with no temple hall; lore/topics/hist-placement.md — the
                Argonian temple in canon is a Hist chamber or a Sithis site,
                never a service hall a traveller walks into). The office is
                a `council`, not a `court` (the register's office-holders).
                imperial: `court` and `licence-office` from M4 (provincial
                administration), a `stable` where a road reaches it.
                dunmer: House holdings, so `temple` and `smith` yes, and no
                `guild-hall` below M5 — a stronghold is not a guild seat.
  R4 purpose    service-hub guarantees lodging + trader from M3; safe-rest
                guarantees lodging; faction-gateway a guild-hall from M3.
  R5 travel     a travelStation is a service the player pays for: `ferry`;
                `boatwright` where an M4+ station takes keeled boats;
                `stable` where it takes carts. A place whose station socket
                runs an active `road-crossing` row (`operator.socketRef`,
                world/sources/routes/travel-services.json) offers `ferry`
                too, a crossing with no lane: Claywater Station's poler runs
                the ford ferry (16k 1c).
  R6 npc roles  contents.npcs[].role is itself a promise of a place: official →
                council/court, priest → temple/shrine, merchant → trader (+
                market at M5), trainer → guild-hall.
  R7 civic      a `civic` record is where an office sits: council (argonian)
                or court (otherwise).
  R8 hero Hist  a tended Hist is a shrine the player can stand at.
  R9 ceilings   M1/M2 keep at most {shrine, ferry}; a non-settlement,
                non-civic service-hub keeps at most
                {trader, lodging, shrine, ferry}.
  R10 implied   what the record itself implies is never stripped by R9
                (the non-settlement ceiling still holds)
                (coordinator ruling 2026-09-26): a service backing a
                `rewardProfile.kinds` entry (rest-shelter -> lodging,
                trade-access -> trader, training / enchanting-access ->
                guild-hall, faction-access -> council or court) and the type
                recipe's typed `services` (type-recipes.json; road-station-village:
                stable), less what the culture never builds (R3).

Run (from tooling/world-generation/):
  python3 -m worldgen.derive_services            # report the diff
  python3 -m worldgen.derive_services --apply    # write it into the records
"""

from __future__ import annotations

import argparse
import functools
import json
import sys

from . import catalogue
from .catalogue import HAMLET_SERVICE_CEILING, SERVICES

DEAD_STATUSES = ("ruined", "abandoned", "drowned", "cut", "deferred")

# R2 — the base list per magnitude band.
BASE_BY_MAGNITUDE = {
    "M5": ["apothecary", "court", "guild-hall", "lodging", "market", "moneylender",
           "smith", "tavern", "temple", "trader"],
    "M4": ["apothecary", "lodging", "smith", "tavern", "temple", "trader"],
    "M3": ["shrine", "trader"],
    "M2": [],
    "M1": [],
    None: [],
}
NON_SETTLEMENT_CEILING = {"trader", "lodging", "shrine", "ferry"}
TRAVEL_SERVICES = catalogue.REPO_ROOT / "world" / "sources" / "routes" / "travel-services.json"
TYPE_RECIPES = catalogue.CATALOGUE_DIR / "type-recipes.json"
# R10: the one service each reward kind implies when none backs it yet
# (blueprint_promises.REWARD_NEEDS holds every service that backs it).
# `services` names no particular service, so it implies none.
REWARD_DEFAULT = {"rest-shelter": "lodging", "trade-access": "trader", "training": "guild-hall",
                  "enchanting-access": "guild-hall"}


def crossing_operators(doc: dict) -> frozenset[str]:
    """R5: places whose own station socket (`operator.socketRef`) runs an
    active `road-crossing` service: a ferry over a break in a way, hops along
    the road, no lane. A station-run is promised by `travelStation` instead."""
    return frozenset(
        s["operator"]["nearestPlaceId"] for s in doc.get("services") or []
        if s.get("status") == "active" and s.get("form") == "road-crossing"
        and (s.get("operator") or {}).get("socketRef") and s["operator"].get("nearestPlaceId"))


@functools.lru_cache(maxsize=1)
def operating_places() -> frozenset[str]:
    if not TRAVEL_SERVICES.exists():
        return frozenset()
    return crossing_operators(json.loads(TRAVEL_SERVICES.read_text(encoding="utf-8")))


@functools.lru_cache(maxsize=1)
def recipe_services() -> dict[str, tuple[str, ...]]:
    """R10: the services a type recipe names in its typed `services` field."""
    doc = json.loads(TYPE_RECIPES.read_text(encoding="utf-8"))
    out = {t["type"]: tuple(t.get("services") or ()) for t in doc.get("types") or []}
    bad = {k: sorted(set(v) - SERVICES) for k, v in out.items() if set(v) - SERVICES}
    if bad:
        raise ValueError(f"type-recipes.json services outside catalogue.SERVICES: {bad}")
    return out


def implied(rec: dict, have: set[str] = frozenset()) -> set[str]:
    """R10: the services the record itself implies, which no ceiling strips
    (coordinator ruling 2026-09-26): per `rewardProfile.kinds` entry, the
    services in `have` that already back it (blueprint_promises.REWARD_NEEDS),
    else its REWARD_DEFAULT (faction-access: the culture's office); and the
    type recipe's `services`; less what the culture never builds (R3)."""
    from .blueprint_promises import REWARD_NEEDS
    culture = rec.get("culture")
    out = set(recipe_services().get((rec.get("classification") or {}).get("type"), ()))
    for kind in (rec.get("rewardProfile") or {}).get("kinds") or []:
        if kind not in REWARD_NEEDS or kind == "services":
            continue
        backers = set(have) & REWARD_NEEDS[kind]
        if backers:
            out |= backers
        elif kind == "faction-access":
            out.add("council" if culture in ("argonian", "mixed", None) else "court")
        elif kind in REWARD_DEFAULT:
            out.add(REWARD_DEFAULT[kind])
    if culture == "argonian":
        out -= {"moneylender", "stable"}
    return out


def derive(rec: dict) -> list[str] | None:
    """The rules above, in order. None = this record owes no services[] (R0)."""
    if not catalogue.services_scoped(rec):
        return None
    if rec.get("status") in DEAD_STATUSES:                                  # R1
        return []
    cls = (rec.get("classification") or {})
    mag = cls.get("magnitude")
    culture = rec.get("culture")
    purpose = rec.get("playerPurpose") or {}
    purposes = {purpose.get("primary")} | set(purpose.get("secondary") or [])
    out = set(BASE_BY_MAGNITUDE.get(mag, []))                               # R2

    if culture == "argonian":                                               # R3
        out -= {"moneylender", "stable"}
        if "temple" in out:
            out = (out - {"temple"}) | {"shrine"}
        if "court" in out:
            out = (out - {"court"}) | {"council"}
        if mag in ("M4", "M5"):
            out.add("council")
    elif culture == "imperial":
        if mag in ("M4", "M5"):
            out |= {"court", "licence-office"}
        if rec.get("discovery") == "road":
            out.add("stable")
    elif culture == "dunmer":
        if mag in ("M3", "M4", "M5"):
            out |= {"temple", "smith"}
        if mag != "M5":
            out.discard("guild-hall")

    if mag in ("M3", "M4", "M5"):                                           # R4
        if purpose.get("primary") == "service-hub":
            out |= {"lodging", "trader"}
        if "safe-rest" in purposes:
            out.add("lodging")
        if "faction-gateway" in purposes:
            out.add("guild-hall")

    ts = rec.get("travelStation") or {}                                     # R5
    modes = set(ts.get("modes") or [])
    if modes:
        out.add("ferry")
        if "boat" in modes and mag in ("M4", "M5"):
            out.add("boatwright")
        if "cart" in modes:
            out.add("stable")
    if rec.get("id") in operating_places():
        out.add("ferry")

    roles = {n.get("role") for n in (rec.get("contents") or {}).get("npcs") or []}   # R6
    if "official" in roles:
        out.add("council" if culture in ("argonian", "mixed", None) else "court")
    if "priest" in roles:
        out.add("temple" if "temple" in out else "shrine")
    if "merchant" in roles:
        out.add("trader")
        if mag == "M5":
            out.add("market")
    if "trainer" in roles:
        out.add("guild-hall")

    if cls.get("class") == "civic":                                         # R7
        out.add("council" if culture in ("argonian", "mixed", None) else "court")

    if rec.get("heroHist"):                                                 # R8
        out.add("shrine")

    keep = implied(rec, out)                                                # R10
    if mag in ("M1", "M2"):                                                 # R9
        out &= set(HAMLET_SERVICE_CEILING)
    out |= keep                                                             # R10
    if cls.get("class") not in ("settlement", "civic"):
        out &= NON_SETTLEMENT_CEILING
    assert out <= SERVICES, sorted(out - SERVICES)
    return sorted(out)


def run(apply: bool = False) -> int:
    changed = 0
    for rf in catalogue.load_region_files():
        dirty = False
        for rec in rf.places:
            want = derive(rec)
            have = rec.get("services")
            if want == have:
                continue
            changed += 1
            print(f"{rec['id']}: {have} -> {want}")
            if apply:
                if want is None:
                    rec.pop("services", None)
                else:
                    rec["services"] = want
                dirty = True
        if apply and dirty:
            catalogue.dump_json(rf.path, {
                "schemaVersion": catalogue.PLACES_SCHEMA_VERSION,
                "region": rf.region, "seed": rf.seed, "places": rf.places,
            })
    print(f"derive_services: {changed} records {'rewritten' if apply else 'would change'}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="write the derived lists into the records")
    return run(ap.parse_args().apply)


if __name__ == "__main__":
    sys.exit(main())
