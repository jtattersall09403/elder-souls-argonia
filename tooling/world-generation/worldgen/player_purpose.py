"""Typed player purposes for enterable parcels (owner ruling 2026-09-07).

An enterable building earns its interior. If a parcel carries a door, the
blueprint must say what the player gets by walking through it, in a closed
vocabulary, and at least one of those things must be of `medium` tier or
better. "A dwelling to enter, kept by one of the newest households" gives the
player nothing, and it is a HARD failure here.

The rule is about *interiors only*. Exteriors, ruins, wall stubs, gate arches
and every other piece of dressing are atmosphere; they are unlimited and out of
scope. The number of buildings still comes from the lore scale grounding, never
from this file: the answer to "too many huts" is to give each hut a purpose,
not to delete huts.

Schema, on any parcel whose `interior.kind` is not `none`:

    "playerPurpose": [ {"kind": "fence", "tier": "medium",
                        "note": "buys salvage the licence house would ask about"} ]

`kind` comes from `PURPOSE_KINDS`; `tier` must equal that kind's own tier;
`note` is one plain sentence naming the concrete thing, not a mood.

Design background and the sources behind the three tiers:
docs/research/placement-settlements/player-purpose-spectrum.md.

Note on names: the prose line `parcel.why.playerPurpose` is the design-voice
sentence a reviewer reads; this `parcel.playerPurpose[]` is the typed record
Phase 12/13 read. They say the same thing at different resolutions.
"""

from __future__ import annotations

from collections import Counter

SCHEMA_VERSION = 1

# --- the closed vocabulary -------------------------------------------------
# kind -> (tier, what it asks of Phase 12/13 to exist)
PURPOSE_KINDS: dict[str, tuple[str, str]] = {
    # major — the reasons a player remembers a building
    "quest-giver": ("major", "a cast slot and a dialogue tree at this door"),
    "quest-stage": ("major", "a quest socket resolved inside this interior"),
    "service-station": ("major", "a service station: travel, healing, storage or repair"),
    "faction-door": ("major", "a faction join/rank interaction bound to an occupant"),
    "unique-item": ("major", "one authored item, placed and never respawned"),
    # medium — the reasons a player keeps opening doors
    "valuables": ("medium", "an owned-goods loot table and ownership/crime flags"),
    "lock-target": ("medium", "a lock with a difficulty and a key holder"),
    "actionable-information": ("medium", "a dialogue or note that sets a world flag: a route, a price, a name"),
    "trade": ("medium", "a merchant inventory and gold pool"),
    "training": ("medium", "a trainer skill and cap"),
    "bed": ("medium", "a rentable or ownable bed with a rest gate"),
    "crafting": ("medium", "a crafting station of a named type"),
    "cache": ("medium", "a container with authored contents, hidden or owned"),
    "usable-fixture": ("medium", "a world object the player operates that changes state: a bell, a lamp, a winch"),
    "witness": ("medium", "an occupant carrying testimony a quest can query"),
    "fence": ("medium", "a merchant who buys stolen goods, with a disposition gate"),
    # minor — texture; never enough on its own
    "rumour": ("minor", "a rumour line that names a real place or person"),
    "readable": ("minor", "a book or note item that unlocks a socket or a map mark"),
    "hiding-place": ("minor", "a navmesh pocket or container that breaks line of sight"),
    "vantage": ("minor", "a reachable high point with a sightline worth the climb"),
}

TIERS = ("major", "medium", "minor")
TIER_RANK = {"minor": 0, "medium": 1, "major": 2}

# Distribution bands, checked per blueprint and reported as WARN (never fatal).
MIN_SUBSTANTIAL_SHARE = 0.60   # enterables carrying a major or medium purpose
MAX_MAJOR_SHARE = 0.40         # enterables carrying a major purpose
MIN_ENTERABLES_FOR_DISTRIBUTION = 6
MIN_NOTE_CHARS = 20


def is_enterable(parcel: dict) -> bool:
    """A parcel is enterable when it declares an interior that is not `none`."""
    return (parcel.get("interior") or {}).get("kind", "none") != "none"


def enterables(bp: dict) -> list[dict]:
    return [p for p in bp.get("parcels", []) or [] if is_enterable(p)]


