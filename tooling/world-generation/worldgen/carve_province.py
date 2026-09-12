"""Carve the province to the hydrology graph and FREEZE it (Phase 16b).

    python3 -m worldgen.carve_province

The last stage that may shape the base terrain. It reads the shaped ground
(`heightfield-shaped-f32.npy`), the graph solved on it (`hydrology_graph
derive`: the channel long profile and the standing bodies, saved beside the
graph) and cuts exactly what the graph promised: the trench to L - D inside
every reach's width with its sealing shoulder, the weir at every lake
outlet, the plunge bowl at every fall's foot, islets sunk inside bodies. The
result is `refined-height-frozen-f32.npy`, content-addressed in
`world/sources/terrain/freeze.json`; no later stage writes it. Everything a
place may still do to the ground is a typed patch on top (`terrain_patches`).

THE EXTENSION RULE. The carve makes standing water of its own — a levee's
backswamp, a trench pool — so after the cut the bodies are re-solved on the
frozen array and every accepted body that no graph body accounts for is
appended to the graph with `origin: "terrain-stage"`. A graph body whose
deepest cell the carve left DRY is a defect: this stage fails rather than
shipping a graph that names water the ground cannot hold (only a body the
graph itself marks `captured` — drained to the channel through it — is
exempt). The freeze gate (`test_terrain_preconditions.py`) then reads the
frozen array and the graph and checks every precondition independently.

Also written here: `channels-pass1.npz` (the solution, for `compile_water`),
`ground-tint.png`, `portage-track.npy` for the land-cover bake, and
`carve-meta.json` with the carve statistics and the frozen sha.
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from . import freeze
from . import hydrology_graph as hg
from .scale import RAW_M, TUNE
from .shape_province import SEED, STEP, STUDIO_DIR
from .vault import HEIGHTFIELD_DIR

VAULT_DIR = HEIGHTFIELD_DIR / "province-refined"
FROZEN_PATH = VAULT_DIR / freeze.FROZEN
CHANNELS_FILE = "channels-pass1.npz"
FROZEN_ON = "2026-09-11"
DEPENDED_LEVEL_TOL_M = 0.30   # a body the profile was solved against may move at most the crest raise (a levee impounds it by SHOULDER_RAISE_M at most)
CARVE_DISAGREEMENT_BUDGET = 10     # bodies left dry / depended bodies moved: recorded up to this, a defect beyond


def carve(h: np.ndarray, bodies, sol, log=print, approved_mask: np.ndarray | None = None):
    """Cut the trench and build the shoulder to the graph's solution."""
    from . import channels
    from . import standing_water as sw
    # never cut the rim of a standing body or the sea (a ring cut 6 m + w/2
    # out from a channel that skirts a pool would lower its spill: protect
    # ~16 m) and never raise a bed or a rim (a levee across an outlet dams it)
    water = bodies.wet | bodies.sea
    collar = ndimage.binary_dilation(water, iterations=9) & ~water
    # a CAPTURED lake drains to the channel cut through it: its bed is not
    # protected from the shoulder (the levee beside the channel must seal
    # what will be dry ground)
    body_level = bodies.level_with_sea.copy()
    cap = sol.captured
    if cap.any():
        cy = np.clip(np.round(sol.y[cap]).astype(int), 0, h.shape[0] - 1)
        cx = np.clip(np.round(sol.x[cap]).astype(int), 0, h.shape[1] - 1)
        ids = np.unique(bodies.body[cy, cx])
        ids = ids[ids > 0]
        if len(ids):
            body_level[np.isin(bodies.body, ids)] = -np.inf
    h, stats = channels.carve(h, sol, protect=collar, body_level=body_level, never_raise=approved_mask)
    h, n_islands = sw.lower_islands(h, bodies)
    stats["islandsLowered"] = int(n_islands)
    return h, stats


