"""Mould flora collision to the real wood geometry (kit post-pass).

Reads a built kit (GLB + manifest), and for every `trunk-capsule` asset
replaces `collisionSegments` with capsules fitted to the asset's WOOD parts —
the primitives whose textures are bark/trunk/root/wood — sampled from the
actual triangle surfaces. This supersedes the Blender-side `trunk_chain`
tracker (Phase 10 rounds 7–9), which followed ONE axis from the base and so
could never describe a multi-stemmed willow, a strongly leaning palm, or a
composite whose crowns carry their own trunk columns; the owner walked
through all three. Fitting the shipped geometry directly is also what the
climbing system will need: solid exactly where the trunk is, no more, no less.

Method, per species (pivot space, glTF Y-up, scale 1):
 1. Sample points on every wood triangle (area-weighted, deterministic seed).
 2. Slice into horizontal bands (~1.5–2.5 m, scaled to the tree).
 3. Cluster each band's points in the XZ plane (grid flood-fill), split
    strongly anisotropic clusters (a near-horizontal limb is a streak, not a
    disc — one circle over it would solidify air beside it).
 4. Each cluster becomes a vertical capsule for its band (radius = p88 of
    radial spread); clusters linked across adjacent bands get a joining
    capsule when the axis steps sideways, so a leaning trunk has no notches.
 5. Thin twigs (radius < MIN_RADIUS_M) and underpopulated clusters are left
    walk-through; species capsules are capped at MAX_CAPSULES, fattest first.

Output: `collisionSegments` as oriented capsules `{radiusM, aM, bM}` (core
segment endpoints, pivot-relative, glTF Y-up) under
`collisionFrame: "pivot-yup-v3"`. The runtime (`floraSolids.ts`) orients each
Rapier capsule along `b − a`. The single `collisionCapsule` (wind stiffness,
fallback) and rock `collisionBox` are untouched.

Run standalone after any kit build:
    python -m pipeline.trunk_solids <kit.json> [more kits...]
It rewrites the manifest(s) in place; copy to the app's public/kits after.
"""
from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

import numpy as np

#: Substrings that mark a texture as wood the player should collide with.
#: `branch` textures are deliberately INCLUDED: mangrove stilt roots and the
#: big jungle-tree limbs ship under them, and the thinness filter below is
#: what keeps twigs walk-through — not the texture name.
WOOD = (
    "bark", "trunk", "wood", "stump", "log", "giant_tree", "branch", "wolene",
    "root",
)
#: Substrings that veto a wood match: leaf/frond textures whose names contain a
#: wood word (`gkbtreeaspenbranchcompgreen1dark`). Cutout CARDS textured as
#: wood are NOT listed here any more — they are rejected by the geometric test
#: below (`is_card`). Three card names used to be blacklisted individually
#: (`palmmiddle`, `grandoak`, `gkbbranch3dark`); a name list can only ever veto
#: the cards somebody already walked into, and it missed `gkbbranch1/5/10`,
#: `gkbjunglebranch2/3`, `datepalmbark7/8` and `tundradriftwoodbranches01`,
#: which is what solidified the mangrove and jungle crowns (round 11).
#:
#: Round 12 dropped `comp` for the same reason, in the other direction: every
#: `*branchcomp*` leaf card in the kit is already caught geometrically (ratios
#: 3.4e-3 – 1.8e-2), while the bare substring also vetoed
#: `gkbtreeaspenbarkcomp` — a genuine bark TUBE at 3.6e-4 — which is why a
#: 10.6 m aspen was shipping with no fitted trunk at all.
NOT_WOOD = ("leaf", "conifer", "maple", "moss", "frond", "valenwood")

MIN_RADIUS_M = 0.11
MIN_CLUSTER_POINTS = 14
MAX_CAPSULES = 96
SAMPLES_PER_M2 = 70.0
CELL_M = 0.55  # XZ clustering grid; adjacent (8-way) occupied cells connect.

