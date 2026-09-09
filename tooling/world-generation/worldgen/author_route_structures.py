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
from collections import Counter
from pathlib import Path

import numpy as np

from .compile_route_structures import FAMILIES, KIND_ROLE
from .grade_routes import (GRADIENT_CAP_DEG, STRETCHES_PATH, STRUCTURES_PATH,
                           resample, sample_bilinear, ways)
from .scale import RAW_M

SCHEMA_VERSION = 1
CHAINAGE_TOLERANCE_M = 0.05

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
    # The mercantile coast builds on piles, not stone (placement principles
    # §677 puts it under `argonian-stilt`: boardwalk spine, timber piles,
    # stone explicitly not its material), and `root-timber` is the only
    # authored free-standing piled walkway in FAMILIES. It therefore serves
    # two regions for now; it splits cleanly if the coast ever gets its own
    # quay-timber kit.
    "mercantile-coast": "root-timber",
    # The penal south builds nothing private: the Rose, the causeway and
    # Vaunting's magazine are Empire work by convict labour, and module 97
    # puts both Imperial regions in the same kit set. A fort-wall variant of
    # `stone-civic` is where a future split belongs, not a new family.
    "imperial-penal-south": "stone-civic",
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
 "route.road.stormhold-thorn":
   "Two kilometres out of Stormhold the road meets a knee-high ledge in the reed flat and takes it in three paces. A bench long enough for the trunk cap would spread its fill across the flat, so the ledge is climbed on a short ramped terrace.",
 # Written 2026-09-08 against the survivors the 0047 re-carve produced, and
 # reviewed by a separate agent under the style guide. Each one is about the
 # place and its landform rather than a measured stretch, so a re-grade that
 # moves the stretch does not make the sentence false.
 "track.dunmer-north.cut-in-the-wall":
   "The cuttings are the ravine wall. The way to them runs on the face at the wall's own gradient, because a bench cut wide enough here would take the front off a house.",
 "track.dunmer-north.hissmir":
   "The approach comes down off the firm ground onto the water head. Hissmir has to stay reachable by people arriving without a guide, so the drop is built rather than dug into a bank that the wet season would take back.",
 "track.dunmer-north.hutan-tzel":
   "The village stands on the rock shelf that no flood has reached. The way onto it steps up the shelf edge. Cutting that edge down would remove the ground on which the village stands.",
 "track.dunmer-north.names-the-year":
   "The naming ground is one flat meadow and the path comes up onto it off the low bank at its edge. The bank is stepped rather than cut back into the meadow.",
 "track.dunmer-north.the-ash-holding":
   "The compound went down into its own cellars in a single wet season. The path crosses the lip of that collapse, which will move again if anyone cuts it.",
 "track.dunmer-north.the-first-count":
   "The cut goes down three levels and the dead are in its sides. The path takes the terrace lip in one step rather than opening the burial.",
 "track.dunmer-north.the-northern-rest":
   "The rest house sits below the causeway and the path drops to it off the causeway bank. That bank carries the road, so the drop is stepped rather than cut.",
 "track.dunmer-north.the-two-gate-bridge":
   "The span sits on rock abutments with a gate house on each. The last paces at either end come up onto the abutment in one step, because cutting it would take the footing of the gate house above.",
 "track.dunmer-north.the-white-pans":
   "The pans lie below the rock bar and the path comes down over it. The bar keeps the sea off the salt, so it is stepped over and not breached.",
 "track.dunmer-north.wolk-market":
   "The market stands on firm ground above two months of flood each year. Where the track meets that ground the track is stepped up rather than notched into the bank.",
 "track.hist-heartland.tended-xanmeer-pilgrim-way":
   "The pilgrims sweep the terraces. No other repair is done. Where the way crosses a terrace lip it goes over on timber, because the lip is xanmeer masonry.",
 "track.imperial-fringe.fort-swampmoth":
   "The fort holds the ridge end above the road. The last drop to its gate is the ridge's own face, left as it stands.",
 "track.imperial-fringe.giovesse-lines":
   "The lines are banks and ditches that still hold the shape in which they were cut. Farmers quarry them for road metal. The path goes over them at their steepest rather than through their fill.",
 "track.imperial-fringe.mile-house-of-the-eagle":
   "The mile house takes the last drained ground before the plain. Its yard wall stands on that lip, so the road comes up in one step.",
 "track.imperial-fringe.slough-point":
   "The station weighs goods between the cart and the boat, so it stands on the bank at the head of the reach. The way down to the water crosses that bank on deck. A cut through the bank would let the reach into the weighing yard.",
 "track.imperial-fringe.the-drowned-mule":
   "The house is the last firm ground before the road drowns. The path off it comes down to the water's edge on built steps, since the flood takes that bank first.",
 "track.imperial-fringe.the-hollow-pass-station":
   "The station is down in the hollow and the path to it comes over the saddle's lip. Cutting the lip would open the hollow to the wind. Shelter from three sides of wind is why the station stands here.",
 "track.imperial-fringe.the-pass-shelter":
   "The shelter has rock at its back and nothing draining above it. The path reaches it over that same rock, since a cut here would bring the pass's water down onto the shelter's dry wall.",
 "track.imperial-fringe.the-ravine-doors":
   "The two shelves are the streets and the bedding plane carries them. The way between them is built against the wall, because cutting the plane would drop the upper street onto the lower one.",
 "track.pirate-freeholds.trunk-road-tradehouse":
   "Mile Twelve sits on a bend of firm ground above the gorge. The trunk reaches it along the gorge shoulder, where anything cut goes over the edge instead of leaving a bench.",
 "track.dunmer-north.branchmont":
   "Branchmont's saltrice ground is flooded and drained by its own sluices. The field banks carry the dry line to the crossing. The track goes up and over them; a cut would let one field into the next.",
 "track.dunmer-north.cut-and-stack":
   "The cutters take the peat in strips and leave baulks standing between them, because the workings have burnt underground twice. The way down off the bank keeps to a face that the cutters have already opened.",
 "track.dunmer-north.silyanorn-diggings":
   "The diggings are the ravine wall below Stormhold, with the crystal in Ayleid galleries that open straight out of the face. Stone and crystal come down from the terraces on built stair and hoist. Cutting a road into the face would take the roofs off the galleries and put the ravine's water into them.",
 "track.dunmer-north.stands-on-the-island":
   "The hammock is an acre of soil inside a ring of trees. The marsh around it is too soft for walking and too shallow for a boat. The way comes up onto the soil at the landing stage, where the ground begins.",
 "track.dunmer-north.tearmouth":
   "Tearmouth is the head of deep-draught navigation and its stone quay stands the full height of the bank. The approach runs level along the top and drops to the wharf in one pitch against the quay wall. That wall holds the keels alongside.",
 "track.dunmer-north.the-ash-causeway":
   "The causeway is Dres stone laid along a buried gravel ridge. The ridge is the firm ground under four kilometres of sink. Where the footpath leaves the causeway it steps down off the bank rather than breaking an edge that both ends pay to keep.",
 "track.dunmer-north.the-fish-boon-ground":
   "The feast ground is a gravel flat that the river scours afresh each year. The flat is left clear. The path drops to it over the old weir footing, which the flood has not moved.",
 "track.dunmer-north.the-north-border-post":
   "The post takes the first level ground below the pass, where traffic off the road is stopped and counted. The slope above it stands steep to the gate, so the path steps off it in one drop.",
 "track.dunmer-north.the-salt-and-shell":
   "The tradehouse stands above its own cellar at the crossroads. The cellar is deeper than the house is tall. The path comes down to the beast lines in one step rather than through the ground into which the cellar is cut.",
 "track.imperial-fringe.bone-road-waystation":
   "The bones are carried by hand from stage to stage, not by cart. This stage is a day's carry from the marsh edge. The long drop to it is built the whole way, because bearers with a burden on their shoulders cannot take a slope on trust.",
 "track.imperial-fringe.moonmarch-ground":
   "The ground is the dry flat below the break in the rim. The keepers leave it unbuilt, with post holes from every march still in the turf. The path comes through the break itself, at the break's own gradient.",
 "track.imperial-fringe.reedcutters-toll":
   "The bridge is village timber on driven piles and its deck is kept low, so the road comes down to it through the reed beds on more of the same. The banks here are reed and mud, too soft for a cut.",
 "track.imperial-fringe.westfield-village":
   "Westfield lies on the western apron of the saddle and its fields are held dry by sluices and drains. The track steps down through them along the field banks, which stand higher than the crop ground on either side.",
 "track.mercantile-coast.ixtaxh-xanmeer":
   "Only the top chamber of the xanmeer still stands above the silt. The divers go down its outer face, which is masonry and vertical. Every doorway is below that line.",
 "track.mercantile-coast.lighter-flotilla":
   "The lighter crews live afloat at their moorings. Their ground is the bank where the shore boat lands. The tide undercuts that bank twice a day, so the way down it is built out over the face rather than dug into it.",
 "track.mercantile-coast.moonmarch":
   "The Khajiit landing sits outside Lilmoth's tariff line and takes its goods straight off the water. The path up from it climbs the low headland in one rise. That headland shelters the mooring.",
 "track.pirate-freeholds.chasecreek":
   "Chasecreek is a rise of firm ground with a creek behind it. Boats lie in the creek out of sight of the channel. The path climbs the rise whole, because a notch in the bank would show the masts from the water.",
 "track.pirate-freeholds.rockpoint":
   "Rockpoint has one land approach and the bank there was steepened by hand to hold it. The stone footings of the old landing are still in the slope. The way up goes over them.",
 "track.dunmer-north.hixinoag":
   "The village keeps two or three moorings and moves between them as the water suits. The posts stay in place. Tackle, planks and stores move with the boats. Where the caravan path comes off the firm bank onto the mooring ground it is built, because the bank is the route's ground rather than the village's.",
 "track.dunmer-north.sings-for-the-pipes":
   "Six spring-fed ponds hold six temperatures, kept apart by the banks and sluices between them. The path up from the ponds climbs one of those banks. A cut would put one pond's water into the next and lose thirty years of selection.",
 "track.imperial-fringe.claywater-station":
   "The road reaches the water point level. The boat channel is cut square into the clay and the Argonian landing faces that cut with stone. The way down to the boats crosses the facing rather than breaking it.",
 "track.imperial-fringe.red-cart-yard":
   "The yard is the last hard standing before the ground goes soft, so freight changes carriers here. Its edge stands above the porters' path and is kept hard for loaded carts. The drop off it is stepped rather than cut back into the standing on which the carts turn.",
 "track.pirate-freeholds.flu-cairn-field":
   "The cairns stand on the ridge end above the village, on dry ground with loose stone to hand. The path to the village runs down the length of that slope, built the whole way. A bench cut into the slope would take the cairns with it. Strangers have re-stacked the piles for six hundred years.",
 "track.imperial-penal-south.rose-supply-town":
   "Vaunting holds the last firm ground on the causeway road, with its walled magazine behind it. The barge landing sits below the causeway bank. The way down to it steps off that bank, which carries the road along which the Rose is supplied.",
}


