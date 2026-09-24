"""Which kit pieces the source authors butt together SIDE- or END-WISE.

16h yard round K7 (brief § Part 1 state, cause 2; owner 2026-09-23: "better
rules on what goes with what and how things snap together"). The co-placement
templates in ``kit-assemblies-mined.json`` say which pieces stand at a repeated
offset; they cannot say whether the two meet. A wall end, a gate jamb and a
tower face are only right when they TOUCH, and a modular piece whose end faces
nothing is a hollow end. This miner records the touching pairs by REAL MESH
CONTACT, with the contact code of ``mine_mounts`` (poses, surface samples,
the 0.03 m contact band, patch classes), and writes them as the ``abuts``
section of ``kit-assemblies-mined.json``.

Method, per source set (the same sets and CLI as ``mine_assemblies``):

1. Every placed reference of a kit piece (raw kit manifests under
   ``tooling/asset-pipeline/output/kits``; composites are never placed),
   whatever its size, via ``mine_assemblies.collect``; natural pieces (trees,
   plants, rocks, grass: ``mine_assemblies``' natural rule) are left out.
2. Candidate pairs: two references whose placed bounds come within
   ``CANDIDATE_GAP_M`` of each other. The anchor (parent) is chosen as in
   ``mine_assemblies.order_pair`` (the bulkier piece; for one mesh, the
   direction pointing forward), so a chain does not split into mirror pairs.
3. Contact: ``CHILD_SAMPLES`` seeded points on the child's surface, placed in
   the parent's frame; a point within ``mine_mounts.CONTACT_M`` of the
   parent's surface is contact. An END JOINT needs the child's pivot OUTSIDE
   the parent's plan bounds and either a ``side`` patch (mean outward normal,
   ``mine_mounts.patch_class``) or every contact point within ``FACE_BAND_M``
   of one side face of the parent's bounds, whatever the mean normal (K9
   ruling A2: an end face overlapping a lip reads ``under``). A piece standing
   on another, or set into it (a rail in its footing's sockets, a leaf in its
   frame), is left to the templates.
4. The FACE on each piece is that band face, else the face of its own bounds
   box nearest the mean contact point (``+x``, ``-x``, ``+y``, ``-y``).
5. Per (parent, child, parent face, child face, relative scale) the offsets
   (the child in the parent's UNIT frame, ``mine_assemblies.unit_offset``)
   are clustered on the PLAN offset and relative yaw at ``--offset-tol`` /
   ``--yaw-tol``, the rise kept as a range; a cluster with at least
   ``--min-count`` members is a PAIR. The relative scale (child / parent,
   ``REL_SCALE_STEP``) is part of the key (K9 A1: BM&V places one wall at
   1.0/1.5/1.8/2.2).
6. The same clustering on FAMILY keys (``family_of``: directory + base name
   less its variant suffixes; same-family joints turned to the forward
   direction): a family pair is evidence for every kit piece of the family
   (K9 A3). Piece pairs are kept too.
7. Joint kind (K10 ruling A): a pair whose faces are opposite (``+x``/``-x``,
   ``+y``/``-y``) and whose plan offset runs along that axis, away from the
   parent's face, is a RUN joint (the next piece of a run); every other pair
   is a DOUBLE joint (face to face, e.g. the Imperial curtain wall set back
   to back, ``+y``/``+y`` at yaw 180). Only run joints make modular ends
   (``endFaces``) and run terminals; double joints are recorded in
   ``doubleFaces`` as information.
8. Run terminals (K9 B): per reference, the faces it meets on RUN joints; a
   face whose opposite face abuts and which itself abuts nothing is where a
   run ENDS on that piece (``terminates``, per piece and per family).
9. Single-use pieces (K10 ruling B, K11 ruling C): a structural kit piece
   whose family has no run joint anywhere in the record AND which is placed
   with no pairs or placed by no plugin at all (``singleUse``, derived by
   ``derive_single_use`` from the raw ``placedNoPairs`` / ``placedAssets``
   and the kit rows): a piece the plugins stand alone or never chain (a cave
   mouth, a stair), reported as information by the compile, never as an
   open end. A piece whose family HAS run joints is never single-use, so an
   unmet run end on it stays flagged.

Out of scope, on purpose: pieces chained by OVERLAP, not by an end face (the
BM&V ``citebosmer/passerelles/troncons`` walkway beams: 45 deg beams in square
boxes, the child's pivot inside the parent's box, top patches; K9 fresh 2b,
1 pair from 418 refs). Those are co-placement templates
(``kit-assemblies-mined.json`` ``sets.*.templates``), never abuts pairs.

Written: ``abuts.pairs`` and ``abuts.familyPairs`` (parent, child, faces,
``joint`` run/double, relScale, offsetM, riseMin/MaxM, yawDeg, count, spread, median contact
points, source set; family pairs add ``members``), ``abuts.families`` (family
-> kit pieces), ``abuts.endFaces`` (per asset, the faces some piece or family
RUN pair meets, with counts: the piece's modular ends), ``abuts.doubleFaces``
(the faces double pairs meet), ``abuts.terminates`` /
``familyTerminates`` (per asset / family, open run-end faces with counts),
``abuts.placedAssets`` (references walked) and ``abuts.placedNoPairs``
(placed, in no run pair), ``abuts.singleUse``. Deterministic: refs sorted by ``collect``, pairs
sorted, numbers rounded.

Usage (from ``tooling/world-generation``; same set arguments as
``mine_assemblies``):
  python3 -m worldgen.mine_abuts --set vanilla --plugin .../Skyrim.esm ... \\
      --only vanilla:architecture/whiterun/wrfarmfence/   # a sample
  python3 -m worldgen.mine_abuts ... --write              # merge into the record
"""