#: A cutout card is a handful of huge quads standing in for a whole crown; a
#: real trunk/limb tube is finely segmented however big the tree is. So the
#: property that separates them is triangle size RELATIVE TO THE TREE: a tube's
#: triangles are ~1e-5–5e-4 of height², a card's 2.5e-3–2.0e-2. An absolute
#: area cut cannot do this — the anvil canopy palm's genuine 42 m trunk carries
#: 0.67 m² triangles, larger than a mangrove crown card's 0.56 m² — which is
#: exactly why the name list existed. Measured over all 142 wood-matched
#: primitives in flora-province-v1, the cut sits in a clean band: the largest
#: tube is 1.44e-3 (`bananabarktop3`) and the smallest card 2.49e-3
#: (`gkbtundradriftwoodbranches01`), so 2.0e-3 has ~25 % margin either side.
CARD_TRI_AREA_PER_HEIGHT2 = 2.0e-3

#: Cards are rejected in favour of the tubes they surround. Where a species has
#: NO other wood primitive there is nothing to fall back to but the measured
#: capsule, so a lone borderline primitive is kept and left to the girth clamp
#: instead (the man-fern's stem, 2.41e-3, is the one such case in the kit).
#: Past this multiple of the threshold it is not borderline — it is a crossed
#: fill card like `palmmiddle`, and the pass fails rather than solidify a
#: crown.
LONE_CARD_FAIL_FACTOR = 2.0

#: A band cluster wider than this multiple of the species' independently
#: measured trunk girth is a splayed multi-stem (mangrove prop roots, a
#: willow's fork), not one bole: split it, and clamp what will not split.
#: Without this a p88 disc is drawn across the whole splay — the second half of
#: the round-11 defect, which survives the card fix on its own.
SPLIT_RADIUS_FACTOR = 1.3
MAX_RADIUS_FACTOR = 1.5


def is_wood(texture: str) -> bool:
    t = texture.lower()
    return any(w in t for w in WOOD) and not any(v in t for v in NOT_WOOD)


def is_card(mean_tri_area_m2: float, height_m: float) -> bool:
    """True when a wood-matched primitive is a cutout card, not a tube."""
    if height_m <= 0:
        return False
    return mean_tri_area_m2 > CARD_TRI_AREA_PER_HEIGHT2 * height_m * height_m


# --- minimal GLB reader -----------------------------------------------------

def load_glb(path: Path):
    data = path.read_bytes()
    length = struct.unpack_from("<I", data, 12)[0]
    gltf = json.loads(data[20:20 + length])
    return gltf, data, 20 + length + 8


def accessor(gltf, blob, binoff, i):
    a = gltf["accessors"][i]
    bv = gltf["bufferViews"][a["bufferView"]]
    off = binoff + bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    dtype = {5126: "<f4", 5123: "<u2", 5125: "<u4"}[a["componentType"]]
    ncomp = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
    return np.frombuffer(blob, dtype=dtype, count=a["count"] * ncomp,
                         offset=off).reshape(a["count"], ncomp)


def texture_name(gltf, material_index) -> str:
    if material_index is None:
        return "?"
    m = gltf["materials"][material_index]
    t = m.get("pbrMetallicRoughness", {}).get("baseColorTexture")
    if not t:
        return m.get("name", "?")
    img = gltf["images"][gltf["textures"][t["index"]]["source"]]
    return img.get("uri") or img.get("name", "?")