def extend_graph(h: np.ndarray, npz, graph: dict, sol, log=print, approved_mask: np.ndarray | None = None):
    """Re-solve the bodies on the frozen array and reconcile the graph with
    what the ground now holds (decision 0059):

    * a measured body the frozen array still holds is RE-MEASURED in place —
      level, area, depth, spill — because the carve's levees and trenches move
      a hollow's rim: the graph names the water the frozen world holds, and a
      body's `preCarve` field keeps the level it was solved at when it moved;
    * a body a reach depends on (pooled through it, weired out of it, fed by
      it) whose level moved by more than DEPENDED_LEVEL_TOL_M is a DEFECT:
      the channel profile was solved against that level, so the stage fails;
    * a body the carve made is appended (`origin: "terrain-stage"`);
    * a graph body left dry (not sea, not captured, not in a channel's width,
      not promised or authored — those the freeze gate checks directly) fails.

    Returns (bodies2, appended, lost, moved)."""
    from scipy.spatial import cKDTree
    from . import standing_water as sw
    from .channels import KIND_LOST, SHOULDER_BLEND_M
    bodies2 = sw.solve_bodies(h, npz, step=STEP, mpp=RAW_M, with_placement=False, allow_extra=approved_mask)
    resp = sw.season_response(h, bodies2)
    recs = hg.measure_bodies(h, bodies2, npz["regions"], npz["salinity"], resp, RAW_M)
    by_label = {rec["_label"]: rec for rec in recs}
    live = sol.kind != KIND_LOST
    tree = cKDTree(np.stack([sol.y[live], sol.x[live]], 1))
    width = sol.width[live]
    depended = set()
    for r in graph["reaches"]:
        for key in ("bodyId",):
            if r.get(key):
                depended.add(r[key])
        if r.get("fall"):
            depended.add(r["fall"].get("plungeBodyId"))
    for b in graph["bodies"]:
        if b.get("inflow") or b.get("outflow"):
            depended.add(b["id"])
    matched: set[int] = set()
    lost, moved, joined = [], [], []
    # (the id stays keyed to the solve-time deepest cell; `deepestCell` is the
    # frozen array's, which the freeze gate and the compile read)
    remeasured = ("levelM", "areaM2", "maxDepthM", "sheet", "season", "seasonResponse",
                  "wetSeasonLevelM", "drySeasonLevelM", "bboxCells", "meanDepthM", "terrainPrecondition",
                  "deepestCell")
    for b in graph["bodies"]:
        if b.get("deepestCell") is None or b["kind"] == "ocean":
            continue
        dx, dy = b["deepestCell"]
        lbl = int(bodies2.body[dy, dx])
        if lbl > 0:
            matched.add(lbl)
            if b["origin"] == "measured" and not b.get("captured"):
                new = by_label[lbl]
                delta = float(new["levelM"]) - float(b["levelM"])
                if abs(delta) > 0.05:
                    moved.append((b["id"], b["levelM"], new["levelM"], b["id"] in depended))
                    b["preCarve"] = {"levelM": b["levelM"], "areaM2": b["areaM2"], "spillM": b["terrainPrecondition"].get("spillM")}
                for key in remeasured:
                    b[key] = new[key]
            continue
        if bodies2.sea[dy, dx] and not b.get("captured") and b["origin"] == "measured":
            # the trench joined it to the sea below 0 (a lowland hollow a hand
            # over sea level whose outlet the carve cut to the coast): it now
            # stands AT sea level, an arm of the sea, and the record says so
            # rather than promising a rim the ground no longer has
            joined.append((b["id"], b["levelM"]))
            b["preCarve"] = {"levelM": b["levelM"], "areaM2": b["areaM2"], "spillM": b["terrainPrecondition"].get("spillM")}
            b["captured"] = True
            b["joinedSea"] = True
            b["levelM"] = 0.0
            b["wetSeasonLevelM"] = 0.0
            b["drySeasonLevelM"] = 0.0
            b["terrainPrecondition"] = {"kind": "captured", "levelM": 0.0, "channelLevelM": 0.0,
                                        "floorMaxM": b["terrainPrecondition"].get("floorMaxM", 0.0)}
            continue
        if bodies2.sea[dy, dx] or b.get("captured") or b["origin"] in ("promised", "authored"):
            continue      # (the freeze gate checks a promised bowl and an authored lake directly)
        d, i = tree.query([dy, dx])
        if d * RAW_M <= width[i] * 0.5 + SHOULDER_BLEND_M:
            # a body the trench runs through and drains: CAPTURED by the channel
            # (the compile refills it from the channel at the river's level)
            k = int(np.flatnonzero(live)[i])
            b["captured"] = True
            b["terrainPrecondition"] = {"kind": "captured", "levelM": b["levelM"],
                                        "channelLevelM": round(float(sol.L[k]), 2),
                                        "floorMaxM": b["terrainPrecondition"].get("floorMaxM", b["levelM"])}
            continue
        lost.append(b["id"])
    have = {b["id"] for b in graph["bodies"]}
    new = []
    for rec in recs:
        if rec["_label"] in matched or rec["id"] in have:
            continue
        rec.pop("_label")
        rec["origin"] = "terrain-stage"
        rec["causedBy"] = {"stage": "carve_province", "why": "made by the carve (a shoulder's backswamp, a trench pool)"}
        new.append(rec)
    # a marsh SHEET a river runs through is the river's backwater: its spill
    # becomes the trench and the compile floods it laterally (16c); the hard
    # gate is for lakes, tarns, ponds and pools the profile was solved against
    sheet_ids = {b["id"] for b in graph["bodies"] if b.get("sheet") or b["kind"] in hg.MARSH_KINDS}
    bad = [m for m in moved if m[3] and m[0] not in sheet_ids and abs(m[2] - m[1]) > DEPENDED_LEVEL_TOL_M]
    log(f"extension rule: {len(new)} terrain-stage bodies appended, {len(lost)} graph bodies left dry, "
        f"{len(moved)} re-measured bodies moved > 0.05 m ({len(bad)} that a reach depends on), "
        f"{len(joined)} joined to the sea by their outlet trench")
    graph["stats"]["bodiesJoinedSeaByCarve"] = len(joined)
    return bodies2, new, lost, moved, bad