from __future__ import annotations

import argparse
import json
import math
import pickle
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

from .esp_index import UNITS_PER_METRE
from .asset_taxonomy import classify
from .mine_assemblies import (NATURAL_DIR_WORDS, Cluster, asset_ref, collect, grouped_sets,
                              order_pair, short, unit_offset, yaw_delta)
from .mine_mounts import (CONTACT_M, RAW_KITS_DIR, Instance, MeshLibrary, bounds_of,
                          box_gap_ok, patch_class, relative_pose)

SCHEMA_VERSION = 3
REPO_ROOT = Path(__file__).resolve().parents[3]
RECORD = REPO_ROOT / "world" / "sources" / "placement" / "kit-assemblies-mined.json"

#: Bounds closer than this make a candidate pair (metres, placed).
CANDIDATE_GAP_M = 0.1
#: Surface samples on the child: an end face is a small share of a long wall.
CHILD_SAMPLES = 2000
#: Contact points below this are a graze (a corner kissing), not a joint.
MIN_CONTACT_POINTS = 3
END_FACES = ("+x", "-x", "+y", "-y")
OPPOSITE = {"+x": "-x", "-x": "+x", "+y": "-y", "-y": "+y"}
#: K9 ruling A2: contact points this close to one side face of the parent's
#: bounds (metres, placed) make an end joint whatever the mean normal.
FACE_BAND_M = 0.15
#: K9 ruling A1: the child's scale relative to the parent's, rounded to this.
REL_SCALE_STEP = 0.1
#: K9 ruling A3: name suffixes that make a variant of the same modular piece
#: (the keep curtain set: wall, wall destroyed, gate, tower are one family).
#: Kept short on purpose: a suffix listed here claims the members share their
#: end faces, which `offsetSpreadM` on the family pair then shows or refutes.
VARIANT_SUFFIXES = ("destroyed", "damaged", "broken", "ruined", "gate", "tower")


def kit_rows(raw_kits: Path = RAW_KITS_DIR) -> dict[str, dict]:
    """asset id -> raw manifest row (with `kit`), composites left out."""
    out: dict[str, dict] = {}
    for path in sorted(raw_kits.glob("*.kit.json")):
        kit = path.name.removesuffix(".kit.json")
        for row in json.loads(path.read_text()).get("assets", []):
            if row.get("id", "").startswith("composite:"):
                continue
            out.setdefault(row["id"], dict(row, kit=kit))
    return out