def wood_points(gltf, blob, binoff, root_node, rng, height_m: float,
                rejected: list[tuple[str, float]] | None = None,
                lone: list[tuple[str, float]] | None = None) -> np.ndarray:
    """Area-weighted surface samples of the asset's level-0 wood TUBE primitives.

    Wood-matched primitives that fail `is_card` are dropped and appended to
    `rejected`; the caller reports them, so a newly added species with an
    unseen card texture is loud rather than silently solid. A species with no
    tube at all keeps its lone primitive (see `LONE_CARD_FAIL_FACTOR`).
    """
    tubes: list[tuple] = []
    cards: list[tuple] = []
    for child_index in root_node.get("children", []):
        node = gltf["nodes"][child_index]
        extras = node.get("extras", {})
        if extras.get("lod") or extras.get("billboard") or "mesh" not in node:
            continue
        translation = np.array(node.get("translation", [0.0, 0.0, 0.0]))
        for prim in gltf["meshes"][node["mesh"]]["primitives"]:
            texture = texture_name(gltf, prim.get("material"))
            if not is_wood(texture):
                continue
            pos = accessor(gltf, blob, binoff, prim["attributes"]["POSITION"])
            pos = pos.astype("f8") + translation
            if "indices" in prim:
                idx = accessor(gltf, blob, binoff, prim["indices"]).ravel()
            else:
                idx = np.arange(len(pos))
            tris = pos[idx.reshape(-1, 3).astype("i8")]
            a, b, c = tris[:, 0], tris[:, 1], tris[:, 2]
            area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
            mean_area = float(area.mean()) if len(area) else 0.0
            entry = (texture, mean_area, tris, area)
            (cards if is_card(mean_area, height_m) else tubes).append(entry)

    chosen = tubes
    if not tubes and cards:
        # Nothing else to stand on: keep them, and let the caller judge how
        # card-like they are (LONE_CARD_FAIL_FACTOR).
        chosen = cards
        if lone is not None:
            lone.extend((texture, mean) for texture, mean, _, _ in cards)
        cards = []
    if rejected is not None:
        rejected.extend((texture, mean_area) for texture, mean_area, _, _ in cards)

    points = []
    for _texture, _mean, tris, area in chosen:
        a, b, c = tris[:, 0], tris[:, 1], tris[:, 2]
        counts = np.maximum(1, (area * SAMPLES_PER_M2).astype(int))
        for i in range(len(tris)):
            u = rng.random((counts[i], 2))
            flip = u.sum(axis=1) > 1
            u[flip] = 1 - u[flip]
            points.append(a[i] + u[:, :1] * (b[i] - a[i])
                          + u[:, 1:] * (c[i] - a[i]))
    return np.vstack(points) if points else np.empty((0, 3))


# --- band clustering --------------------------------------------------------

def band_clusters(xz: np.ndarray) -> list[np.ndarray]:
    """Index groups of one band's points, connected through the XZ grid."""
    cells = np.floor(xz / CELL_M).astype("i8")
    order: dict[tuple[int, int], list[int]] = {}
    for i, key in enumerate(map(tuple, cells)):
        order.setdefault(key, []).append(i)
    seen: set[tuple[int, int]] = set()
    clusters = []
    for start in order:
        if start in seen:
            continue
        stack, members = [start], []
        seen.add(start)
        while stack:
            cx, cz = stack.pop()
            members.extend(order[(cx, cz)])
            for dx in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    n = (cx + dx, cz + dz)
                    if n in order and n not in seen:
                        seen.add(n)
                        stack.append(n)
        clusters.append(np.array(members))
    return clusters


def split_anisotropic(xz: np.ndarray, members: np.ndarray) -> list[np.ndarray]:
    """A streak (horizontal limb seen from above) becomes beads, not a disc."""
    pts = xz[members]
    centred = pts - pts.mean(axis=0)
    values, vectors = np.linalg.eigh(centred.T @ centred / max(1, len(pts)))
    major, minor = np.sqrt(max(values[1], 1e-12)), np.sqrt(max(values[0], 1e-12))
    if major < 2.2 * minor or major < 0.9:
        return [members]
    axis = vectors[:, 1]
    t = centred @ axis
    chunk = max(0.7, 2.6 * minor)
    bins = np.floor((t - t.min()) / chunk).astype("i8")
    return [members[bins == b] for b in np.unique(bins)]