def _why(way_id: str) -> str | None:
    """The authored sentence for a way, or None when nobody has written it.

    A way that reaches here without one is a defect, not a default: someone has
    to look at the ground and write it. The miss does not stop the rebuild —
    `author` emits the record marked `unauthored`, prints the whole set with
    each way's measured shape, and the test gate keeps it red until the
    sentences are written."""
    return WHY.get(way_id)


def _mark(rec: dict) -> dict:
    """Flag a record the authoring tables do not yet cover.

    An unauthored survivor is still EMITTED with its measured window: the
    grader needs the exclusion window or its second pass cuts the hillside the
    structure was meant to stand on (that is what broke 1944 E / 211 S). The
    debt is carried on the record and gated by
    `test_route_structure_authoring.py`, not by stopping the rebuild."""
    if rec["why"] is None or rec["family"] is None:
        rec["unauthored"] = True
    return rec


def _refresh(st: dict, ways_by_id: dict, heights: np.ndarray) -> dict:
    """Re-measure one authored window and re-choose its kind and piece."""
    way = ways_by_id[st["wayId"]]
    pts = resample(way["px"])
    ds = np.maximum(np.hypot(*np.diff(pts, axis=0).T) * RAW_M, 1e-6)
    chain = np.concatenate([[0.0], np.cumsum(ds)])
    z = sample_bilinear(heights, pts[:, 0], pts[:, 1])
    out = dict(st)
    out["riseM"] = _window_rise(chain, z, st["fromM"], st["toM"])
    out["kind"] = _kind(st["toM"] - st["fromM"], out["riseM"], st["worstDeg"],
                        GRADIENT_CAP_KIND[st["wayId"]])
    fam = _family(st["wayId"])
    out["family"] = fam
    out["pieceRef"] = (FAMILIES[fam][KIND_ROLE[out["kind"]]]["asset"]
                       if fam is not None else None)
    out["why"] = _why(st["wayId"])          # the sentence is authored here, not stored
    out.pop("unauthored", None)
    return _mark(out)