def natural(model_key: str) -> bool:
    """Trees, plants, rocks, grass: never modular pieces (`mine_assemblies`'s
    natural rule, reused). K9: the full run walked 55k vanilla flora refs and
    a 235 m Valenwood tree set the candidate grid's cell to 470 m."""
    directories = model_key.lower().split("/")[:-1]
    return (any(w in d for d in directories for w in NATURAL_DIR_WORDS)
            or "natural" in classify(model_key).tags)


def instance(ref) -> Instance:
    return Instance(asset_ref(ref.pool, ref.model_key), ref.x * UNITS_PER_METRE,
                    ref.y * UNITS_PER_METRE, ref.z * UNITS_PER_METRE, ref.yaw_deg,
                    ref.scale, True, False, ref.rx, ref.ry)


def nearest_face(point: np.ndarray, box) -> str:
    """The side face of `box` (local min, max) nearest `point`, by distance
    normalised to the box's half extent on that axis."""
    low, high = np.asarray(box[0]), np.asarray(box[1])
    half = np.maximum((high - low) / 2.0, 1e-6)
    best = None
    for axis, name in ((0, "x"), (1, "y")):
        for sign, bound in (("+", high[axis]), ("-", low[axis])):
            d = abs(point[axis] - bound) / half[axis]
            if best is None or d < best[0]:
                best = (d, sign + name)
    return best[1]


class Sampler:
    """Seeded child surface samples and parent proximity queries, cached."""

    def __init__(self, meshes):
        self.meshes = meshes
        self._samples: dict[str, tuple | None] = {}
        self._queries: dict[str, object | None] = {}

    def samples(self, asset_id: str):
        if asset_id not in self._samples:
            import trimesh
            mesh = self.meshes(asset_id)
            if mesh is None or not len(mesh.faces):
                self._samples[asset_id] = None
            else:
                points, faces = trimesh.sample.sample_surface(mesh, CHILD_SAMPLES, seed=0)
                self._samples[asset_id] = (np.asarray(points),
                                           np.asarray(mesh.face_normals[faces]))
        return self._samples[asset_id]

    def query(self, asset_id: str):
        if asset_id not in self._queries:
            from trimesh.proximity import ProximityQuery
            mesh = self.meshes(asset_id)
            self._queries[asset_id] = (None if mesh is None or not len(mesh.faces)
                                       else (ProximityQuery(mesh), mesh.bounds))
        return self._queries[asset_id]


def contact(parent: Instance, child: Instance, sampler: Sampler):
    """``(patch class, points, mean point in parent frame, mean point in child
    frame)`` or None."""
    got, q = sampler.samples(child.asset_id), sampler.query(parent.asset_id)
    if got is None or q is None:
        return None
    points, normals = got
    a, b = relative_pose(parent, child)
    placed = points @ a.T + b
    query, (low, high) = q
    slack = CONTACT_M / parent.scale
    near = np.all((placed >= low - slack) & (placed <= high + slack), axis=1)
    if not near.any():
        return None
    _, distance, _ = query.on_surface(placed[near])
    hit = np.zeros(len(points), dtype=bool)
    hit[np.flatnonzero(near)[distance * parent.scale <= CONTACT_M]] = True
    if hit.sum() < MIN_CONTACT_POINTS:
        return None
    rot = a / max(np.linalg.norm(a[:, 0]), 1e-9)
    kind = patch_class(normals[hit] @ rot.T)
    return (kind, int(hit.sum()), placed[hit].mean(axis=0), points[hit].mean(axis=0),
            placed[hit], points[hit])