def fit_cluster(sub: np.ndarray, split_radius_m: float = 1e9,
                max_radius_m: float = 1e9,
                depth: int = 0) -> list[tuple[np.ndarray, float]]:
    """(centre, radius) discs for one band cluster's XZ points.

    Ring test: a real trunk cross-section is sampled on its WALL, so radial
    distances bunch near the radius (p40 ≈ p88). Failing it means either a
    FORK — two stems close enough for the grid to merge, each needing its own
    disc — or a diffuse spray of twig cards, whose bounding circle would
    solidify air. Try a 2-means split first; when splitting stops helping,
    take the tighter p55 radius so a spray stays mostly walk-through.

    A cluster wider than `SPLIT_RADIUS_FACTOR` × the species' measured trunk
    girth is split even when it passes the ring test: a mangrove's prop-root
    tangle and a willow's fork read as a ring from above while being mostly
    walk-through air. Whatever still will not split is clamped to
    `max_radius_m` rather than shipped as a drum.
    """
    centre = np.median(sub, axis=0)
    radial = np.linalg.norm(sub - centre, axis=1)
    radius = float(np.percentile(radial, 88))
    ring = float(np.percentile(radial, 40)) >= 0.5 * radius
    too_wide = radius > split_radius_m
    if (not ring or too_wide) and depth < 5 and len(sub) >= 2 * MIN_CLUSTER_POINTS:
        seed_a = sub[np.argmax(np.linalg.norm(sub - sub.mean(axis=0), axis=1))]
        seed_b = sub[np.argmax(np.linalg.norm(sub - seed_a, axis=1))]
        centres = np.stack([seed_a, seed_b])
        for _ in range(8):
            side = (np.linalg.norm(sub - centres[0], axis=1)
                    > np.linalg.norm(sub - centres[1], axis=1)).astype(int)
            if side.all() or not side.any():
                break
            centres = np.stack([np.median(sub[side == k], axis=0) for k in (0, 1)])
        halves = [sub[side == k] for k in (0, 1)]
        if all(len(h) >= MIN_CLUSTER_POINTS for h in halves) and (
            np.linalg.norm(centres[0] - centres[1]) > 0.6 * radius
        ):
            return [d for h in halves
                    for d in fit_cluster(h, split_radius_m, max_radius_m, depth + 1)]
    if not ring:
        radius = float(np.percentile(radial, 55))
    radius = min(radius, max_radius_m)
    if radius < MIN_RADIUS_M:
        return []
    return [(centre, radius)]