def _window_rise(chain: np.ndarray, z: np.ndarray,
                 from_m: float, to_m: float) -> float:
    """Measure a window at its exact authored endpoints.

    The structure compiler interpolates the route profile at ``fromM`` and
    ``toM``.  Authoring must make its kind decision from those same heights;
    snapping forward to the next route sample can hide enough rise to approve
    a lip-step that the compiler then correctly rejects.
    """
    start_z = float(np.interp(from_m, chain, z))
    end_z = float(np.interp(to_m, chain, z))
    return round(end_z - start_z, 2)


def _family(way_id: str) -> str | None:
    """The family that builds there, or None when the region has no entry —
    a guess would be a culture invented for a track. Emitted unauthored."""
    if way_id.startswith("route.road."):
        return ROAD_FAMILY
    return FAMILY_BY_REGION.get(way_id.split(".")[1])


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
        w["riseM"] = _window_rise(chain, z, w["fromM"], w["toM"])
    return out


GRADIENT_CAP_KIND: dict[str, str] = {}      # wayId -> class, filled by author()


def _way_length_m(way: dict) -> float:
    """Current resampled chainage length for a published route."""
    pts = resample(way["px"])
    if len(pts) < 2:
        return 0.0
    return float(np.hypot(*np.diff(pts, axis=0).T).sum() * RAW_M)