def face_band(points: np.ndarray, box, band: float) -> str | None:
    """The side face of `box` every contact point lies within `band` of
    (the box's local frame), or None. K9 ruling A2: an end joint is a contact
    on one end face, whatever its mean normal says (an end face overlapping a
    lip reads `under`)."""
    low, high = np.asarray(box[0]), np.asarray(box[1])
    for axis, name in ((0, "x"), (1, "y")):
        for sign, bound in (("+", high[axis]), ("-", low[axis])):
            if np.all(np.abs(points[:, axis] - bound) <= band):
                return sign + name
    return None


def family_of(asset_id: str) -> str:
    """K9 ruling A3: the family key, the model directory plus the base name
    with its variant suffixes stripped (trailing digits and the words in
    `VARIANT_SUFFIXES`, repeatedly): `mwimparchwall01`,
    `mwimparchwall01destroyed02`, `mwimparchwallgate01destroyed01` and
    `mwimparchwalltower01` are all `.../walls/mwimparchwall`."""
    head, _, name = asset_id.rpartition("/")
    while True:
        stem = name.rstrip("0123456789_")
        for word in VARIANT_SUFFIXES:
            if stem.endswith(word) and len(stem) > len(word):
                stem = stem[: -len(word)]
                break
        if stem == name:
            break
        name = stem
    return f"{head}/{name}" if head else name


def inside_plan(offset: np.ndarray, box) -> bool:
    """The child's pivot (parent's unscaled frame) lies within the parent's
    plan bounds."""
    low, high = box
    return bool(low[0] <= offset[0] <= high[0] and low[1] <= offset[1] <= high[1])