def fit_capsules(points: np.ndarray, trunk_radius_m: float = 0.0) -> list[dict]:
    """The oriented capsule set for one species' wood samples."""
    if len(points) < MIN_CLUSTER_POINTS:
        return []
    y_lo, y_hi = points[:, 1].min(), points[:, 1].max()
    height = y_hi - y_lo
    if height <= 0.2:
        return []
    band = float(np.clip(height / 18.0, 1.5, 2.5))
    n_bands = max(1, int(np.ceil(height / band)))
    band = height / n_bands
    # The measured girth is the reference for "too wide"; without one, fall
    # back to a generous absolute cap rather than no cap at all.
    split_radius = (trunk_radius_m * SPLIT_RADIUS_FACTOR
                    if trunk_radius_m > 0 else 1.0)
    max_radius = (trunk_radius_m * MAX_RADIUS_FACTOR
                  if trunk_radius_m > 0 else 2.0)

    #: (centre_xz, radius, y_lo, y_hi) per accepted cluster, per band.
    per_band: list[list[tuple[np.ndarray, float, float, float]]] = []
    for bi in range(n_bands):
        lo = y_lo + bi * band
        hi = lo + band
        mask = (points[:, 1] >= lo) & (points[:, 1] < hi + (1e-6 if bi == n_bands - 1 else 0))
        band_pts = points[mask]
        accepted = []
        if len(band_pts) >= MIN_CLUSTER_POINTS:
            xz = band_pts[:, [0, 2]]
            for members in band_clusters(xz):
                for part in split_anisotropic(xz, members):
                    if len(part) < MIN_CLUSTER_POINTS:
                        continue
                    for centre, radius in fit_cluster(xz[part], split_radius, max_radius):
                        accepted.append((centre, radius, lo, hi))
        per_band.append(accepted)

    capsules = []
    for bi, clusters in enumerate(per_band):
        for centre, radius, lo, hi in clusters:
            capsules.append({
                "radiusM": round(radius, 3),
                "aM": [round(centre[0], 3), round(lo, 3), round(centre[1], 3)],
                "bM": [round(centre[0], 3), round(hi, 3), round(centre[1], 3)],
            })
            # Joining capsule to the closest cluster one band up, when the
            # axis steps sideways enough to notch a leaning trunk.
            if bi + 1 < len(per_band):
                best, best_d = None, 1e9
                for up_centre, up_radius, up_lo, up_hi in per_band[bi + 1]:
                    d = float(np.linalg.norm(up_centre - centre))
                    if d < best_d:
                        best, best_d = (up_centre, up_radius, up_lo, up_hi), d
                if best is not None:
                    up_centre, up_radius, up_lo, up_hi = best
                    reach = (radius + up_radius) * 0.9 + 0.6
                    if best_d <= reach and best_d > min(radius, up_radius) * 0.5:
                        r = round(min(radius, up_radius), 3)
                        capsules.append({
                            "radiusM": r,
                            "aM": [round(centre[0], 3), round((lo + hi) / 2, 3),
                                   round(centre[1], 3)],
                            "bM": [round(up_centre[0], 3),
                                   round((up_lo + up_hi) / 2, 3),
                                   round(up_centre[1], 3)],
                        })
    capsules = merge_stacked(capsules)
    # When the cap bites, keep the capsules the player can WALK INTO. Sorting
    # fattest-first spent the whole budget on canopy limbs and dropped the
    # slim base capsules the round-11 split produces — the anvil canopy palm
    # lost 96 of its 101 low wood samples that way. Low first, then fat.
    capsules.sort(key=lambda c: (min(c["aM"][1], c["bM"][1]), -c["radiusM"]))
    return capsules[:MAX_CAPSULES]


def merge_stacked(capsules: list[dict]) -> list[dict]:
    """Fuse vertically-stacked capsules of a straight trunk into one.

    Band fitting emits one capsule per band even where the trunk is dead
    straight; a beachpalm was 12 capsules that one describes. Two capsules
    merge when they are both vertical, meet end-to-end, and share centre and
    girth closely enough that the fused capsule adds no meaningful air.
    """
    changed = True
    while changed:
        changed = False
        for i in range(len(capsules)):
            a = capsules[i]
            if a is None or a["aM"][0] != a["bM"][0] or a["aM"][2] != a["bM"][2]:
                continue
            for j in range(len(capsules)):
                b = capsules[j]
                if i == j or b is None:
                    continue
                if b["aM"][0] != b["bM"][0] or b["aM"][2] != b["bM"][2]:
                    continue
                lateral = ((a["aM"][0] - b["aM"][0]) ** 2
                           + (a["aM"][2] - b["aM"][2]) ** 2) ** 0.5
                tol = max(0.1, 0.15 * min(a["radiusM"], b["radiusM"]))
                if lateral > tol:
                    continue
                if abs(a["bM"][1] - b["aM"][1]) > 0.05:
                    continue
                if abs(a["radiusM"] - b["radiusM"]) > 0.15 * max(a["radiusM"], b["radiusM"]):
                    continue
                capsules[i] = {
                    "radiusM": round(max(a["radiusM"], b["radiusM"]), 3),
                    "aM": a["aM"],
                    "bM": [a["bM"][0], b["bM"][1], a["bM"][2]],
                }
                capsules[j] = None
                changed = True
                break
    return [c for c in capsules if c is not None]


# --- manifest rewrite -------------------------------------------------------

