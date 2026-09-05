"""Author the route-structure records from the measured over-cap stretches.

    cd tooling/world-generation
    python3 -m worldgen.grade_routes            # writes output/route-grading-stretches.json
    python3 -m worldgen.author_route_structures # writes world/sources/routes/route-structures.json

WHY THIS EXISTS
---------------
Thirty-five ways are still over their class gradient cap after grading, and the
honest remedy for every one of them is authored geometry rather than a deeper
cut (see `world/sources/sites/route-grading.md`). The chainage windows those
structures occupy are a *measurement*, not an opinion, so they are read off the
grader's own stretch export instead of being typed in by hand: re-grade, re-run
this, and the windows follow the ground.

What is judgement, and stays here in source form:

* **the family** — which culture builds the thing, from the region the way runs
  through (module 97 and the region dossiers): the Imperial fringe builds in
  rough farm-terrace stone, the Dunmer north in Hlaalu masonry, the Hist
  heartland in root-timber passerelle, the pirate freeholds in lashed scaffold,
  and a published road is Imperial engineering wherever it runs.
* **the kind** — a flight, a stepped ascent, a ramped deck, a span or a single
  lip step, chosen from the measured shape of the defect (see `_kind`).
* **the `why`** — one authored sentence per way, carried by each of that way's
  structures because it is the same reason each time: the ground, and what a
  cut deep enough to hold the cap would have destroyed.

Determinism (standard 6): sorted output, stable ids, pure function of the
stretch export and the tables below.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

from .compile_route_structures import FAMILIES, KIND_ROLE
from .grade_routes import (GRADIENT_CAP_DEG, STRETCHES_PATH, STRUCTURES_PATH,
                           resample, sample_bilinear, ways)
from .scale import RAW_M

SCHEMA_VERSION = 1

# Two over-cap stretches closer together than this are one structure: a flight
# does not stop and restart across ten metres of level ground.
AUTHOR_MERGE_GAP_M = 60.0

# A window graded steeper than this end to end is not a deck (see the 12 deg
# compile_route_structures.RAMP_MAX_DEG): it is a flight. Three degrees of
# margin, because the compiler measures the window on the GRADED surface at
# the landings and this module measures the ground the structure stands on.
DECK_MAX_GRADE_DEG = 9.0

# region slug in the way id -> the family that builds there. A published road
# (`route.road.*`) is Imperial engineering wherever it runs.
FAMILY_BY_REGION = {
    "imperial-fringe": "stone-rural",
    "dunmer-north": "dunmer-stone",
    "hist-heartland": "root-timber",
    "pirate-freeholds": "scaffold-timber",
}
ROAD_FAMILY = "stone-civic"

# One authored sentence per survivor way (standard 12: prose written against
# the record, promising nothing the typed fields cannot show).
WHY = {
 "track.imperial-fringe.swampmoth-town":
   "The track leaves the moth farms by a break in the scarp. That break is already a rock stair. Widening it would drop the ledge on which the farms stand onto the road.",
 "track.dunmer-north.the-diggings-ladder":
   "This is the way down into the diggings. The diggings are a hole, so the way down is built as steps.",
 "track.dunmer-north.the-field-gate-garrison":
   "The garrison sits on the high field above a run of terraces. Each terrace lip is a wall of packed clay that would slump if it were cut back.",
 "track.imperial-fringe.stonefoot-terrace-village":
   "Stonefoot's terraces are held up by their own retaining stone, so the path steps between them rather than trenching through the walls that keep the fields.",
 "track.dunmer-north.the-flu-cordon":
   "The cordon path was cut in a hurry along a bluff above the water. It keeps its height by climbing the bluff twice; below it there is no room for a gentler line.",
 "track.imperial-fringe.lowmere-raft-town":
   "Lowmere sits at the bottom of a long ravine. The path is its dry approach, so the last descent is stepped rather than dug into a wall that already sheds.",
 "track.dunmer-north.rimfield":
   "Rimfield's fields are on top of the escarpment and the way in comes off its edge. The edge is bare rock and will not hold a cut.",
 "track.dunmer-north.crystalgate":
   "The gate stands above its own quarry face. That quarry is still worked, so the approach climbs on masonry rather than through the working stone.",
 "track.pirate-freeholds.dunmer-frontier-holding":
   "The holding was placed to watch the water from height. The last climb was left awkward on purpose, so it is carried rather than flattened.",
 "track.pirate-freeholds.veterans-holding":
   "The veterans took a shelf halfway up a spur. The track to it crosses three older slips of loose ground, where a cut would start them moving again.",
 "track.dunmer-north.mazzatun":
   "The road to Mazzatun climbs out of the flood ground onto a ridge. That ridge is the reason the ruin above it has stayed dry.",
 "track.imperial-fringe.onkobra-kwama-mine":
   "The path to the mine crosses the spoil bank the mine itself threw up; digging through spoil to flatten it would only put it back on the path.",
 "track.dunmer-north.the-shut-village":
   "The village was shut and the ground has moved since. The path now steps over a slump face. Too few people use it for a cut to be worth the work.",
 "track.dunmer-north.the-divers-landing":
   "The landing is at the foot of a bank the divers keep clear for the water below it, so the path comes down on steps instead of a ramp cut into the bank.",
 "track.dunmer-north.the-last-landing":
   "A lip of old quay stone stands proud where the path meets the junction. It is a single step. Prising it out would take the quay edge with it.",
 "track.imperial-fringe.stonewastes":
   "The stonewastes are slabs on edge with soil between them. The track goes over the slabs because under them there is nothing to cut.",
 "track.pirate-freeholds.careening-hard":
   "The hard is a beach and the path to it drops off the last raised bank; the bank is what keeps the tide out of the yard behind it.",
 "track.pirate-freeholds.rim-pass-station":
   "The station watches the pass from a step of rock. The path takes that step in one rise rather than notching the lookout's own footing.",
 "track.pirate-freeholds.upriver-hist-village":
   "A root ridge crosses the path close to the village. The roots are the village's own Hist ground, which the villagers do not cut.",
 "track.imperial-fringe.the-stone-talkers-watch":
   "The watch is reached over old paving that has heaved into low steps. The track steps up the paving and leaves it whole.",
 "track.imperial-fringe.marcians-terrace":
   "Marcian's terrace is built ground. The path uses the terrace's own stair line rather than trenching the face that holds the soil.",
 "track.hist-heartland.porter-relay-poling":
   "The porters' path is short and crosses one root buttress; the buttress is living wood and is walked over on a deck.",
 "track.dunmer-north.nine-marks":
   "The marks stand along a bank above the flats. The path climbs the bank once to reach them; below it the ground is under water half the year.",
 "track.dunmer-north.nine-fords":
   "The track leaves the water between the fords and goes over a shoulder of higher ground. That shoulder is what holds the two fords apart.",
 "track.dunmer-north.the-veterans-ridge":
   "The ridge track holds the crest because the ground on both sides drains into the marsh, so where the crest steps up, the track steps up with it.",
 "track.pirate-freeholds.reoccupied-fort":
   "The fort's old ditch and rampart still stand at the junction end. The path crosses the rampart on a step rather than breaking the earthwork.",
 "route.road.thorn-tear-road":
   "The Thorn road climbs out of the Tear valley on a shoulder of rock rather than mud. A cut deep enough to hold the trunk cap would undercut the shoulder along its whole length.",
 "track.hist-heartland.heretic-stone-restarted":
   "The way to the restarted stone crosses two low root shelves in the last kilometre. Those shelves are why the stone was set where it stands.",
 "track.dunmer-north.saltmarch-village":
   "One old sea wall stands between the village and its track. It still holds the tide off the village ground.",
 "route.road.alten-corimont-stormhold":
   "Mid-route the road crosses a rock sill between two basins. The sill is narrow. Cutting it would drain one basin into the other.",
 "route.road.blackrose-lilmoth":
   "Near the junction the road lifts onto the causeway bank above the fen. For a kilometre either side, that bank is the dry ground.",
 "route.road.gideon-blackwood-road":
   "The Blackwood road crosses the border ridge where the ridge is thinnest. Even there it is stone, so the trunk cap is held on built decks rather than by quarrying the crossing.",
 "route.road.gideon-stormhold":
   "Two short sills interrupt an otherwise level run. Each is a single span's worth of rock across the road.",
 "route.road.archon-gideon":
   "The road out of Archon steps up twice onto old field walls near Gideon. Those walls still divide worked land.",
 "track.imperial-fringe.onkobra-field-station":
   "The field station is a hut on the bank above the workings. Its last few metres come up that bank in one step.",
 "route.road.gideon-soulrest":
   "One sill of rock sits in the road close to the Gideon end. It is low enough for a span to clear it.",
}


def _why(way_id: str) -> str:
    """The authored sentence for a way. A way that reaches here without one is
    a defect, not a default: someone has to look at the ground and write it."""
    try:
        return WHY[way_id]
    except KeyError:
        raise KeyError(
            f"no authored `why` for {way_id}: grading has produced a new "
            "survivor, so add its sentence to WHY in this module") from None


def _refresh(st: dict, ways_by_id: dict, heights: np.ndarray) -> dict:
    """Re-measure one authored window and re-choose its kind and piece."""
    way = ways_by_id[st["wayId"]]
    pts = resample(way["px"])
    ds = np.maximum(np.hypot(*np.diff(pts, axis=0).T) * RAW_M, 1e-6)
    chain = np.concatenate([[0.0], np.cumsum(ds)])
    z = sample_bilinear(heights, pts[:, 0], pts[:, 1])
    i0 = min(int(np.searchsorted(chain, st["fromM"])), len(z) - 1)
    i1 = min(int(np.searchsorted(chain, st["toM"])), len(z) - 1)
    out = dict(st)
    out["riseM"] = round(float(z[i1] - z[i0]), 2)
    out["kind"] = _kind(st["toM"] - st["fromM"], out["riseM"], st["worstDeg"],
                        GRADIENT_CAP_KIND[st["wayId"]])
    out["pieceRef"] = FAMILIES[st["family"]][KIND_ROLE[out["kind"]]]["asset"]
    out["why"] = _why(st["wayId"])          # the sentence is authored here, not stored
    return out


def _family(way_id: str) -> str:
    if way_id.startswith("route.road."):
        return ROAD_FAMILY
    region = way_id.split(".")[1]
    return FAMILY_BY_REGION[region]


def _kind(length_m: float, rise_m: float, worst_deg: float, way_kind: str) -> str:
    """The piece the defect asks for, from its measured shape.

    A short, low defect is a lip: one step or one deck piece over it. A long
    climb is a stepped ascent (flights broken by landings). A steep, shorter
    climb is a single flight of stairs. Anything else is a gap in the ground
    the way has to cross flat: a deck, or on a published road a bridge.

    A published road is spanned, not stepped, wherever a span will hold the
    deck cap — carts use it. Where the ground under the window is steeper than
    that (the Thorn-Tear climb is the only real case), the road is stepped:
    Imperial engineering does build a stepped ramp up a rock shoulder, and a
    stepped road stretch is the honest record of what a cart faces there.
    """
    grade_deg = math.degrees(math.atan(abs(rise_m) / max(length_m, 1e-6)))
    deck = "bridge" if way_kind in ("road", "trunk_road") else "deck"
    if way_kind in ("road", "trunk_road"):
        if grade_deg >= DECK_MAX_GRADE_DEG:
            return "stepped-ascent"
        return "lip-step" if length_m <= 30.0 else deck
    if length_m <= 30.0 and abs(rise_m) <= min(4.0, 0.19 * length_m):
        return "lip-step"
    if grade_deg >= DECK_MAX_GRADE_DEG or worst_deg >= 28.0:
        return "stepped-ascent" if length_m > 120.0 else "stair"
    if length_m > 120.0 and abs(rise_m) >= 8.0:
        return "stepped-ascent"
    return deck


def merged_stretches(way: dict, stretches: list[dict], cap: float,
                     heights: np.ndarray) -> list[dict]:
    """Over-cap stretches merged into structure windows, with the ground rise
    each window has to carry."""
    # Every stretch over the cap, not just the ones over the report's
    # cap + 1 survivor threshold: a way is only "covered" when nothing over-cap
    # is left on it.
    over = [s for s in stretches if s["worstDeg"] > cap]
    out: list[dict] = []
    for s in over:
        if out and s["fromM"] - out[-1]["toM"] < AUTHOR_MERGE_GAP_M:
            out[-1]["toM"] = s["toM"]
            out[-1]["worstDeg"] = max(out[-1]["worstDeg"], s["worstDeg"])
        else:
            out.append({"fromM": s["fromM"], "toM": s["toM"], "worstDeg": s["worstDeg"]})
    if not out:
        return []
    pts = resample(way["px"])
    ds = np.maximum(np.hypot(*np.diff(pts, axis=0).T) * RAW_M, 1e-6)
    chain = np.concatenate([[0.0], np.cumsum(ds)])
    z = sample_bilinear(heights, pts[:, 0], pts[:, 1])
    for w in out:
        i0 = int(np.searchsorted(chain, w["fromM"]))
        i1 = min(int(np.searchsorted(chain, w["toM"])), len(z) - 1)
        w["riseM"] = round(float(z[i1] - z[i0]), 2)
    return out


GRADIENT_CAP_KIND: dict[str, str] = {}      # wayId -> class, filled by author()


def author(stretch_doc: dict, ways_by_id: dict, heights: np.ndarray,
           survivors: set[str], prior: list[dict] | None = None) -> dict:
    """Existing structures are kept and added to, never replaced.

    Exempting a structure's window moves the profile at its landings, which can
    expose a short new over-cap stretch next door; the grader then reports that
    way as a survivor again. Re-running this module adds a structure for the
    new stretch and leaves the ones already authored alone, so author → grade →
    author converges instead of oscillating.
    """
    # Prior windows are kept, but their kind, rise and piece are re-derived on
    # the current surface: the record must be a pure function of the ground it
    # describes, not of the order the passes happened to run in.
    GRADIENT_CAP_KIND.update({e["wayId"]: e["kind"] for e in stretch_doc["ways"]})
    GRADIENT_CAP_KIND.update({w["id"]: w["kind"] for w in ways_by_id.values()})
    structures = [_refresh(s, ways_by_id, heights) for s in (prior or [])]
    taken: dict[str, list[tuple[float, float]]] = {}
    counts: dict[str, int] = {}
    for s in structures:
        taken.setdefault(s["wayId"], []).append((s["fromM"], s["toM"]))
        counts[s["wayId"]] = counts.get(s["wayId"], 0) + 1
    for entry in sorted(stretch_doc["ways"], key=lambda e: e["wayId"]):
        wid = entry["wayId"]
        if wid not in survivors:
            continue
        cap = GRADIENT_CAP_DEG[entry["kind"]]
        wins = merged_stretches(ways_by_id[wid], entry["stretches"], cap, heights)
        fam = _family(wid)
        slug = wid.split(".", 1)[1].replace(".", "-")
        for w in wins:
            if any(a - 0.01 <= w["fromM"] and w["toM"] <= b + 0.01
                   for a, b in taken.get(wid, [])):
                continue          # already carried by an authored structure
            counts[wid] = n = counts.get(wid, 0) + 1
            length = w["toM"] - w["fromM"]
            kind = _kind(length, w["riseM"], w["worstDeg"], entry["kind"])
            structures.append({
                "id": f"structure.{slug}.{n}",
                "wayId": wid,
                "kind": kind,
                "family": fam,
                "fromM": round(w["fromM"], 2),
                "toM": round(w["toM"], 2),
                "riseM": w["riseM"],
                "worstDeg": w["worstDeg"],
                "capDeg": cap,
                "pieceRef": FAMILIES[fam][KIND_ROLE[kind]]["asset"],
                "why": _why(wid),
                "sourcing": "kit",
            })
    structures.sort(key=lambda s: (s["wayId"], s["fromM"]))
    return {"schemaVersion": SCHEMA_VERSION,
            "_": "Authored geometry over the route stretches terrain grading "
                 "cannot fix. Generated by `python3 -m worldgen.author_route_"
                 "structures` from output/route-grading-stretches.json; the "
                 "windows are measured, the family, kind and why are authored "
                 "in that module. Compiled by worldgen.compile_route_structures.",
            "structures": structures}


def survivor_ids(report: Path) -> set[str]:
    """The survivor table in the grading report — the ways that need geometry."""
    text = report.read_text().split("## Survivors")
    if len(text) < 2:
        return set()
    return {ln.split("`")[1] for ln in text[1].split("##")[0].splitlines()
            if ln.startswith("| `")}


def main() -> None:
    from .compile_chunks import DEFAULT_HEIGHTS
    from .grade_routes import REPORT_PATH

    doc = json.loads(STRETCHES_PATH.read_text())
    # The natural (ungraded) surface: the rise a structure has to carry is the
    # rise of the ground it stands on, not of the surface grading left behind.
    # The GRADED surface: the windows are exempt from grading, so inside one
    # this is the natural ground, and at its landings it is the surface the
    # structure actually has to meet. Measuring anywhere else would put the
    # first tread above or below the path.
    heights = np.load(DEFAULT_HEIGHTS)
    prior = (json.loads(STRUCTURES_PATH.read_text())["structures"]
             if STRUCTURES_PATH.exists() else [])
    out = author(doc, {w["id"]: w for w in ways()}, heights,
                 survivor_ids(REPORT_PATH), prior)
    STRUCTURES_PATH.parent.mkdir(parents=True, exist_ok=True)
    STRUCTURES_PATH.write_text(json.dumps(out, indent=2, sort_keys=True) + "\n")
    print(f"{len(out['structures'])} structures -> {STRUCTURES_PATH}")


if __name__ == "__main__":
    main()
