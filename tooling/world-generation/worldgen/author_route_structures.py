"""Author the route-structure records from the measured over-cap stretches.

    cd tooling/world-generation
    python3 -m worldgen.derive_crossings        # writes world/sources/routes/water-crossings.json
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

from .compile_route_structures import FAMILIES, KIND_ROLE, measure_window, ramp_ok
from .grade_routes import (GRADIENT_CAP_DEG, STRETCHES_PATH, STRUCTURES_PATH,
                           resample, sample_bilinear, ways)
from .scale import RAW_M

SCHEMA_VERSION = 1
CHAINAGE_TOLERANCE_M = 0.05

# Two over-cap stretches closer together than this are one structure: a flight
# does not stop and restart across ten metres of level ground. It decides
# flights only; a span's length is its crossing's bank-to-bank distance.
AUTHOR_MERGE_GAP_M = 60.0

# --------------------------------------------------------------------------
# THE CROSSING RECORD DECIDES WHAT IS BUILT (decision 0068; owner 2026-09-16)
# --------------------------------------------------------------------------
# A span exists to cross WATER, and where a road meets water is already on
# the record: `derive_crossings` writes the entity, its width, its depth,
# its band and the two dry banks. So the spans are authored FROM that
# record, bank to bank, whether or not the grader flagged the window:
#
#   ferry band            -> NOTHING is built. A ferry is a service, not
#                            geometry; the window is reported and whether a
#                            boat serves it is read from travel-services.json.
#   marsh (any band)      -> a boardwalk deck on its own posts, at any length.
#   river/lake, span band -> a bridge.
#   river/lake, ford band -> nothing: the road goes through the water.
#
# The grader's over-cap windows are the OTHER kind of structure: a flight of
# steps, a stepped ascent or a lip step over dry ground a route-grade patch
# could not take. A dry window is never a span (owner 2026-09-16: the map
# showed bridges where there was no water; the old rule bridged any dip
# deeper than one deck thickness, and 25 of 29 published spans crossed
# nothing). A window that overlaps a crossing's banks is the crossing's and
# is not authored twice.
#
# Determinism (standard 6): the file is a pure function of the ground, the
# roads and the crossings; nothing stored is carried forward.
#: A boardwalk over a fen is Argonian root-timber work wherever it runs, so a
#: marsh deck on an Imperial road is built from the family that already chains
#: a walkway on its own posts (`root-passerelle`) rather than from a stone
#: arch. No new piece: this is the family the tracks already use.
MARSH_DECK_FAMILY = "root-timber"
_REPO_ROOT = Path(__file__).resolve().parents[3]
CROSSINGS_PATH = _REPO_ROOT / "world" / "sources" / "routes" / "water-crossings.json"
SERVICES_PATH = _REPO_ROOT / "world" / "sources" / "routes" / "travel-services.json"


def load_crossings(path: Path | None = None) -> list[dict]:
    """The derived water crossings, or [] where they have not been derived."""
    path = CROSSINGS_PATH if path is None else path
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8")).get("crossings", [])


def crossings_by_way(rows: list[dict]) -> dict[str, list[dict]]:
    """way id -> the crossings that stand on it (`servesRoutes`)."""
    out: dict[str, list[dict]] = {}
    for r in rows:
        for wid in r.get("servesRoutes") or []:
            out.setdefault(wid, []).append(r)
    return out


def ferry_services(path: Path | None = None) -> dict[str, str]:
    """crossing id -> the travel service that serves it, from the authored
    record. A ferry window with no row here is a plot call, not a structure."""
    path = SERVICES_PATH if path is None else path
    if not path.exists():
        return {}
    doc = json.loads(path.read_text(encoding="utf-8"))
    out: dict[str, str] = {}
    for svc in doc.get("services") or []:
        cid = (svc.get("crossing") or {}).get("id")
        if cid:
            out[cid] = svc["id"]
    return out


def _bank_chainage(crossing: dict, chain: np.ndarray, xs: np.ndarray,
                   zs: np.ndarray) -> tuple[float, float]:
    """The crossing's two dry bank points, projected onto the way's chainage.

    The banks are world metres; the way is resampled exactly as the compiler
    resamples it (`_chain_and_z`), so the nearest sample to each bank names the
    chainage the crossing occupies on this way.
    """
    cs = []
    for bx, bz in crossing.get("banks") or []:
        k = int(np.argmin(np.hypot(xs - float(bx), zs - float(bz))))
        cs.append(float(chain[k]))
    if not cs:
        return (0.0, 0.0)
    return (min(cs), max(cs))


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
    # Added 2026-09-09. Both are Argonian regions with no authored kit of their
    # own, so they take the reasoning already recorded above for the mercantile
    # coast: `root-timber` (the BM&V passerelle set) is the only authored
    # free-standing Argonian piled walkway in FAMILIES. Each splits out cleanly
    # if a deeps or a coast kit is ever sourced.
    "naga-kur-deeps": "root-timber",
    "saxhleel-coast": "root-timber",
}
ROAD_FAMILY = "stone-civic"

# One authored sentence per survivor way (standard 12: prose written against
# the record, promising nothing the typed fields cannot show).
#
# AN ENTRY HERE IS DORMANT UNTIL ITS WAY CARRIES A STRUCTURE. Over-cap windows
# are measured on ground that moves, and `compile_minor_routes` re-solves and
# occasionally renames ways, so at any moment about half these keys name a way
# with nothing built on it — and 16 name a way the current route set does not
# have at all. A dormant sentence publishes nothing and breaks no standard;
# deleting it would throw away reviewed prose that the next re-solve asks for
# again. What standard 12 does require is checked here and in the audit that
# produced the 2026-09-09 rewrites: every sentence attached to a LIVE structure
# must describe the obstacle that structure's own measurement shows.
#
# REWRITTEN 2026-09-09, thirteen of them, after the span windows were trimmed
# to their measured obstacles. The old sentences described rock sills, border
# ridges, field walls and knee-high ledges; the trimmed record shows that what
# the province's road spans actually cross is standing water, one to two and a
# half metres of it, tens of metres wide. `route.road.gideon-blackwood-road`
# was the worst: it claimed to cross "the border ridge where the ridge is
# thinnest" over 126 chained deck pieces laid down a continuous dry hillside.
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
   "The marks stand along a bank above the flats, which lie under water for much of the year. The path climbs the bank to reach them. It is carried on deck wherever standing water lies over its line.",
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

 "route.road.blackrose-lilmoth":
   "Near the junction the road runs along a ridge of firm ground above the fen. For a kilometre either side, that ridge is the dry ground.",
 "route.road.gideon-blackwood-road":
   "The Blackwood road crosses the flood ground between Gideon and the border. Water lies over that ground for half the year, in sheets tens of metres wide. The road is carried above it on deck.",
 "route.road.gideon-stormhold":
   "The Gideon road to Stormhold runs level the whole way. It meets water instead of rock. Channels stand across it at intervals, a metre or so deep and far wider than that. The road goes over them on deck.",
 "route.road.archon-gideon":
   "The Archon road reaches Gideon across worked land that still holds water between its drains. Those channels cut across the line of the road. A cart cannot take a ford every mile, so each channel is spanned.",
 "track.imperial-fringe.onkobra-field-station":
   "The field station is a hut on the bank above the workings. Its last few metres come up that bank in one step.",
 "route.road.gideon-soulrest":
   "Two channels cross the road between Gideon and Soulrest. Each is about a metre deep and some tens of metres wide. The road is carried over both.",
 "route.road.stormhold-thorn":
   "The Stormhold road to Thorn runs the length of the reed flats. The flats hold water the whole way. The road is spanned wherever that water stands deep enough to stop a cart.",
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
   "Westfield lies on the western apron of the saddle and its fields are held dry by sluices and drains. The track steps down through them along the field banks. Where the ground falls away between two banks the track is carried across rather than filled.",
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
 # Written 2026-09-09 against the place catalogue records for the survivors of
 # that day's re-carve. Each sentence is about the place and the ground it
 # stands on, not about a measured stretch, so a re-grade that moves the window
 # leaves the record true.
 "track.dunmer-north.greylight-village":
   "Greylight stands on a firm hummock in the Shadowfen channels, with no other hummock within half a day. The way in runs the length of the hummock's flank and steps up onto it at the edge. Cutting that edge back would take the dry ground on which the village sits.",
 "track.dunmer-north.murkwater":
   "Murkwater's Hist stands on a hummock with water approaches on every side. The one dry approach climbs the hummock's shoulder. It is built as a flight rather than trenched into the bank, which keeps the channel off the roots.",
 "track.dunmer-north.the-black-stage":
   "The causeway was built out to the channel and there it stopped, because the water is too deep to bridge in stone. The path down to the ferry drops off the finished causeway head. The gang maintains that head, so the drop is stepped rather than cut through it.",
 "track.dunmer-north.the-freed-rows":
   "The shelter grew on the bank below the road, a day south of the pen yard, where the first column halted. People still arrive on foot and often at night. The drop from the road to the rows is built the whole way for that reason.",
 "track.dunmer-north.the-monsoon-boom":
   "The boom is set at the lowest crossing of the terrace country, where the water backs up first. The road comes over the last terrace lip to reach it. Cutting that lip would let the monsoon past the barrier at the point that it is meant to close.",
 "track.dunmer-north.the-ninth-chapel":
   "The chapel stands on a stone footing that the mission found ready-made, the corner of something older, which they left undug. The path comes up onto the footing at its edge. It has not been dug since.",
 "track.dunmer-north.the-north-cut":
   "The cut was abandoned four kilometres in and is now a drainage channel. The villages quarry its metalling for their own yards and have taken it away in blocks. What is left where the path crosses is a step.",
 "track.dunmer-north.the-pen-yard":
   "The yard sits on the road below the pass, on the shelf where a column could be held overnight. Its walls stand on that shelf. The path comes up to the gate off the road below. A cut here would take the yard's own footing.",
 "track.hist-heartland.alten-markmont":
   "The station's landing was built on water deep enough for a hull, so the warehouses stand well above it on the bank. The way between the yard and the quay climbs that bank on built work. The quay face below it keeps the water alongside deep enough for a hull.",
 "track.hist-heartland.artisan-chime-makers":
   "The village is set beside a hero Hist for its wind. Every chime is tuned against the tree that will hang it. The path in crosses the tree's root ground on timber. Roots are not cut here.",
 "track.hist-heartland.beast-offering-flood-staying":
   "The shrine stands at the pinch where the flood enters the basin. The offerings are made to hold the water there. The path steps over the narrow lip rather than widening it.",
 "track.hist-heartland.bereaved-mnemic":
   "The tribe did not move when their Hist was killed, so the dead trunk is still the centre of the village and the Egg is kept inside it. The way in runs the long slope up to the trunk, built along its whole length. The roots under that slope are the tree's own.",
 "track.hist-heartland.greenspring":
   "Greenspring's water rises from a stone lip on the channel bank and can be drunk unboiled. Water that needs no boiling is rare enough here for a village to be founded on it. The path comes up over that lip. Breaking it would scatter the springs into the channel.",
 "track.hist-heartland.hist-less-refuge-wild":
   "The camp holds unclaimed ground, because no tree's roots reach it. The bank at its edge is where the roots stop. The path steps up that bank. The camp's right to its ground is disputed, so nothing here is dug.",
 "track.hist-heartland.necropolis-dead-tenders":
   "The tenders' village takes firm ground with landings, central to six tribes' pole fields and downwind of all of them. The ground is firm only where it has not been opened. The paths between the landings run on deck.",
 "track.hist-heartland.nightbound-lightless":
   "The village keeps no fire and no lamp. It stands under closed canopy where noon and midnight differ little. The climb up to it is built in flights at one rise per tread, so it can be walked by feel.",
 "track.hist-heartland.sap-tapping-licensed":
   "The stage is set on a tree designated by the assembly, one season and one tree at a time. The path to its foot steps up onto the root plate. A tapper who cuts the ground under a licensed tree loses the licence.",
 "track.hist-heartland.xal-meeruth-station":
   "The station is a stone quay, a walled yard and a magazine on firm ground, built of materials that the marsh cannot rot. The path comes up onto the quay at its edge. Squatters have kept the stonework whole for twenty years, since the stonework is the reason why the place is worth claiming.",
 "track.imperial-fringe.cassian-farm":
   "Cassian's fields sit on a loam shoulder above the flood line, with the barn on the shoulder's dry edge. The track steps up that edge. It is what has kept the barn dry since the family walked off the grant.",
 "track.imperial-fringe.hangs-above-the-water":
   "The chambers and galleries are cut and built into the gorge wall, above the worst water and below the wind. Anything that reaches them climbs the face. The village argues every year about cutting a stair.",
 "track.imperial-fringe.the-empty-steading":
   "The steading holds a firm bank at a channel junction, with its own landing, a walled yard and a well. The path up from the landing takes the bank in one step. The claim has been unsettled for four years and nothing has been dug.",
 "track.imperial-fringe.the-vellum-estate":
   "Vellum's land is drained river terrace held in one block. The drains run along the terrace edge and the track crosses them at the boundary. A cut there would put the river back into the fields.",
 "track.imperial-penal-south.basin-sinkhole":
   "The swallow is a collapse that takes a whole stream underground. Its rim is bare rock which the marsh has not filled. The path comes onto the rock and stops at the rim. The ground past the first ledge has already collapsed into the hole.",
 "track.imperial-penal-south.blackrose-drowned-hist":
   "The tree grew on the island's old shore and three centuries of raised lake have put six metres of water over its crown. The tenders go in from that same shore. The path down crosses the old bank, the last dry footing before the dive.",
 "track.imperial-penal-south.flu-mass-grave":
   "Blackrose buried the Knahaten dead here because the gravel terrace was dry enough to take that many graves at once. The graves fill the terrace. The path comes up its face rather than through it.",
 "track.imperial-penal-south.intact-fort":
   "Fort Cordon commands the narrows where the road and the water pass together. The ground in front of the wall was cut away to leave nothing standing on it. The road up to the gate takes that slope in a step. Whoever holds the fort this season keeps the slope bare.",
 "track.imperial-penal-south.lake-divers-yard":
   "The yard stands on the shore nearest the deep hole, with a crane frame and a drying floor above the water. Cargo comes up wet and heavy under the frame. The way down to the boats steps off the yard edge, which carries the frame's footing.",
 "track.imperial-penal-south.saltrice-village":
   "The village stood on flood-fed grassland and the flood has stopped receding. The grain barns' stone staddles are the last dry footing. The path climbs onto them, because the ground between them is under water.",
 "track.imperial-penal-south.three-gate-toll":
   "The toll town sits at the confluence of the three western waters, where a hull off any feeder must come past the quay. The quay stands the full height of the bank. Goods and travellers come up it at the gates. The toll families have kept that bank steep since before the current city government.",
 "track.mercantile-coast.ashfield":
   "Ashfield's ground is deep burn ash on a dry rise, with the coast road along the field edge. The road stands above the fields on the rise's lip. Ash will not hold a cut face, so the track steps up instead.",
 "track.mercantile-coast.ashroot-village":
   "Ashroot holds a rise that the peat fire did not cross. The tree's roots draw on water below the burn. The burnt ground around it is loose. The approach runs on deck across the burn and steps up onto the rise at its edge.",
 "track.mercantile-coast.hammock-crown-murkmire":
   "The crown is the highest dry ground in a wide floodplain and four villages bury in four sectors of it. Every part of the terrace belongs to one of the four. The way up comes over the crown's edge, since no village will yield an inch of its sector for a cut.",
 "track.mercantile-coast.hereguard-plantation":
   "Hereguard's rice ground is a river terrace that floods every year. The flood suits rice. The terrace carries no other crop. The bunds hold the water on the fields. Where the track meets standing water it goes over on deck rather than cutting the bund.",
 "track.mercantile-coast.mirtis-plantation":
   "Mirtis burned with its exports still in the yard and the great house has not been reoccupied. It stands on firm lowland above its river landing. The track drops off that bank to the water, where the estate's stone facing is still in the slope.",
 "track.mercantile-coast.necropolis-village-murkmire":
   "Xul-Vaat is built on peat firm enough to hold a driven pole. Pole-driving is its trade. The paths between the burial grounds cross open water on the village's own decks. Drained peat slumps under a cut face, so nothing on these paths is dug.",
 "track.mercantile-coast.oliis-boardwalk":
   "The village grew as a walkway first and the houses were hung off it afterwards, in a mangrove belt too soft for foundations and too dense for boats. There is no ground here to cut. Where the deck changes level it does so on built steps. Each household maintains its own span.",
 "track.mercantile-coast.slaughter-memorial":
   "The burial ground lies outside Lilmoth's rebuilt wall, on the firm ground large enough to hold it. The graves take the whole of that ground. The vigil path crosses it on deck rather than through the fill.",
 "track.pirate-freeholds.bone-repatriation-waystation":
   "The racks stand where the southbound road and the river both leave the freeholds, on the shoulder above the landing. Bones go down to the boats on the shoulder by hand. The whole descent is built, because a bearer under a bundle cannot take a loose slope.",
 "track.pirate-freeholds.freehold-market":
   "The stall row is level ground below the list board, one street up from the basin and clear of the wharf traffic. The step between the two keeps them clear of each other. Goods cross it on deck.",
 "track.naga-kur-deeps.wamasu-pond-adult":
   "The pond is deep still water a few hundred metres off the main poling line, held by one adult wamasu for years. The detour runs past it for its whole length. Where polers come ashore to leave offerings at the bank they climb it on built steps. They do not stay.",
 "track.saxhleel-coast.coast-hist-less-refuge":
   "Nothing-Planted holds firm ground on the city's landward fringe, deliberately outside its jurisdiction. The line between the two runs along the bank at the water narrows. The path steps up that bank.",
 # Written 2026-09-09 for the six ways left unauthored after the 1.2 m
 # resolution noise floor retired the phantom structures. Each is written
 # against the place records at the way's ends, so a re-grade that moves a
 # window leaves the sentence true.

 "route.road.soulrest-blackrose":
   "The road leaves the coastal terrace and falls into the lake basin. The fen at the bottom holds standing water all year, so the last stretch is carried over it. The fen bottom is too soft for a cut face or a fill.",
 "track.dunmer-north.riverwalk":
   "Riverwalk is strung along its channel. The channel is the street and arrivals come by boat. The land approach runs the length of the channel bank and is built the whole way, because the river takes back what is cut into that bank.",
 "track.imperial-fringe.the-counted-dead":
   "The counting ground was cut into the slope rather than dug, with the earliest counts in a chamber beneath it. The road climbs to it and drops away beyond it on built steps. A cut at either end would open the chamber.",
 "track.hist-heartland.insular-hereditary-watch":
   "The wardens hold the ridge end above a sealed xanmeer. Visitors are turned back at the top of the approach. That approach crosses the standing water below the ridge on deck. It is kept too narrow for a cart.",
 "track.mercantile-coast.keel-sakka-stilts":
   "The landing takes Lilmoth's freight off the road and onto the river. The channel edge is the deep-water face along which the boats lie, so the road reaches it without breaking it. The short rise from the water is built.",
}


#: What a piece is for, when nobody has written anything more interesting.
#:
#: OWNER RULING 2026-09-09: "I don't mind things like bridges and stairs not
#: having a written prose reason to exist. It's generally pretty obvious why
#: they exist — they're there to enable the road/path/way."
#:
#: That is right, and it retires a debt that could not be paid. An over-cap
#: window is measured on the GRADED ground, so every regrade produces a
#: different set, and a window is itself grading-exempt — so authoring one
#: changes the ground and raises another somewhere else. Six ways were written
#: and went green; the next pass produced forty on twenty-one other ways. A
#: hand-maintained table cannot win that race, and it should not have to: a
#: deck across a dip is not a mystery.
#:
#: So the default states the measured fact and nothing else — no history, no
#: builder, no motive it cannot support (engineering standard 12). The authored
#: sentences in `WHY` stay, because where somebody HAS looked at the ground the
#: reason is better than the shape: a road climbing every hummock because a
#: level bench would stand under water half the year is worth saying.
#:
#: NO EMBANKMENTS (owner, 2026-09-09): "Avoid embankments - that's more messing
#: with the terrain and is probably going to cause other issues. I'm fine with
#: spans." That is the right call and it generalises: a span is ADDITIVE
#: geometry that changes no ground, while an embankment is terrain
#: modification, and terrain modification is what drives every feedback loop
#: this pipeline has. Placing a piece must stay a thing that cannot move the
#: ground under anything else. Do not add an embankment kind.
#:
#: THE BOUNDARY, and it is narrow (owner, 2026-09-09, clarifying the ruling
#: above): "only for the specific way-carrying structures! Almost all other
#: buildings should have authored reasons still of course." This default is
#: reachable ONLY from this module, which places the pieces that carry a way
#: over ground it cannot cross on the level. Every parcel, landmark, district
#: and dock still needs its six authored answers - what it is, why it is in
#: this place, why this exact spot, why it sits with its neighbours, what it
#: gives the player, how it uses the ground - and `blueprint.py` rejects a
#: blueprint that omits one. Do not generalise this to anything a player walks
#: into.
def _default_why(way_kind: str, kind: str) -> str:
    carried = {"road": "road", "trunk_road": "road"}.get(way_kind, "way")
    piece = {"bridge": "The span carries", "deck": "The deck carries",
             "lip-step": "The step carries", "stair": "The flight carries",
             "stepped-ascent": "The stepped ascent carries"}.get(kind, "The piece carries")
    return f"{piece} the {carried} over ground it cannot cross on the level."


def _chain_and_z(way: dict, heights: np.ndarray) \
        -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """The way's chainage, world x, world z and ground profile, exactly as the
    compiler builds them (`compile_route_structures._profile`)."""
    pts = resample(way["px"])
    xs, zs = pts[:, 0] * RAW_M, pts[:, 1] * RAW_M
    z = sample_bilinear(heights, pts[:, 0], pts[:, 1]).astype(np.float64)
    chain = np.concatenate([[0.0], np.cumsum(np.hypot(np.diff(xs), np.diff(zs)))])
    return chain, xs, zs, z


def _family(way_id: str) -> str | None:
    """The family that builds there, or None when the region has no entry —
    a guess would be a culture invented for a track. Emitted unauthored."""
    if way_id.startswith("route.road."):
        return ROAD_FAMILY
    return FAMILY_BY_REGION.get(way_id.split(".")[1])


#: A window whose ground rise is smaller than this is not a defect in the
#: route, it is the two surfaces disagreeing about the same ground (the
#: router's 5.48 m grid against the grader's 1.83 m one: RMS 0.11-0.13 m,
#: worst 1.02 m, measured 2026-09-09). A crossing is exempt: a river
#: crossing is flat, and its rise is near zero by nature.
MIN_STRUCTURE_RISE_M = 1.2


def _kind(length_m: float, rise_m: float, worst_deg: float, way_kind: str) -> str:
    """The piece a DRY over-cap window asks for, from its measured shape:
    never a span (a span is authored from the crossing record, see the
    module header). A short, low defect is a lip: one step over it. A long
    climb is a stepped ascent (flights broken by landings); a steeper or
    shorter one is a single flight. `length_m` and `rise_m` must come from
    `measure_window`, the compiler's own measurement of the window, and the
    closing guard proves the kind lays no level surface on a grade the
    compiler will refuse."""
    grade_deg = math.degrees(math.atan(abs(rise_m) / max(length_m, 1e-6)))
    flight = "stepped-ascent" if length_m > 120.0 else "stair"
    if length_m <= 30.0 and abs(rise_m) <= min(4.0, 0.19 * length_m):
        kind = "lip-step"
    else:
        kind = flight
    return kind if ramp_ok(kind, grade_deg) else flight


def merged_stretches(way: dict, stretches: list[dict], cap: float,
                     heights: np.ndarray) -> list[dict]:
    """Over-cap stretches merged into structure windows, with the ground rise
    each window has to carry."""
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
    chain, _xs, _zs, z = _chain_and_z(way, heights)
    kept = []
    for w in out:
        m = measure_window(chain, z, w["fromM"], w["toM"])
        if m["spanM"] <= CHAINAGE_TOLERANCE_M:
            continue
        w["toM"] = round(m["toM"], 2)
        w["spanM"] = m["spanM"]
        w["riseExactM"] = m["riseM"]
        w["riseM"] = round(m["riseM"], 2)
        kept.append(w)
    return kept


def _way_length_m(way: dict) -> float:
    """Current resampled chainage length for a published route."""
    pts = resample(way["px"])
    if len(pts) < 2:
        return 0.0
    return float(np.hypot(*np.diff(pts, axis=0).T).sum() * RAW_M)


def _record(way_id: str, way_kind: str, n: int, kind: str, from_m: float, to_m: float,
            rise_m: float, gap_m: float, worst_deg: float, cap: float,
            family: str | None, crossing_id: str | None = None) -> dict:
    slug = way_id.split(".", 1)[1].replace(".", "-")
    rec = {
        "id": f"structure.{slug}.{n}",
        "wayId": way_id,
        "kind": kind,
        "family": family,
        "fromM": round(float(from_m), 2),
        "toM": round(float(to_m), 2),
        "riseM": round(float(rise_m), 2),
        "gapM": round(float(gap_m), 2),
        "windowFromM": round(float(from_m), 2),
        "windowToM": round(float(to_m), 2),
        "worstDeg": worst_deg,
        "capDeg": cap,
        **({"crossingId": crossing_id} if crossing_id else {}),
        "pieceRef": (FAMILIES[family][KIND_ROLE[kind]]["asset"] if family is not None else None),
        "why": WHY.get(way_id) or _default_why(way_kind, kind),
        "sourcing": "kit",
    }
    if rec["family"] is None:
        rec["unauthored"] = True
    return rec


def author(stretch_doc: dict, ways_by_id: dict, heights: np.ndarray, *,
           crossings: list[dict] | None = None,
           services: dict[str, str] | None = None) -> dict:
    """Every structure on the current ways, from the crossing record and the
    grader's dry windows (module header). A pure function of its inputs:
    ids are numbered per way in chainage order, so the same ground, roads
    and crossings give the same file."""
    by_way = crossings_by_way(crossings if crossings is not None else load_crossings())
    services = ferry_services() if services is None else services
    way_kind = {e["wayId"]: e["kind"] for e in stretch_doc["ways"]}
    way_kind.update({w["id"]: w["kind"] for w in ways_by_id.values()})
    stretches = {e["wayId"]: e["stretches"] for e in stretch_doc["ways"]}
    structures: list[dict] = []
    ferry_rows: list[dict] = []
    noise: list[str] = []
    vanished = sorted(set(stretches) - set(ways_by_id))
    for wid in sorted(ways_by_id):
        way = ways_by_id[wid]
        kind_of_way = way_kind[wid]
        cap = GRADIENT_CAP_DEG[kind_of_way]
        chain, xs, zs, z = _chain_and_z(way, heights)
        found: list[dict] = []
        taken: list[tuple[float, float]] = []
        # 1. the crossings on this way, bank to bank, from the record
        for c in by_way.get(wid, []):
            a, b = _bank_chainage(c, chain, xs, zs)
            if b - a <= CHAINAGE_TOLERANCE_M:
                continue
            taken.append((a, b))
            if c["band"] == "ferry":
                ferry_rows.append({
                    "wayId": wid, "fromM": round(a, 2), "toM": round(b, 2),
                    "crossingId": c["id"], "spanM": c["spanM"], "maxDepthM": c["maxDepthM"],
                    "water": c["water"], "entityKind": c["entityKind"],
                    "serviceId": services.get(c["id"])})
                continue
            if c["water"] != "marsh" and c["band"] == "ford":
                continue
            m = measure_window(chain, z, a, b)
            if m["spanM"] <= CHAINAGE_TOLERANCE_M:
                continue
            if c["water"] == "marsh":
                kind, fam = "deck", MARSH_DECK_FAMILY
            else:
                kind, fam = ("bridge" if kind_of_way in ("road", "trunk_road") else "deck"), _family(wid)
            found.append((m["fromM"], dict(kind=kind, fam=fam, m=m, gap=m["spanM"], worst=0.0, cid=c["id"])))
        # 2. the grader's dry windows, never a span
        for w in merged_stretches(way, stretches.get(wid, []), cap, heights):
            if any(min(w["toM"], b) - max(w["fromM"], a) > 0.0 for a, b in taken):
                continue                   # the crossing's, authored above
            m = measure_window(chain, z, w["fromM"], w["toM"])
            if m["spanM"] <= CHAINAGE_TOLERANCE_M:
                continue
            if abs(m["riseM"]) < MIN_STRUCTURE_RISE_M:
                noise.append(f"{wid} {w['fromM']:.0f}-{w['toM']:.0f} m ({m['riseM']:+.2f} m)")
                continue
            kind = _kind(m["spanM"], m["riseM"], w["worstDeg"], kind_of_way)
            found.append((m["fromM"], dict(kind=kind, fam=_family(wid), m=m, gap=0.0,
                                           worst=w["worstDeg"], cid=None)))
        for n, (_at, f) in enumerate(sorted(found, key=lambda kv: kv[0]), 1):
            structures.append(_record(wid, kind_of_way, n, f["kind"], f["m"]["fromM"], f["m"]["toM"],
                                      f["m"]["riseM"], f["gap"], f["worst"], cap, f["fam"], f["cid"]))
    if vanished:
        print(f"{len(vanished)} stretch rows name ways the current route set no "
              f"longer has and were dropped: {', '.join(vanished[:6])}")
    if noise:
        print(f"{len(noise)} over-cap windows are below the {MIN_STRUCTURE_RISE_M:.1f} m "
              f"resolution noise floor and are NOT structures: "
              f"{', '.join(noise[:4])}{' …' if len(noise) > 4 else ''}")
    unauthored = [s for s in structures if s.get("unauthored")]
    if unauthored:
        print(f"{len(unauthored)} structures on {len({s['wayId'] for s in unauthored})} ways are "
              "UNAUTHORED (no family for their region); gated by test_route_structure_authoring")
    if ferry_rows:
        served = sum(1 for r in ferry_rows if r["serviceId"])
        print(f"{len(ferry_rows)} crossings are FERRY band and carry no structure "
              f"({served} served by a travel service, {len(ferry_rows) - served} with no service)")
    counted = Counter(s["id"] for s in structures)
    dup = sorted(sid for sid, n in counted.items() if n > 1)
    if dup:
        raise ValueError(f"route structure ids must be unique (engineering standard 1); duplicated: {dup}")
    return {"schemaVersion": SCHEMA_VERSION,
            "ferryCrossings": ferry_rows,
            "_": "Authored geometry on the major roads: bridges and boardwalk decks bank to bank "
                 "from world/sources/routes/water-crossings.json (ferry: no structure; marsh: a "
                 "boardwalk; river/lake span band: a bridge; ford: the road goes through the "
                 "water), and stairs, stepped ascents and lip steps over the dry over-cap windows "
                 "in output/route-grading-stretches.json that a route-grade patch could not take. "
                 "Generated by `python3 -m worldgen.author_route_structures`; a pure function of "
                 "the ground, the roads and the crossings. Compiled by worldgen.compile_route_structures.",
            "structures": structures}


def main() -> None:
    from .compile_chunks import DEFAULT_HEIGHTS

    doc = json.loads(STRETCHES_PATH.read_text())
    # The graded surface: inside a window it is the natural ground (windows
    # are grading-exempt) and at the landings it is what the piece meets.
    heights = np.load(DEFAULT_HEIGHTS)
    out = author(doc, {w["id"]: w for w in ways()}, heights)
    STRUCTURES_PATH.parent.mkdir(parents=True, exist_ok=True)
    STRUCTURES_PATH.write_text(json.dumps(out, indent=2, sort_keys=True) + "\n")
    print(f"{len(out['structures'])} structures -> {STRUCTURES_PATH}")


if __name__ == "__main__":
    main()
