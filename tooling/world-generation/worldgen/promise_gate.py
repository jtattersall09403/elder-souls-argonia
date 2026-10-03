"""The promise gate (decision 0104 decision 5): every row of a place's
promise ledger is filled by a placed thing, or excused with one of the four
decision 0102 reasons.

The ledger is ``world/sources/placement/promises/<place-id>.json``, generated
by ``python3 -m worldgen.blueprint_promises --id <place-id> --write`` from
the source records (0104 decision 3). A socket (a layout ``socket`` op, so a
compiled ``sockets[]`` row), a blueprint door or a blueprint parcel fills a
row by naming its id in ``fills: [promise ids]`` (0104 decision 4). A row
no one fills carries ``unfilled: {reason, note}``; any other state fails the
compile of a place and warns for a proving-ground fixture.

    promise_gate_errors(blueprint, ledger, sockets)   # [] when every row is kept

The gate never reads the catalogue: the ledger is the checklist, and the
builder's § Promises table is the ledger with a fulfilment column.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
LEDGER_DIR = REPO_ROOT / "world" / "sources" / "placement" / "promises"
LAYOUT_DIR = REPO_ROOT / "world" / "sources" / "blueprints"
LEDGER_SCHEMA_VERSION = 1
PROMISE_KINDS = ("service", "occupant", "operator", "provision", "socketBucket", "safeInterior",
                 "interior", "underwaterAccess", "travelStation", "prose", "quest")
#: kinds kept by the builder's confirmation, not by a placed thing: the row's
#: text is re-read against the built place and `confirmed: {sha, note}` pins
#: it (sha = blueprint_promises.text_sha of the text); an untrue line is fixed
#: by editing its source record (0104 decision 6), never left unconfirmed
CONFIRMED_KINDS = ("prose", "quest")
#: decision 0102 decision 3: the only four reasons a promise may stay unfilled
#: (c needs the sourcing register row named in the note)
UNFILLED_REASONS = ("later-phase-system", "gpu-judgement", "asset-exists-nowhere",
                    "owner-world-call")
#: blueprint collections whose rows may carry `fills`
FILLING_COLLECTIONS = ("parcels", "doors", "questSockets")
#: the physical nouns a record's prose can promise (audit10: bones, steps,
#: signs, a shed and a seep were promised and never built, and every gate was
#: green): noun -> (the prose pattern, the asset/id words that show it). Each
#: noun a `prose` row names is a `provision` row `thing-<noun>` that a placed
#: thing fills (blueprint_promises.claim_rows); `record_coherence` reads the
#: same table against the compiled bundle. Bare words that are also ordinary
#: prose are read only as the noun: "as well" is no well, "in the spring" is
#: the season, "takes its toll" no toll, "stable ground" no stable.
PHYSICAL_NOUNS: dict[str, tuple[str, tuple[str, ...]]] = {
    "boat": (r"\b(?:boats?|canoes?|rafts?|skiffs?)\b", ("boat", "canoe", "raft", "skiff", "ship")),
    "ferry": (r"\bferry\b|\bferries\b", ("ferry",)),
    "sign": (r"\b(?:signs?|signposts?|signboards?)\b(?!\s+of\b)", ("sign",)),
    "steps": (r"(?<!\bman )(?<!\bwoman )(?<!\bhe )(?<!\bshe )(?<!\bwho )(?<!\bone )"
              r"(?<!\bsomeone )\bsteps\b|\b(?:stairs?|stairways?)\b", ("step", "stair")),
    "plank crossing": (r"\bplanks?\b|\bboardwalks?\b",
                       ("plank", "dock", "boardwalk", "walkway", "bridge", "timber")),
    "well": (r"(?<!\bas )\bwells?\b(?![-,])"
             r"(?!\s+(?:kept|before|after|known|over|into|above|below|enough|off|made|built))",
             ("well",)),
    "spring": (r"(?<!\bin )(?<!\bin the )(?<!\bthis )(?<!\blast )(?<!\bnext )(?<!\bthat )"
               r"(?<!\bevery )(?<!\beach )(?<!\bby )(?<!\buntil )(?<!\bsince )(?<!\bthe late )"
               r"(?<!\bthe early )\bsprings?\b"
               r"(?!\s+(?:rains?|floods?|thaw|seasons?|tides?|planting|and\s+summer|or\s+summer))",
               ("spring",)),
    "tarn": (r"\btarns?\b", ("tarn", "pond", "pool")),
    "seep": (r"\bseeps?\b", ("seep",)),
    "shed": (r"\bsheds?\b", ("shed",)),
    "ore": (r"\bores?\b", ("ore", "ingot", "bloom")),
    "bones": (r"\bbones?\b|\bskulls?\b", ("bone", "skull", "spine")),
    "stable": (r"\bstables\b|\b(?:a|the|its) stable\b(?!\s+(?:ground|footing|floor|bank))",
               ("stable",)),
    "farmhouse": (r"\bfarmhouses?\b", ("farmhouse",)),
    "lantern": (r"\blanterns?\b|\blamps?\b", ("lantern", "lamp")),
    "fire": (r"\bfires?\b|\bhearths?\b|\bbraziers?\b|\bfire[- ]?pits?\b",
             ("fire", "brazier", "hearth", "campfire", "firepit")),
    "channel": (r"\bchannels?\b", ("channel", "canal")),
    "canal": (r"\bcanals?\b", ("canal", "channel")),
    "Hist tree": (r"\bHist\b", ("hist",)),
    "toll": (r"(?<!\btakes its )(?<!\btook its )(?<!\btake its )(?<!\btaken its )"
             r"(?<!\btakes their )(?<!\btook their )(?<!\btake a )\btolls?\b", ("toll",)),
    "bridge": (r"\bbridges?\b", ("bridge",)),
    "dock": (r"\bdocks?\b|\bjett(?:y|ies)\b|\bpiers?\b|\bquays?\b",
             ("dock", "jetty", "pier", "quay", "landing", "stage")),
    "shrine": (r"\bshrines?\b", ("shrine",)),
    "mine": (r"\bmines?\b(?!\s+(?:is|was))", ("mine", "diggings")),
    "tower": (r"\btowers?\b", ("tower",)),
}


def physical_nouns(text: str) -> list[str]:
    """The PHYSICAL_NOUNS a text names (sorted); "Hist" is matched case-sensitively."""
    return sorted(n for n, (pat, _) in PHYSICAL_NOUNS.items()
                  if re.search(pat, str(text or ""), 0 if n == "Hist tree" else re.I))


#: nouns a placed thing cannot show: water courses (the hydrology holds them)
#: and a toll (a relation); record_coherence still checks them
NOT_PLACED = ("channel", "canal", "toll")


def thing_nouns(text: str) -> list[str]:
    """The physical nouns of a text that a placed thing must show."""
    return [n for n in physical_nouns(text) if n not in NOT_PLACED]


def noun_slug(noun: str) -> str:
    return noun.lower().replace(" ", "-")


def bundle_ids(bundle: dict | None) -> set[str] | None:
    """Every id the published bundle carries (placements, compiled objects,
    doors, sockets), or None when no bundle is given (the compile stage)."""
    if bundle is None:
        return None
    st = bundle.get("settlement") or {}
    rows = [r for key in ("placements", "compiledObjects", "doors", "sockets")
            for src in (bundle, st) for r in src.get(key) or []]
    return ({str(r["id"]) for r in rows if isinstance(r, dict) and r.get("id")}
            | {str(i) for key in ("placementIds", "compiledObjectIds") for i in st.get(key) or []})


def _in_bundle(oid: str, ids: set[str]) -> bool:
    """A layout id is in the bundle as itself, or as the tail or a segment of
    a compiled id (`<place>.parcel.<p>.assembly.<op id>`)."""
    return oid in ids or any(i.endswith("." + oid) or f".{oid}." in i for i in ids)


def ledger_path(place_id: str, root: Path = LEDGER_DIR) -> Path:
    return Path(root) / f"{place_id}.json"


def load_ledger(place_id: str, root: Path = LEDGER_DIR) -> dict | None:
    """The committed ledger of one place, or None when the place has none yet."""
    path = ledger_path(place_id, root)
    if not path.exists():
        return None
    doc = json.loads(path.read_text(encoding="utf-8"))
    if doc.get("schemaVersion") != LEDGER_SCHEMA_VERSION:
        raise ValueError(f"{path}: promise ledger schemaVersion {doc.get('schemaVersion')} "
                         f"!= {LEDGER_SCHEMA_VERSION}")
    return doc


def layouts(root: Path = LAYOUT_DIR) -> dict[str, dict]:
    """place id -> its layout document (every ``*.layout.json``)."""
    out = {}
    for path in sorted(Path(root).glob("*.layout.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        if doc.get("placeId"):
            out[doc["placeId"]] = doc
    return out


def layout_sockets(layout: dict | None) -> list[dict]:
    """The authored socket ops of a layout (the home table of placed
    interactables, 0104 decision 4)."""
    if not layout:
        return []
    return list(layout.get("sockets") or []) + [
        op for op in layout.get("ops") or [] if op.get("op") == "socket"]


def fills_index(bp: dict, sockets: list[dict] | None = None,
                layout: dict | None = None) -> dict[str, list[str]]:
    """promise id -> the ids of the sockets, doors, parcels and layout
    placements (any layout op with an id) that name it in ``fills`` (each
    filler once, sorted). With no ``layout`` given, the place's committed
    ``<slug>.layout.json`` is read, so the compile's ``promiseFills`` carries
    the placements that fill a row."""
    if layout is None:
        path = LAYOUT_DIR / f"{str(bp.get('id') or '').rsplit('.', 1)[-1]}.layout.json"
        layout = json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
    out: dict[str, set[str]] = {}
    rows = [r for key in FILLING_COLLECTIONS for r in bp.get(key) or [] if isinstance(r, dict)]
    rows += [s for s in sockets or [] if isinstance(s, dict)]
    rows += [op for op in (layout or {}).get("ops") or []
             if isinstance(op, dict) and op.get("id") and op.get("fills")]
    for row in rows:
        for pid in row.get("fills") or []:
            out.setdefault(pid, set()).add(str(row.get("id")))
    return {pid: sorted(ids) for pid, ids in sorted(out.items())}


def promise_gate_errors(bp: dict, ledger: dict | None,
                        sockets: list[dict] | None = None, layout: dict | None = None,
                        bundle: dict | None = None) -> list[str]:
    """Every ledger row filled by at least one ``fills`` reference, or
    carrying ``unfilled`` with a valid reason; every ``fills`` id a row of
    this ledger; every physical noun a prose row names has its
    ``thing-<noun>`` row; a prose row naming a physical noun is confirmed
    with the ``ids`` of the placements it rests on. Given the published
    ``bundle``, every filler and confirmation id must be in it. Each message
    is led by its rule id, ``promises.*``."""
    if ledger is None:
        return []
    out: list[str] = []
    ids = bundle_ids(bundle)
    if ledger.get("placeId") != bp.get("id"):
        out.append(f"promises.ledger: ledger placeId {ledger.get('placeId')!r} is not "
                   f"blueprint {bp.get('id')!r}")
    rows = {r["id"]: r for r in ledger.get("promises") or []}
    filled = fills_index(bp, sockets, layout)
    slug = str(ledger.get("placeId") or "").rsplit(".", 1)[-1]
    named: dict[str, list[str]] = {}
    for pid, row in sorted(rows.items()):
        for noun in thing_nouns(row.get("text")) if row.get("kind") == "prose" else []:
            named.setdefault(noun, []).append(pid)
    out += [f"promises.thing: {', '.join(pids)} name{'s' if len(pids) == 1 else ''} a {noun} and "
            f"the ledger has no row promise.{slug}.thing-{noun_slug(noun)}; regenerate it with "
            f"`blueprint_promises --id {ledger.get('placeId')} --write`"
            for noun, pids in sorted(named.items())
            if f"promise.{slug}.thing-{noun_slug(noun)}" not in rows]
    for pid, fillers in sorted(filled.items()) if ids is not None else []:
        out += [f"promises.built: {f} fills {pid} and is not in the published bundle; fill "
                f"from a placed thing and publish the place" for f in fillers if not _in_bundle(f, ids)]
    for pid, fillers in filled.items():
        if pid not in rows:
            out.append(f"promises.unknown: {', '.join(fillers)} fills {pid!r}, which is no row "
                       f"of {ledger.get('placeId')}'s ledger (regenerate it with "
                       f"`blueprint_promises --id {ledger.get('placeId')} --write`)")
    for pid, row in sorted(rows.items()):
        if row.get("kind") in CONFIRMED_KINDS:
            out += _confirmation_errors(pid, row, ids)
            continue
        unfilled = row.get("unfilled")
        if unfilled is not None:
            reason = (unfilled or {}).get("reason")
            if reason not in UNFILLED_REASONS:
                out.append(f"promises.reason: {pid} is unfilled with reason {reason!r}; the "
                           f"reason is one of {list(UNFILLED_REASONS)} (decision 0102)")
            elif not str((unfilled or {}).get("note") or "").strip():
                out.append(f"promises.reason: {pid} is unfilled ({reason}) with no note")
            if pid in filled:
                out.append(f"promises.both: {pid} is filled by {', '.join(filled[pid])} and "
                           f"also marked unfilled; drop the `unfilled` block")
            continue
        if pid not in filled:
            out.append(f"promises.unfilled: {pid} ({row.get('kind')}: {row.get('text')}) is "
                       f"filled by no socket, door or parcel; add `fills: [\"{pid}\"]` to the "
                       f"thing that keeps it, or give the row `unfilled` with a decision 0102 "
                       f"reason")
    return out


def _confirmation_errors(pid: str, row: dict, ids: set[str] | None = None) -> list[str]:
    """A prose or quest row: confirmed against its current text, with a note;
    a prose row that names a physical noun also names, in ``confirmed.ids``,
    the placement(s) it rests on, each in the published bundle when one is
    given (a builder's pin alone kept a shed nobody built, audit10)."""
    from .blueprint_promises import text_sha
    conf = row.get("confirmed") or {}
    sha = text_sha(row.get("text"))
    if conf.get("sha") != sha:
        return [f"promises.confirm: {pid} ({row.get('kind')}: {str(row.get('text'))[:90]}) is not "
                f"confirmed against the built place{' (its text changed)' if conf else ''}: re-read "
                f"it, edit the source record where the place contradicts it (place-build step 5b), "
                f"then set `confirmed: {{\"sha\": \"{sha}\", \"note\": <what in the place keeps it>}}`"]
    if not str(conf.get("note") or "").strip():
        return [f"promises.confirm: {pid} is confirmed with no note naming what keeps it"]
    nouns = thing_nouns(row.get("text")) if row.get("kind") == "prose" else []
    shown = [str(i) for i in conf.get("ids") or []]
    if nouns and not shown:
        return [f"promises.confirm: {pid} names {', '.join(nouns)} and its confirmation names no "
                f"placement: add `ids: [<placement id>, ...]` to `confirmed`"]
    return [f"promises.built: {pid} rests on {i}, which is not in the published bundle"
            for i in shown if ids is not None and not _in_bundle(i, ids)]


BUNDLE_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "settlements"


def published_errors(place_id: str) -> list[str]:
    """The gate over the PUBLISHED place: its committed blueprint export, its
    layout's sockets and fills, and the bundle every filler must be in."""
    bundle_path = BUNDLE_DIR / f"{place_id}.json"
    bp_path = LAYOUT_DIR / f"{place_id}.json"
    if not bundle_path.exists() or not bp_path.exists():
        return [f"promises.built: {place_id} has no published bundle or blueprint export"]
    bundle = json.loads(bundle_path.read_text(encoding="utf-8"))
    bp = json.loads(bp_path.read_text(encoding="utf-8"))["blueprint"]
    sockets = (bundle.get("settlement") or {}).get("sockets") or bundle.get("sockets")
    lay = LAYOUT_DIR / f"{place_id.rsplit('.', 1)[-1]}.layout.json"
    layout = json.loads(lay.read_text(encoding="utf-8")) if lay.exists() else None
    if sockets is None:
        sockets = layout_sockets(layout)
    return promise_gate_errors(bp, load_ledger(place_id), sockets, layout, bundle)


def main(argv=None) -> int:
    import argparse
    ap = argparse.ArgumentParser(description="The promise gate over published places.")
    ap.add_argument("--place", action="append", default=[])
    ap.add_argument("--all-built", action="store_true",
                    help="every place with a ledger and a published bundle")
    args = ap.parse_args(argv)
    places = list(args.place) or sorted(p.stem for p in LEDGER_DIR.glob("*.json")
                                        if (BUNDLE_DIR / p.name).exists())
    rc = 0
    for pid in places:
        errs = published_errors(pid)
        print(f"{pid}: {len(errs)} failing")
        for e in errs:
            print(f"  {e}")
        rc |= bool(errs)
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