def rewrite(manifest_path: Path) -> None:
    manifest = json.loads(manifest_path.read_text())
    glb_path = manifest_path.with_name(
        manifest.get("outputGlb", manifest_path.stem.replace(".kit", "") + ".glb"))
    if not glb_path.exists():
        glb_path = manifest_path.with_suffix("").with_suffix(".glb")
    if not glb_path.exists():
        glb_path = manifest_path.parent / (manifest_path.name.replace(".kit.json", ".glb"))
    gltf, blob, binoff = load_glb(glb_path)

    roots = {}
    for node in gltf["nodes"]:
        asset_id = node.get("extras", {}).get("assetId")
        if asset_id and "children" in node:
            roots[asset_id] = node

    rng = np.random.default_rng(11)
    blind = []
    for asset in manifest["assets"]:
        if asset.get("collision") != "trunk-capsule":
            continue
        root = roots.get(asset["id"])
        if root is None:
            print(f"[trunk-solids] {asset['id']}: no GLB node, left as-is")
            continue
        # sizeM is kit source space (z-up): [x, y, height].
        height = float(asset.get("sizeM", [0, 0, 0])[2])
        girth = float((asset.get("collisionCapsule") or {}).get("radiusM", 0.0))
        rejected: list[tuple[str, float]] = []
        lone: list[tuple[str, float]] = []
        limit = CARD_TRI_AREA_PER_HEIGHT2 * height * height
        points = wood_points(gltf, blob, binoff, root, rng, height, rejected,
                             lone)
        for texture, mean_area in sorted(set(rejected)):
            print(f"[trunk-solids] {asset['id']}: card rejected {texture} "
                  f"(mean tri {mean_area:.3f} m², limit {limit:.3f} m²)")
        for texture, mean_area in sorted(set(lone)):
            print(f"[trunk-solids] {asset['id']}: kept lone {texture} "
                  f"(mean tri {mean_area:.3f} m², limit {limit:.3f} m²)")
            if mean_area > LONE_CARD_FAIL_FACTOR * limit:
                blind.append(f"{asset['id']} ({texture}, "
                             f"{mean_area / limit:.1f}x the card limit)")
        capsules = fit_capsules(points, girth)
        if not capsules:
            # NO WOOD, SO NO SOLID (round 12). The single `collisionCapsule`
            # is measured over `solid_meshes or meshes` (blender/build_kit.py
            # `trunk_capsule`), so for a species with no separable wood it is
            # a SILHOUETTE of the whole plant — foliage included — never a
            # bole. Standing that up as a collider is what put 118 invisible
            # 0.26 m poles in a 12 m circle of bamboo at 3.62 km E · 6.26 km
            # S. `collision` drops to `none`, which is the same answer the
            # reeds and ferns already get; `collisionCapsule` stays for wind
            # stiffness, which is what it is honestly good for.
            asset.pop("collisionSegments", None)
            asset["collision"] = "none"
            asset["collisionFrame"] = "pivot-yup-v3"
            print(f"[trunk-solids] {asset['id']}: no wood mesh, WALK-THROUGH")
            continue
        asset["collisionSegments"] = capsules
        asset["collisionFrame"] = "pivot-yup-v3"
        print(f"[trunk-solids] {asset['id']}: {len(capsules)} capsules "
              f"from {len(points)} samples")
    for asset in manifest["assets"]:
        # Boxes ride the same frame tag; their semantics are unchanged.
        if asset.get("collision") == "convex" and asset.get("collisionFrame"):
            asset["collisionFrame"] = "pivot-yup-v3"
    if blind:
        # A species whose ONLY wood geometry is unmistakably a crossed fill
        # card would be fitted as a solid crown. Loud, not silent (source
        # gate): a new species with an unseen card texture stops the pass.
        raise SystemExit(
            "[trunk-solids] only wood geometry is a cutout card for: "
            + "; ".join(blind)
            + " — add its real trunk primitive or exclude the texture.")
    manifest["trunkSolids"] = {
        "fitter": "pipeline.trunk_solids",
        "cardTriAreaPerHeight2": CARD_TRI_AREA_PER_HEIGHT2,
        "maxRadiusFactor": MAX_RADIUS_FACTOR,
    }
    manifest_path.write_text(json.dumps(manifest, indent=1))
    print(f"[trunk-solids] wrote {manifest_path}")


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    for arg in argv:
        rewrite(Path(arg))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