def _reconcile_prior_windows(prior: list[dict], ways_by_id: dict) \
        -> tuple[list[dict], list[tuple[dict, str]], list[tuple[dict, float]]]:
    """Bind carried windows to the current geometry of their named way.

    A minor route may keep its stable id while a terrain rebuild replaces its
    polyline. Raw chainage beyond the new endpoint does not name ground on the
    current route and therefore cannot remain authored structure evidence.
    Windows crossing the endpoint are clipped to that measured endpoint; a
    window starting there is dropped rather than compiled as zero pieces.
    """
    kept: list[dict] = []
    dropped: list[tuple[dict, str]] = []
    clipped: list[tuple[dict, float]] = []
    for stored in prior:
        way = ways_by_id.get(stored["wayId"])
        if way is None:
            dropped.append((stored, "way no longer exists in the current route set"))
            continue
        end_m = _way_length_m(way)
        start_m = float(stored["fromM"])
        to_m = float(stored["toM"])
        if start_m >= end_m - CHAINAGE_TOLERANCE_M:
            dropped.append((
                stored,
                f"window starts at {start_m:.2f} m but the current route ends at {end_m:.2f} m",
            ))
            continue
        current = dict(stored)
        if to_m > end_m:
            endpoint = round(end_m, 2)
            if endpoint < to_m:
                current["toM"] = endpoint
                clipped.append((stored, end_m))
        kept.append(current)
    return kept, dropped, clipped


def _highest_suffix_by_way(structures: list[dict]) -> dict[str, int]:
    """The largest numeric id suffix already issued on each way."""
    highest: dict[str, int] = {}
    for s in structures:
        suffix = str(s["id"]).rsplit(".", 1)[-1]
        used = int(suffix) if suffix.isdigit() else 0
        highest[s["wayId"]] = max(highest.get(s["wayId"], 0), used)
    return highest