def best_tier(parcel: dict) -> str | None:
    tiers = [e.get("tier") for e in parcel.get("playerPurpose") or []
             if isinstance(e, dict) and e.get("tier") in TIER_RANK]
    return max(tiers, key=lambda t: TIER_RANK[t]) if tiers else None


def purpose_summary(bp: dict) -> dict:
    """Counts a reviewer can read at a glance: entries by tier, parcels by
    best tier, the kinds used, and the two distribution shares."""
    ent = enterables(bp)
    by_kind: Counter = Counter()
    by_tier: Counter = Counter()
    best: Counter = Counter()
    for p in ent:
        for e in p.get("playerPurpose") or []:
            if isinstance(e, dict) and e.get("kind") in PURPOSE_KINDS:
                by_kind[e["kind"]] += 1
                by_tier[PURPOSE_KINDS[e["kind"]][0]] += 1
        best[best_tier(p) or "none"] += 1
    n = len(ent) or 1
    return {
        "id": bp.get("id"),
        "enterables": len(ent),
        "entriesByTier": dict(by_tier),
        "parcelsByBestTier": dict(best),
        "kinds": dict(by_kind),
        "substantialShare": round((best["major"] + best["medium"]) / n, 3),
        "majorShare": round(best["major"] / n, 3),
        "schemaVersion": SCHEMA_VERSION,
    }


def summary_line(bp: dict) -> str:
    s = purpose_summary(bp)
    b = s["parcelsByBestTier"]
    return (f"purposeSummary {s['id']}: {s['enterables']} enterable, "
            f"best tier major {b.get('major', 0)} / medium {b.get('medium', 0)} / "
            f"minor {b.get('minor', 0)} / none {b.get('none', 0)}; "
            f"entries {s['entriesByTier']}; "
            f"substantial {s['substantialShare']:.0%}, major {s['majorShare']:.0%}")


def validate_player_purpose(bp: dict, warnings: list[str] | None = None) -> list[str]:
    """HARD errors for the purpose rule; appends the summary and the
    distribution WARNs to `warnings` when a list is given."""
    errors: list[str] = []
    bid = bp.get("id", "<missing id>")
    ent = enterables(bp)

    for p in ent:
        pid = p.get("id")
        entries = p.get("playerPurpose")
        if not isinstance(entries, list) or not entries:
            errors.append(f"{bid}: parcel {pid} has an interior but no playerPurpose[] "
                          f"— an enterable building must say what it gives the player")
            continue
        for i, e in enumerate(entries):
            where = f"{bid}: parcel {pid} playerPurpose[{i}]"
            if not isinstance(e, dict):
                errors.append(f"{where} must be an object {{kind, tier, note}}")
                continue
            kind, tier, note = e.get("kind"), e.get("tier"), (e.get("note") or "")
            if kind not in PURPOSE_KINDS:
                errors.append(f"{where}: kind {kind!r} is not in the vocabulary "
                              f"({', '.join(sorted(PURPOSE_KINDS))})")
                continue
            if tier != PURPOSE_KINDS[kind][0]:
                errors.append(f"{where}: kind {kind!r} is tier "
                              f"{PURPOSE_KINDS[kind][0]!r}, not {tier!r}")
            if len(note.strip()) < MIN_NOTE_CHARS:
                errors.append(f"{where}: note must name the concrete thing "
                              f"(>={MIN_NOTE_CHARS} characters)")
        if best_tier(p) == "minor":
            errors.append(f"{bid}: parcel {pid} is flavour-only — an interior needs at "
                          f"least one playerPurpose of medium tier or higher, or it "
                          f"should be dressing with interior.kind 'none'")

    if warnings is not None:
        warnings.append(summary_line(bp))
        if len(ent) >= MIN_ENTERABLES_FOR_DISTRIBUTION:
            s = purpose_summary(bp)
            if s["substantialShare"] < MIN_SUBSTANTIAL_SHARE:
                warnings.append(f"{bid}: only {s['substantialShare']:.0%} of enterables carry a "
                                f"major or medium purpose (floor {MIN_SUBSTANTIAL_SHARE:.0%})")
            if s["majorShare"] > MAX_MAJOR_SHARE:
                warnings.append(f"{bid}: {s['majorShare']:.0%} of enterables are major-tier "
                                f"(ceiling {MAX_MAJOR_SHARE:.0%}) — a settlement where every door "
                                f"is a quest reads as a theme park")
    return errors