def candidate_pairs(refs: list, boxes: dict[str, tuple]):
    """Index pairs whose placed bounds may touch (a plan grid, then the
    oriented box test in ``abut_rows``)."""
    reach = {}
    for i, r in enumerate(refs):
        box = boxes[asset_ref(r.pool, r.model_key)]
        reach[i] = max(abs(v) for corner in box for v in corner[:2]) * r.scale
    cell = 2.0 * max(reach.values(), default=1.0) + CANDIDATE_GAP_M
    grid: dict[tuple, list[int]] = defaultdict(list)
    for i, r in enumerate(refs):
        grid[(r.world, int(r.x // cell), int(r.y // cell))].append(i)
    for (world, gx, gy), members in sorted(grid.items()):
        pool = [j for dx in (-1, 0, 1) for dy in (-1, 0, 1)
                for j in grid.get((world, gx + dx, gy + dy), ())]
        for i in members:
            a = refs[i]
            for j in pool:
                if j <= i:
                    continue
                b = refs[j]
                if math.hypot(a.x - b.x, a.y - b.y) <= reach[i] + reach[j] + CANDIDATE_GAP_M:
                    yield i, j


def joint_kind(parent_face: str, child_face: str, offset) -> str:
    """K10 ruling A: ``run`` when the faces are opposite and the child's plan
    offset runs along that axis, out of the parent's face; else ``double``."""
    if OPPOSITE.get(parent_face) != child_face:
        return "double"
    axis = 0 if parent_face[1] == "x" else 1
    along, across = float(offset[axis]), float(offset[1 - axis])
    sign = 1.0 if parent_face[0] == "+" else -1.0
    return "run" if along * sign > 0 and abs(along) > abs(across) else "double"


def rel_scale(parent_scale: float, child_scale: float) -> float:
    return round(round((child_scale or 1.0) / (parent_scale or 1.0) / REL_SCALE_STEP)
                 * REL_SCALE_STEP, 2)


def _forward(offset) -> bool:
    """Same-family direction rule (`order_pair`'s same-mesh rule, 5 cm slack
    so a run along x does not flip on a -0.0 y)."""
    return offset[1] > 0.05 or (abs(offset[1]) <= 0.05 and offset[0] >= 0)


def abut_rows(refs: list, boxes: dict[str, tuple], sampler: Sampler, set_id: str,
              stats: dict) -> list[dict]:
    """One row per END JOINT: the child's pivot outside the parent's plan and
    either a side patch or every contact point within FACE_BAND_M of one side
    face of the parent (K9 A2). Each row carries the piece key, the family key
    (same-family rows turned to the forward direction), the relative scale and
    the two reference indices (for the run-terminal evidence)."""
    rows = []
    for i, j in candidate_pairs(refs, boxes):
        stats["candidates"] += 1
        p_ref, c_ref = order_pair(refs[i], refs[j])
        pi, ci = (i, j) if p_ref is refs[i] else (j, i)
        parent, child = instance(p_ref), instance(c_ref)
        pbox, cbox = boxes[parent.asset_id], boxes[child.asset_id]
        a, b = relative_pose(parent, child)
        if not box_gap_ok(a, b, cbox, pbox, parent.scale):
            continue
        stats["boxPairs"] += 1
        found = contact(parent, child, sampler)
        if found is None:
            continue
        kind, points, at_parent, at_child, hit_parent, hit_child = found
        stats[f"contact_{kind}"] += 1
        if inside_plan(b, pbox):
            # a piece stacked on or set into the other (a rail in its
            # footing's sockets, a leaf in its frame): not an end-to-end joint
            stats["pivotInsideParent"] += 1
            continue
        pband = face_band(hit_parent, pbox, FACE_BAND_M / parent.scale)
        if kind != "side" and pband is None:
            continue
        stats["abutSidePatch" if kind == "side" else "abutFaceBand"] += 1
        pface = pband or nearest_face(at_parent, pbox)
        cface = (face_band(hit_child, cbox, FACE_BAND_M / child.scale)
                 or nearest_face(at_child, cbox))
        off = unit_offset(p_ref, c_ref)
        pfam, cfam = family_of(parent.asset_id), family_of(child.asset_id)
        frow = (pfam, cfam, pface, cface, rel_scale(p_ref.scale, c_ref.scale), off)
        if pfam == cfam and not _forward(off):
            frow = (cfam, pfam, cface, pface, rel_scale(c_ref.scale, p_ref.scale),
                    unit_offset(c_ref, p_ref))
        rows.append({
            "key": (parent.asset_id, child.asset_id, pface, cface,
                    rel_scale(p_ref.scale, c_ref.scale)),
            "offset": off, "points": points, "joint": joint_kind(pface, cface, off),
            "familyKey": frow[:5], "familyOffset": frow[5],
            "members": (short(parent.asset_id), short(child.asset_id)),
            "refs": ((set_id, pi, parent.asset_id, pface),
                     (set_id, ci, child.asset_id, cface)),
        })
    return rows


def _clusters(rows: list[dict], key_field: str, offset_field: str,
              offset_tol: float, yaw_tol: float):
    buckets: dict[tuple, list[Cluster]] = defaultdict(list)
    extra: dict[int, dict] = {}
    for row in rows:
        full = row[offset_field]
        # The joint is a face: a run stepped down a slope meets it higher or
        # lower, so the plan offset and yaw cluster and the rise is a range.
        sample = (full[0], full[1], 0.0, full[3])
        key = row[key_field]
        for c in buckets[key]:
            if c.fits(sample, offset_tol, yaw_tol):
                c.add(sample, (0, 0))
                break
        else:
            c = Cluster(*sample)
            c.samples.append(sample)
            c.members.append((0, 0))
            buckets[key].append(c)
        e = extra.setdefault(id(c), {"points": [], "rises": [], "members": defaultdict(int)})
        e["points"].append(row["points"])
        e["rises"].append(full[2])
        e["members"]["{}>{}".format(*row["members"])] += 1
    return buckets, extra


def _pair_row(parent, child, pface, cface, scale, c, e, set_id) -> dict:
    pts = sorted(e["points"])
    rise = sorted(e["rises"])
    return {
        "parent": parent, "child": child,
        "parentPiece": short(parent), "childPiece": short(child),
        "parentFace": pface, "childFace": cface,
        "joint": joint_kind(pface, cface, (round(c.ox, 2), round(c.oy, 2))),
        "relScale": scale,
        "offsetM": [round(c.ox, 2), round(c.oy, 2), round(rise[len(rise) // 2], 2)],
        "riseMinM": round(rise[0], 2), "riseMaxM": round(rise[-1], 2),
        "yawDeg": round(c.yaw, 2), "count": len(c.members),
        "offsetSpreadM": round(c.offset_spread(), 3),
        "contactPoints": pts[len(pts) // 2], "sourceSet": set_id,
    }


def _sort(out: list[dict]) -> list[dict]:
    out.sort(key=lambda p: (-p["count"], p["parent"], p["child"], p["parentFace"],
                            p["childFace"], p["relScale"], p["offsetM"]))
    return out


def pairs_from(rows: list[dict], set_id: str, offset_tol: float, yaw_tol: float,
               min_count: int) -> list[dict]:
    """Piece pairs: (parent, child, faces, relative scale) clustered on the
    plan offset and yaw (K9 A1: a child at another relative scale is another
    pair)."""
    buckets, extra = _clusters(rows, "key", "offset", offset_tol, yaw_tol)
    out = [_pair_row(*key, c, extra[id(c)], set_id)
           for key, clusters in buckets.items() for c in clusters
           if len(c.members) >= min_count]
    return _sort(out)


def family_pairs_from(rows: list[dict], set_id: str, offset_tol: float,
                      yaw_tol: float, min_count: int) -> list[dict]:
    """K9 A3: the same clustering on FAMILY keys; `members` counts the piece
    pairs behind each family pair."""
    buckets, extra = _clusters(rows, "familyKey", "familyOffset", offset_tol, yaw_tol)
    out = []
    for key, clusters in buckets.items():
        for c in clusters:
            if len(c.members) < min_count:
                continue
            row = _pair_row(*key, c, extra[id(c)], set_id)
            row["parentPiece"], row["childPiece"] = short(key[0]), short(key[1])
            row["members"] = dict(sorted(extra[id(c)]["members"].items()))
            out.append(row)
    return _sort(out)


def terminal_faces(rows: list[dict]) -> dict[str, dict[str, int]]:
    """K9 B: per asset, the faces left OPEN on references that abut on the
    opposite face only: a run ends on that piece with that face bare. RUN
    joints only (K10 A: a wall set back to back is not a run)."""
    faces: dict[tuple, set] = defaultdict(set)
    asset_of: dict[tuple, str] = {}
    for row in rows:
        if row.get("joint", "run") != "run":
            continue
        for set_id, idx, asset, face in row["refs"]:
            faces[(set_id, idx)].add(face)
            asset_of[(set_id, idx)] = asset
    out: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for ref, got in faces.items():
        for face in got:
            if OPPOSITE[face] not in got:
                out[asset_of[ref]][OPPOSITE[face]] += 1
    return {a: dict(sorted(f.items())) for a, f in sorted(out.items())}


def end_faces(pairs: list[dict], family_pairs: list[dict] = (),
              members: dict[str, list[str]] | None = None) -> dict[str, dict[str, int]]:
    """Per asset, the faces some pair meets, with counts. A family pair is
    evidence for every kit piece of the family (K9 A3). Callers pass the RUN
    pairs for ``endFaces`` and the double pairs for ``doubleFaces`` (K10 A)."""
    out: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for p in pairs:
        out[p["parent"]][p["parentFace"]] += p["count"]
        out[p["child"]][p["childFace"]] += p["count"]
    for p in family_pairs:
        for asset in (members or {}).get(p["parent"], ()):
            out[asset][p["parentFace"]] += p["count"]
        for asset in (members or {}).get(p["child"], ()):
            out[asset][p["childFace"]] += p["count"]
    return {a: dict(sorted(f.items())) for a, f in sorted(out.items())}


def mine(bundles: list[dict], kits: dict[str, dict], offset_tol: float, yaw_tol: float,
         min_count: int, only: list[str] | None = None, cache: Path | None = None) -> dict:
    boxes = {a: bounds_of(row) for a, row in kits.items() if bounds_of(row)}
    sampler = Sampler(MeshLibrary())
    pairs: list[dict] = []
    fam_pairs: list[dict] = []
    all_rows: list[dict] = []
    placed: dict[str, int] = defaultdict(int)
    stats: dict[str, int] = defaultdict(int)
    for bundle in bundles:
        def keep(key, _volume, pool):
            return asset_ref(pool, key) in boxes

        def wanted(ref: str) -> bool:
            return not only or any(ref.startswith(o) for o in only)
        cached = cache / f"abuts-refs-{bundle['id']}.pkl" if cache else None
        if cached and cached.exists():
            source = pickle.loads(cached.read_bytes())
        else:
            source = collect(bundle["plugins"], set(bundle["worlds"]), bundle["names"],
                             bundle["id"], bundle["label"] or bundle["id"], accept=keep)
            if cached:
                cached.write_bytes(pickle.dumps(source))
        refs = [r for r in source.refs if keep(r.model_key, 0.0, r.pool)
                and wanted(asset_ref(r.pool, r.model_key)) and not natural(r.model_key)]
        for r in refs:
            placed[asset_ref(r.pool, r.model_key)] += 1
        rows = abut_rows(refs, boxes, sampler, bundle["id"], stats)
        found = pairs_from(rows, bundle["id"], offset_tol, yaw_tol, min_count)
        fam = family_pairs_from(rows, bundle["id"], offset_tol, yaw_tol, min_count)
        print(f"{bundle['id']}: {len(refs)} kit refs, {len(rows)} end joints, "
              f"{len(found)} piece pairs, {len(fam)} family pairs", flush=True)
        pairs += found
        fam_pairs += fam
        all_rows += rows
    missing = sorted(sampler.meshes.missing)
    members: dict[str, list[str]] = defaultdict(list)
    for asset in sorted(boxes):
        members[family_of(asset)].append(asset)
    run = [p for p in pairs if p["joint"] == "run"]
    fam_run = [p for p in fam_pairs if p["joint"] == "run"]
    ends = end_faces(run, fam_run, members)
    doubles = end_faces([p for p in pairs if p["joint"] != "run"],
                        [p for p in fam_pairs if p["joint"] != "run"], members)
    no_pairs = sorted(a for a in placed if a not in ends)
    terminal = terminal_faces(all_rows)
    fam_terminal: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for asset, faces in terminal.items():
        for face, n in faces.items():
            fam_terminal[family_of(asset)][face] += n
    families = sorted({p[k] for p in fam_pairs for k in ("parent", "child")})
    return {
        "schemaVersion": SCHEMA_VERSION,
        "method": "worldgen.mine_abuts: kit pieces the plugins placed end to end "
                  "(real meshes, mine_mounts contact band; child pivot outside the "
                  "parent's plan; a side patch or every contact point on one side "
                  "face), clustered per piece and per family on the child's offset "
                  "in the parent's unit frame, the relative yaw and the relative "
                  "scale. Run joints (opposite faces, offset along that axis) "
                  "make endFaces, a piece's modular ends; double joints (face to "
                  "face) are doubleFaces; terminates are the open faces runs end "
                  "on; singleUse pieces stand alone in every plugin.",
        "parameters": {"contactM": CONTACT_M, "childSamples": CHILD_SAMPLES,
                       "minContactPoints": MIN_CONTACT_POINTS,
                       "candidateGapM": CANDIDATE_GAP_M, "faceBandM": FACE_BAND_M,
                       "relScaleStep": REL_SCALE_STEP,
                       "variantSuffixes": list(VARIANT_SUFFIXES),
                       "offsetToleranceM": offset_tol,
                       "yawToleranceDeg": yaw_tol, "minCount": min_count,
                       "only": only or []},
        "stats": dict(sorted(stats.items())) | {"meshesMissing": len(missing)},
        "pairs": pairs,
        "familyPairs": fam_pairs,
        "families": {f: members[f] for f in families},
        "endFaces": ends,
        "doubleFaces": doubles,
        "terminates": terminal,
        "familyTerminates": {f: dict(sorted(v.items()))
                             for f, v in sorted(fam_terminal.items())},
        "placedAssets": dict(sorted(placed.items())),
        "placedNoPairs": no_pairs,
        "singleUse": derive_single_use(pairs, fam_pairs, no_pairs, placed, kits),
    }


def run_families(pairs: list[dict], family_pairs: list[dict]) -> set[str]:
    """K10 B: every family that meets another piece on a RUN joint somewhere
    in the record (piece pairs through `family_of`, family pairs directly)."""
    out = {family_of(p[k]) for p in pairs if p.get("joint") == "run"
           for k in ("parent", "child")}
    return out | {p[k] for p in family_pairs if p.get("joint") == "run"
                  for k in ("parent", "child")}


def single_use(candidates: list[str], pairs: list[dict], family_pairs: list[dict]) -> list[str]:
    """K10 B: the candidates whose family has no run joint anywhere in the
    record: stood alone by the plugins (a cave mouth, a stair)."""
    fams = run_families(pairs, family_pairs)
    return sorted({a for a in candidates if family_of(a) not in fams})


def derive_single_use(pairs: list[dict], family_pairs: list[dict], no_pairs: list[str],
                      placed, kits: dict[str, dict]) -> list[str]:
    """K11 ruling C: ``singleUse`` = placed-no-pairs pieces and structural kit
    pieces no plugin places, whose family has no run joint anywhere.
    ``placedNoPairs`` stays the raw walk; this is the derived set."""
    from .compile_settlement import STRUCTURAL_CATEGORIES

    unplaced = [a for a, row in kits.items()
                if a not in placed and row.get("category") in STRUCTURAL_CATEGORIES]
    return single_use(list(no_pairs) + unplaced, pairs, family_pairs)


def rederive(section: dict, kits: dict[str, dict]) -> dict:
    """The record's derived fields from its own raw ones, with no plugin walk
    (a rule change on the derived set, never on the mined pairs)."""
    out = dict(section)
    out["singleUse"] = derive_single_use(section.get("pairs") or [],
                                         section.get("familyPairs") or [],
                                         section.get("placedNoPairs") or [],
                                         section.get("placedAssets") or {}, kits)
    return out


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    ap = argparse.ArgumentParser(description="mine side-contact (abuts) pairs")
    for flag in ("--set", "--label", "--plugin", "--world", "--names", "--only"):
        ap.add_argument(flag, action="append", default=[])
    ap.add_argument("--offset-tol", type=float, default=0.3)
    ap.add_argument("--yaw-tol", type=float, default=5.0)
    ap.add_argument("--min-count", type=int, default=3)
    ap.add_argument("--cache", type=Path, default=None,
                    help="directory for the walked refs (sample iteration)")
    ap.add_argument("--out", type=Path, default=None, help="write the section alone here")
    ap.add_argument("--write", action="store_true",
                    help="merge the section into kit-assemblies-mined.json")
    ap.add_argument("--rederive", action="store_true",
                    help="recompute the record's derived fields (singleUse) in place, no walk")
    args = ap.parse_args(argv)
    if args.rederive:
        record = json.loads(RECORD.read_text())
        before = len(record["abuts"].get("singleUse") or [])
        record["abuts"] = rederive(record["abuts"], kit_rows())
        RECORD.write_text(json.dumps(record, indent=1, sort_keys=False) + "\n")
        print(f"-> {RECORD} (abuts singleUse: {before} -> {len(record['abuts']['singleUse'])})")
        return 0
    section = mine(grouped_sets(argv), kit_rows(), args.offset_tol, args.yaw_tol,
                   args.min_count, args.only or None, args.cache)
    if args.out:
        args.out.write_text(json.dumps(section, indent=1) + "\n")
        print(f"-> {args.out}")
    if args.write:
        record = json.loads(RECORD.read_text())
        record["abuts"] = section
        RECORD.write_text(json.dumps(record, indent=1, sort_keys=False) + "\n")
        print(f"-> {RECORD} (abuts: {len(section['pairs'])} pairs)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