def author(stretch_doc: dict, ways_by_id: dict, heights: np.ndarray,
           survivors: set[str], prior: list[dict] | None = None) -> dict:
    """Valid existing structures are kept and new measured windows are added.

    Numbering continues from the HIGHEST suffix already issued on each way, not
    from the count of survivors: when an earlier pass dropped a structure,
    counting survivors restarts the numbering inside the range already in use
    and a new structure silently takes a kept structure's id. That shipped —
    ten duplicate ids across five ways in `route-structures.json`, found
    2026-09-09 when the bundle exporter refused them.

    Exempting a structure's window moves the profile at its landings, which can
    expose a short new over-cap stretch next door; the grader then reports that
    way as a survivor again. Re-running this module adds a structure for the
    new stretch and leaves still-valid authored windows alone, so author →
    grade → author converges instead of oscillating. A re-routed way is the
    exception: chainage at or beyond its new endpoint no longer names ground.
    """
    # Prior windows are kept, but their kind, rise and piece are re-derived on
    # the current surface: the record must be a pure function of the ground it
    # describes, not of the order the passes happened to run in.
    GRADIENT_CAP_KIND.update({e["wayId"]: e["kind"] for e in stretch_doc["ways"]})
    GRADIENT_CAP_KIND.update({w["id"]: w["kind"] for w in ways_by_id.values()})
    # A stored structure whose way disappeared, or whose raw chainage is past
    # a re-routed way's new endpoint, cannot be built. Reconcile it loudly;
    # keeping the same way id is not evidence that old chainage still exists.
    kept, dropped, clipped = _reconcile_prior_windows(prior or [], ways_by_id)
    for s, reason in dropped:
        print(f"dropped stored structure {s['id']}: {reason}")
    if dropped:
        print(f"{len(dropped)} stored structures dropped "
              f"({len({s['wayId'] for s, _reason in dropped})} changed/missing ways)")
    for s, end_m in clipped:
        print(f"clipped stored structure {s['id']} from {float(s['toM']):.2f} m "
              f"to current route endpoint {end_m:.2f} m")
    structures = [_refresh(s, ways_by_id, heights) for s in kept]
    taken: dict[str, list[tuple[float, float]]] = {}
    counts = _highest_suffix_by_way(structures)
    for s in structures:
        taken.setdefault(s["wayId"], []).append((s["fromM"], s["toM"]))
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
            structures.append(_mark({
                "id": f"structure.{slug}.{n}",
                "wayId": wid,
                "kind": kind,
                "family": fam,
                "fromM": round(w["fromM"], 2),
                "toM": round(w["toM"], 2),
                "riseM": w["riseM"],
                "worstDeg": w["worstDeg"],
                "capDeg": cap,
                "pieceRef": (FAMILIES[fam][KIND_ROLE[kind]]["asset"]
                             if fam is not None else None),
                "why": _why(wid),
                "sourcing": "kit",
            }))
    structures.sort(key=lambda s: (s["wayId"], s["fromM"]))
    counted = Counter(s["id"] for s in structures)
    collisions = sorted(sid for sid, n in counted.items() if n > 1)
    if collisions:
        raise ValueError("route structure ids must be unique (engineering standard 1); "
                         f"duplicated: {', '.join(collisions)}")
    unauthored = [s for s in structures if s.get("unauthored")]
    if unauthored:
        print(f"{len(unauthored)} structures on "
              f"{len({s['wayId'] for s in unauthored})} ways are UNAUTHORED "
              "(emitted with their measured window so the grader excludes "
              "them; gated by test_route_structure_authoring):")
        for s in unauthored:
            miss = ("no family for its region" if s["family"] is None
                    else "no authored `why`")
            print(f"  {s['id']}: {miss}; length {s['toM'] - s['fromM']:.1f} m, "
                  f"rise {s['riseM']:.2f} m, worst gradient {s['worstDeg']:.2f} deg")
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