def write_ground_tint(h: np.ndarray, npz, rng) -> None:
    """Macro climate tint (retuned at the Phase 6 gate): coast less orange,
    inland greener and darker; the studio has a live strength slider."""
    qstep = 4
    hq = h[::qstep, ::qstep]
    up = lambda a: np.repeat(np.repeat(a, STEP, 0), STEP, 1)[: h.shape[0], : h.shape[1]]

    def qf(a):
        return up(a)[::qstep, ::qstep][: hq.shape[0], : hq.shape[1]].astype(np.float32)

    oc_q = qf(npz["ocean"]) > 0.5
    twi_q = np.nan_to_num(qf(npz["twi"]))
    wet_q = np.clip((twi_q - twi_q.mean()) / max(twi_q.std(), 1e-9) * 0.35 + 0.5, 0, 1)
    coast = np.exp(-(ndimage.distance_transform_edt(~oc_q) * (RAW_M * qstep)).astype(np.float32) / (2500.0 * TUNE))
    south = (np.arange(hq.shape[0], dtype=np.float32) / hq.shape[0])[:, None] * np.ones_like(hq)

    def tnoise():
        m = ndimage.gaussian_filter(rng.standard_normal(hq.shape, dtype=np.float32), 32)
        return (m / max(m.std(), 1e-9)).astype(np.float32)

    tr = 1.0 + 0.02 * coast + 0.06 * (1 - wet_q) - 0.05 * south + 0.06 * tnoise()
    tg = 1.0 + 0.04 * coast + 0.10 * wet_q + 0.07 * south + 0.06 * tnoise()
    tb = 1.0 + 0.03 * coast - 0.04 * wet_q + 0.05 * tnoise()
    dark = 1.0 - 0.06 * wet_q - 0.05 * south + 0.04 * coast
    tint = (np.stack([tr, tg, tb], -1) * dark[..., None]).clip(0.0, 2.0)
    STUDIO_DIR.mkdir(parents=True, exist_ok=True)
    Image.fromarray((tint * 127.5).astype(np.uint8)).save(STUDIO_DIR / "ground-tint.png")


def main() -> None:
    if len(sys.argv) > 1:
        raise SystemExit(__doc__)
    vault = HEIGHTFIELD_DIR
    g = np.load(vault / freeze.SHAPED)
    npz = np.load(vault / "hydrology-pass1.npz")
    graph = json.loads(hg.GRAPH_PATH.read_text(encoding="utf-8"))
    sha_shaped = freeze.sha256_of(g)
    if graph["sourceHeightSha256"] != sha_shaped:
        raise SystemExit(f"carve_province: the graph was solved on {graph['sourceHeightSha256'][:16]}… but the "
                         f"shaped ground is {sha_shaped[:16]}…; run `hydrology_graph derive` first")
    bodies, sol = hg.load_solution(vault, g)
    from . import approved_bodies as ab
    _doc, alab, _, _ = ab.load(vault)
    h, stats = carve(g.astype(np.float32, copy=True), bodies, sol, approved_mask=(alab > 0) if alab is not None else None)
    VAULT_DIR.mkdir(exist_ok=True)
    sha = freeze.save_frozen(FROZEN_PATH, h, freeze.FROZEN,
                             "the frozen base: the shaped ground carved to the hydrology graph "
                             "(trenches, weirs, plunge bowls, islets); patches only from here on", FROZEN_ON)
    # what compile_water reads: the same solution the graph names
    shutil.copyfile(vault / hg.SOLUTION_FILE, VAULT_DIR / CHANNELS_FILE)
    bodies2, new, lost, moved, bad = extend_graph(h, npz, graph, sol, approved_mask=(alab > 0) if alab is not None else None)
    # where the carve disagrees with the graph it is RECORDED, body by body,
    # and the owner sees the list (0060 §7: a departure is a listed tweak,
    # never a silent change); only more than CARVE_DISAGREEMENT_BUDGET of
    # either kind is a defect the build refuses to ship
    by_id = {b["id"]: b for b in graph["bodies"]}
    for bid in lost:
        b = by_id[bid]
        b["lostAtCarve"] = True
        b["terrainPrecondition"] = {"kind": "lost-at-carve", "levelM": b["levelM"],
                                    "floorMaxM": b["terrainPrecondition"].get("floorMaxM", b["levelM"])}
    ap = graph["stats"].get("approvedBodies")
    if ap is not None:
        realised_ids = {b["id"] for b in graph["bodies"] if b.get("approved")}
        for bid in lost:
            b = by_id[bid]
            if b.get("approved"):
                ap["missing"].append({"id": bid, "kind": b["kind"], "levelM": b["levelM"], "areaM2": b["areaM2"],
                                      "deepestCell": b["deepestCell"], "why": "lost-at-carve: the carved ground holds no body at its outline"})
        ap["movedByCarve"] = [{"id": m[0], "fromM": m[1], "toM": m[2], "depended": m[3]} for m in moved
                              if m[0] in realised_ids and abs(m[2] - m[1]) > DEPENDED_LEVEL_TOL_M]
    graph["stats"]["carveDisagreements"] = {"lost": lost, "dependedMoved": [{"id": m[0], "fromM": m[1], "toM": m[2]} for m in bad],
                                            "budget": CARVE_DISAGREEMENT_BUDGET}
    print(f"carve disagreements: {len(lost)} bodies left dry, {len(bad)} depended bodies moved > {DEPENDED_LEVEL_TOL_M} m "
        f"(budget {CARVE_DISAGREEMENT_BUDGET} each; recorded in the graph)")
    if len(lost) > CARVE_DISAGREEMENT_BUDGET or len(bad) > CARVE_DISAGREEMENT_BUDGET:
        raise SystemExit(f"carve_province: {len(lost)} bodies left DRY and {len(bad)} depended bodies moved > "
                         f"{DEPENDED_LEVEL_TOL_M} m — over the budget of {CARVE_DISAGREEMENT_BUDGET}: a shared cause, not a list")
    graph["stats"]["bodiesMovedByCarve"] = len(moved)
    graph["stats"]["bodiesMovedByCarveMaxM"] = round(max((abs(m[2] - m[1]) for m in moved), default=0.0), 3)
    hg.extend_bodies(graph, new)
    hg.save_graph(graph)
    layers = hg.write_layers(graph, npz["rivers"].shape, bodies=bodies2, npz=npz)
    write_ground_tint(h, npz, np.random.default_rng(SEED))
    meta = {"frozenSha256": sha, "shapedSha256": sha_shaped, "graphContentSha256": graph["contentSha256"],
            "channelCarve": stats, "terrainStageBodies": len(new), "bodiesMovedByCarve": len(moved),
            "bodiesMoved": [{"id": m[0], "fromM": m[1], "toM": m[2], "depended": m[3]} for m in moved], "layers": layers}
    (VAULT_DIR / "carve-meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(json.dumps({k: v for k, v in meta.items() if k != "layers"}, indent=2))


if __name__ == "__main__":
    main()
