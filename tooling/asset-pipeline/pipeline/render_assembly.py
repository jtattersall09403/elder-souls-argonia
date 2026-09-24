"""Render an ASSEMBLY — several kit pieces standing together — as picture sheets.

Why: `render_sheet.py` answers "what does this mesh look like"; the settlement
compile's questions are "do these pieces meet", "does this piece sit in the
ground where its makers sank it", "which way does it face", "where is its
door" and "is the collider the shape you think". Those are read off four
straight-on orthographic elevations (front, back, left, right, keyed off the
piece's front arrow), a plan view, a 1 m grid and a 1.8 m human bar — off-world,
with no terrain, so a fresh Sonnet reader can judge an assembly from the sheet
alone (16h plan §8).

LEGIBILITY (16h ledger §4, round 3). A 30 deg perspective elevation had no
readable metre marks and its red ground plane vanished against dark stone, so
every elevation is now level and orthographic, and after the render
`annotate_frame` draws on the PNG (PIL, host side): a metre scale bar
bottom-left (1 m ticks, a number every 5 m), the asset ids and view name
top-left, and on elevations the ground line as a 3 px bright red CUT line with
a white halo across the full width (the Blender ground plane is hidden on
elevations) and a 1.8 m human bar standing on it. The plan gets the same bar and
label. The pixel arithmetic lives here (`pixels_per_metre`, `scale_bar`,
`ground_row`, `project`) and reads the camera the Blender script reports in
`<safeName>-frames.json`.

Round 6 (the Sonnet sample pass). Every view is framed to the pieces' own
bounding box with a 10 % margin (`frame_view`, called by the Blender script),
never to a fixed square round the ground and the human bar: a tree walkway
58 m above its ground was a speck. The front arrow is drawn here, on every
view (`arrow_glyph`): an arrow in plan and side elevations, a filled FRONT
badge where it points at the viewer, a ring where it points away. Pieces have a
ROLE (`piece_role`): `test` pieces render in full colour with their red plan
box, arrow, doorway dots and collider; `context` pieces (a template's anchor, a
mount pair's parent, a mount host ghosted behind a template asset,
`add_mount_hosts`) render at 40 % alpha with none of those, and the frame
carries the legend `CONTEXT_LEGEND`. The yellow dots are the test piece's own
doorways only, and only inside its box (`inside_box`); the co-placement
connectors stay in the job data and the sheet, never on the picture.

FRAMES AND THE ROTATION CONVENTION (read before changing any number here).

* The COMPILE frame is the bundle's `positionM` frame: y-up, x east, z south,
  and a placement's `yawDeg` rotates a piece-local point by
  ``wx = cx + x cos t - z sin t``, ``wz = cz + x sin t + z cos t``.
  This module is the only place that convention is re-implemented for pictures;
  it is copied, never changed (`place_pieces`).
* The KIT frame (a manifest's `sizeM`, `originOffsetM`, and the mined
  templates' `offsetM`) is z-up. glTF export from z-up gives
  ``(x, y, z)_kit -> (x, z, -y)_compile``; `kit_to_compile` is that one line.
* BLENDER is z-up, and its glTF importer applies the inverse of the export
  above, so a piece as imported sits in the KIT frame. A compile point
  ``(x, up, z)`` is therefore Blender ``(x, -z, up)``, and a compile yaw of
  ``t`` degrees about up is a Blender rotation of ``-t`` about +Z
  (substitute Bx=x, By=-z into the compile convention above).

Ground line: the SHARED CONTRACT defines `designedSinkM` as
``groundZ - pivotZ`` at the makers' placements, so the red ground line of a
piece is drawn at ``pivotZ + designedSinkM.p50``. A manifest without the field
(lane A adds it) gets its line at the pivot and the piece is labelled
`no sink record` in sheet.md.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
KITS_DIR = REPO_ROOT / "tooling/asset-pipeline/output/kits"
PLACEMENT_DIR = REPO_ROOT / "world/sources/placement"
ASSEMBLIES_PATH = PLACEMENT_DIR / "kit-assemblies-mined.json"
MOUNTS_PATH = PLACEMENT_DIR / "kit-mounts-mined.json"
TOOLCHAIN = json.loads((Path(__file__).parent / "config" / "toolchain.json").read_text())
BLENDER_SCRIPT = Path(__file__).parent / "blender" / "render_assembly.py"


# --------------------------------------------------------------------------- #
# frames
# --------------------------------------------------------------------------- #
def kit_to_compile(offset) -> list[float]:
    """A z-up kit/template offset `(x, y, z)` as a compile offset `(x, up, z)`."""
    x, y, z = offset
    return [float(x), float(z), -float(y)]


def place_pieces(pieces: list[dict]) -> list[dict]:
    """Resolve `parentId` chains into world transforms, by the compile convention.

    Each piece is `{id, assetId, positionM:[x,up,z], yawDeg, pitchDeg?, parentId?}`;
    a child's `positionM` is an offset in its parent's local frame. Returns the
    same dicts with `worldM` and `worldYawDeg` added.
    """
    by_id = {p["id"]: p for p in pieces}
    done: dict[str, dict] = {}

    def resolve(piece: dict, seen: frozenset) -> dict:
        pid = piece["id"]
        if pid in done:
            return done[pid]
        if pid in seen:
            raise SystemExit(f"parentId cycle at piece {pid}")
        x, up, z = (float(v) for v in piece["positionM"])
        yaw = float(piece.get("yawDeg") or 0.0)
        parent_id = piece.get("parentId")
        if parent_id:
            if parent_id not in by_id:
                raise SystemExit(f"piece {pid}: parentId {parent_id} is not in the assembly")
            parent = resolve(by_id[parent_id], seen | {pid})
            t = math.radians(parent["worldYawDeg"])
            px, pup, pz = parent["worldM"]
            x, up, z = (px + x * math.cos(t) - z * math.sin(t),
                        pup + up,
                        pz + x * math.sin(t) + z * math.cos(t))
            yaw += parent["worldYawDeg"]
        piece["worldM"] = [x, up, z]
        piece["worldYawDeg"] = yaw % 360.0
        done[pid] = piece
        return piece

    for piece in pieces:
        resolve(piece, frozenset())
    return pieces


# --------------------------------------------------------------------------- #
# kit data
# --------------------------------------------------------------------------- #
@dataclass
class KitIndex:
    """Every built kit, indexed by asset id (manifest + the three sidecars)."""

    asset_kit: dict[str, str] = field(default_factory=dict)
    manifests: dict[str, dict] = field(default_factory=dict)
    sidecars: dict[str, dict] = field(default_factory=dict)

    @classmethod
    def load(cls, kits_dir: Path = KITS_DIR) -> "KitIndex":
        idx = cls()
        for path in sorted(kits_dir.glob("*.kit.json")):
            manifest = json.loads(path.read_text())
            kit = manifest.get("kit") or path.name.split(".")[0]
            idx.manifests[kit] = {a["id"]: a for a in manifest["assets"]}
            for asset_id in idx.manifests[kit]:
                idx.asset_kit.setdefault(asset_id, kit)
            side = {}
            for kind in ("interiors", "connectors", "footprints"):
                sidecar = kits_dir / f"{kit}.{kind}.json"
                if sidecar.exists():
                    side[kind] = json.loads(sidecar.read_text()).get("assets", {})
            idx.sidecars[kit] = side
        return idx

    def kit_of(self, asset_id: str) -> str:
        kit = self.asset_kit.get(asset_id)
        if kit is None:
            raise SystemExit(f"{asset_id}: in no built kit under {KITS_DIR}")
        return kit

    def asset(self, asset_id: str) -> dict:
        return self.manifests[self.kit_of(asset_id)][asset_id]

    def glb(self, kit: str) -> Path:
        return KITS_DIR / f"{kit}.glb"

    def describe(self, asset_id: str) -> dict:
        """Everything the Blender script draws for one asset id."""
        kit = self.kit_of(asset_id)
        asset = self.manifests[kit][asset_id]
        side = self.sidecars.get(kit, {})
        interiors = side.get("interiors", {}).get(asset_id) or {}
        front = (interiors.get("front") or {}).get("deg")
        sink = asset.get("designedSinkM") or {}
        # A doorway is the interiors index's entrance (an offset in the piece's
        # own plan frame, x east / z south, with its sill height). A `radial`
        # entrance has a radius and no bearing — nothing to mark, so it is left
        # to the sheet's table. Connector marks are the CO-PLACEMENT connectors
        # (real joins the authors used); the four `bounds` faces of every piece
        # are bounding-box sides, not joins, and would bury the frame in dots.
        doorways = []
        entrance = interiors.get("entrance") or {}
        if entrance.get("offsetM"):
            ox, oz = entrance["offsetM"]
            doorways.append([float(ox), float(entrance.get("heightM") or 0.0), float(oz)])
        for doorway in (interiors.get("doorways") or []):
            if doorway.get("offsetLocalM"):
                doorways.append(kit_to_compile(doorway["offsetLocalM"]))
        connectors = [
            [float(c["positionInPiece"][0]), float(c.get("heightM") or 0.0) * 0.5,
             float(c["positionInPiece"][1])]
            for c in (side.get("connectors", {}).get(asset_id) or [])
            if c.get("evidence") == "co-placement"
        ]
        return {
            "assetId": asset_id,
            "kit": kit,
            "sizeM": asset.get("sizeM"),
            "originOffsetM": asset.get("originOffsetM"),
            "collision": asset.get("collision"),
            "collisionBox": asset.get("collisionBox"),
            "collisionParts": (asset.get("collision") or {}).get("parts")
            if isinstance(asset.get("collision"), dict) else None,
            "designedSinkM": sink.get("p50"),
            "sinkEvidence": sink.get("evidence"),
            "buryCapM": (asset.get("placement") or {}).get("buryCapM"),
            "frontDeg": front,
            "doorwaysM": doorways,
            "connectorsM": connectors,
            "entranceRadiusM": entrance.get("radiusM") if entrance.get("radial") else None,
            "anchorClass": asset.get("anchorClass"),
        }


# --------------------------------------------------------------------------- #
# assembly specs
# --------------------------------------------------------------------------- #
def spec_from_file(path: Path) -> dict:
    spec = json.loads(path.read_text())
    spec.setdefault("name", path.stem)
    for i, piece in enumerate(spec["pieces"]):
        piece.setdefault("id", f"p{i}")
    return spec


def spec_from_template(assemblies: dict, set_id: str, template_id: str) -> dict:
    templates = {t["id"]: t for t in assemblies["sets"][set_id]["templates"]}
    if template_id not in templates:
        raise SystemExit(f"{set_id}: no template {template_id}")
    template = templates[template_id]
    # A `radial` template has no fixed bearing: the authors stood the part at a
    # constant RADIUS on any side. There is one distance to draw, so it is drawn
    # due north at that radius and the sheet says the bearing is free.
    radial = template["offsetM"] is None
    offset = (kit_to_compile(template["offsetM"]) if not radial
              else [0.0, float(template.get("riseM") or 0.0),
                    -float(template["radiusM"])])
    return {
        "name": f"template.{template_id}",
        "source": {"kind": "template", "set": set_id, "templateId": template_id,
                   "count": template.get("count"), "family": template.get("family"),
                   # `templateKind`, never a second `kind`: the dict literal kept
                   # the last one, so every template read as source kind "fixed".
                   "templateKind": template.get("kind"),
                   "bearing": "free (radial): drawn due north" if radial else "fixed"},
        "pieces": [
            {"id": "anchor", "assetId": template["anchor"],
             "positionM": [0.0, 0.0, 0.0], "yawDeg": 0.0},
            {"id": "part", "assetId": template["part"],
             "positionM": offset,
             "yawDeg": float(template.get("yawDeg") or 0.0)},
        ],
    }


def spec_from_mount_pair(mounts: dict, child: str, parent: str) -> dict:
    for pair in mounts.get("pairs", []):
        if pair["child"] == child and pair["parent"] == parent:
            return {
                "name": f"mount.{_safe(child)}.on.{_safe(parent)}",
                "source": {"kind": "mount-pair", "n": pair.get("n"),
                           "spreadM": pair.get("spreadM"), "evidence": pair.get("evidence")},
                "pieces": [
                    # The offset was mined against the parent at its placed
                    # scale, so the parent renders at that scale.
                    {"id": "parent", "assetId": parent, "positionM": [0.0, 0.0, 0.0],
                     "yawDeg": 0.0, "scale": float(pair.get("parentScale") or 1.0)},
                    {"id": "child", "assetId": child, "parentId": "parent",
                     "positionM": kit_to_compile(pair["offsetM"]),
                     "yawDeg": float(pair.get("yawDeg") or 0.0)},
                ],
            }
    raise SystemExit(f"no mined mount pair {child} on {parent}")


def specs_for_kit_sheet(index: KitIndex, kit: str, mounts: dict | None) -> list[dict]:
    """One single-piece assembly per asset of a kit, each with its mount children."""
    if kit not in index.manifests:
        raise SystemExit(f"{kit}: not built under {KITS_DIR}")
    children: dict[str, list[dict]] = {}
    for pair in (mounts or {}).get("pairs", []):
        children.setdefault(pair["parent"], []).append(pair)
    specs = []
    for asset_id in sorted(index.manifests[kit]):
        pieces = [{"id": "piece", "assetId": asset_id, "positionM": [0.0, 0.0, 0.0],
                   "yawDeg": 0.0}]
        for i, pair in enumerate(children.get(asset_id, [])):
            if pair["child"] in index.asset_kit:
                pieces.append({"id": f"mount{i}", "assetId": pair["child"],
                               "parentId": "piece",
                               "positionM": kit_to_compile(pair["offsetM"]),
                               "yawDeg": float(pair.get("yawDeg") or 0.0)})
        specs.append({"name": f"{kit}.{_safe(asset_id)}",
                      "source": {"kind": "kit-sheet", "kit": kit}, "pieces": pieces})
    return specs


def all_template_specs(assemblies: dict, index: KitIndex,
                       built_only: bool = True) -> list[dict]:
    specs = []
    for set_id, kit_set in assemblies["sets"].items():
        for template in kit_set["templates"]:
            if built_only and not (template["anchor"] in index.asset_kit
                                   and template["part"] in index.asset_kit):
                continue
            specs.append(spec_from_template(assemblies, set_id, template["id"]))
    return specs


def _safe(text: str) -> str:
    return text.replace(":", "__").replace("/", "_").replace(" ", "_")


# --------------------------------------------------------------------------- #
# legibility: views, overrides and the post-render pixel arithmetic
# --------------------------------------------------------------------------- #
ELEVATIONS = ("front", "back", "left", "right")
VIEWS = ELEVATIONS + ("plan", "collider")
CUT_RED = (255, 48, 48)
MAGENTA = [1.0, 0.0, 1.0, 1.0]
GHOST_ALPHA = 0.4
MARGIN_PX = 16

# Render presets (16h tooling lane B2). `owner` is the full sheet a person
# judges; `sonnet` is what a Sonnet reader needs to answer the sheet's checks
# (plan, front and one side) at a quarter of the pixels and half the samples.
PRESETS = {
    "owner": {"res": 512, "views": VIEWS, "samples": 12},
    "sonnet": {"res": 256, "views": ("front", "right", "plan"), "samples": 6},
}
DEFAULT_PRESET = "owner"
# Blender sessions rendered side by side, one per kit group (lane B2).
DEFAULT_RENDER_JOBS = 2


def elevation_bearings(front_deg: float) -> dict[str, float]:
    """Camera bearing (compile frame, north = 0, clockwise) of each elevation.

    The camera stands on the side it is named for: `front` looks at the face
    the front arrow points out of; `right` is the piece's own right-hand side
    (front + 90 deg, clockwise).
    """
    return {"front": front_deg % 360.0, "right": (front_deg + 90.0) % 360.0,
            "back": (front_deg + 180.0) % 360.0, "left": (front_deg + 270.0) % 360.0}


def piece_role(source_kind: str, piece: dict) -> str:
    """`test` (judged: full colour, marks) or `context` (ghosted, no marks).

    A template places its `part` against its `anchor`, so the part is the piece
    under test; a mount pair judges the child on its parent. A spec may set
    `role` itself (the mount hosts do).
    """
    if piece.get("role"):
        return piece["role"]
    if source_kind == "template" and piece.get("id") == "anchor":
        return "context"
    if source_kind == "mount-pair" and not piece.get("parentId"):
        return "context"
    return "test"


def render_override(source_kind: str, piece: dict) -> dict | None:
    """The material a piece renders with: mount-pair child magenta, context ghosted."""
    if source_kind == "mount-pair" and piece.get("parentId"):
        return {"kind": "emission", "rgba": list(MAGENTA)}
    if piece_role(source_kind, piece) == "context":
        return {"kind": "ghost", "alpha": GHOST_ALPHA}
    return None


# --------------------------------------------------------------------------- #
# framing and projection (the Blender script imports these; Blender frame:
# z up, x east, y north)
# --------------------------------------------------------------------------- #
FRAME_MARGIN = 0.10          # of the box, each side
DOT_TOLERANCE_M = 0.3


def view_axes(view: str, bearing_deg: float) -> tuple[tuple, tuple, tuple]:
    """(image right, image up, toward the camera) in the Blender frame.

    The plan is north-up whatever the bearing; an elevation's camera stands at
    `bearing_deg` (compile frame, north = 0, clockwise = Blender (sin, cos)).
    """
    if view == "plan":
        return (1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0)
    t = math.radians(bearing_deg)
    toward = (math.sin(t), math.cos(t), 0.0)
    return (-toward[1], toward[0], 0.0), (0.0, 0.0, 1.0), toward


def _dot(a, b) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def frame_view(points, view: str, bearing_deg: float, margin: float = FRAME_MARGIN,
               min_span_m: float = 1.0) -> dict:
    """The orthographic frame that holds `points` with `margin` of the box each side.

    Square frame: Blender's ortho scale spans the larger image side, so the
    scale is the larger projected extent. Returns the axes, the scale, the
    centre (on the box's mid-depth) and the depth, for the camera and for
    `project`.
    """
    right, up, toward = view_axes(view, bearing_deg)
    spans = []
    for axis in (right, up, toward):
        values = [_dot(p, axis) for p in points]
        spans.append((min(values), max(values)))
    (r0, r1), (u0, u1), (t0, t1) = spans
    scale = max(r1 - r0, u1 - u0, min_span_m) * (1.0 + 2.0 * margin)
    cr, cu, ct = (r0 + r1) / 2, (u0 + u1) / 2, (t0 + t1) / 2
    centre = tuple(cr * right[i] + cu * up[i] + ct * toward[i] for i in range(3))
    return {"orthoScale": scale, "centre": list(centre), "centreUpM": centre[2],
            "right": list(right), "up": list(up), "toward": list(toward),
            "depthM": t1 - t0}


def project(meta: dict, point) -> tuple[float, float]:
    """A Blender-frame point -> pixel (x right, y down) in a frame `frame_view` made."""
    res, ppm = int(meta["res"]), pixels_per_metre(float(meta["orthoScale"]), int(meta["res"]))
    rel = [point[i] - meta["centre"][i] for i in range(3)]
    return res / 2 + _dot(rel, meta["right"]) * ppm, res / 2 - _dot(rel, meta["up"]) * ppm


def inside_box(point, lo, hi, tol: float = DOT_TOLERANCE_M) -> bool:
    return all(lo[i] - tol <= point[i] <= hi[i] + tol for i in range(3))


def compile_to_blender(point) -> tuple[float, float, float]:
    x, up, z = point
    return float(x), -float(z), float(up)


def template_host(assemblies: dict | None, asset_id: str, index: KitIndex,
                  prefer_set: str | None = None) -> dict | None:
    """A host from the template sets: a template placing `asset_id` as its PART
    against a different, built ANCHOR (a window against its house), as a
    pair-shaped dict {parent, offsetM, yawDeg}. The spec's own set first, then
    the most-observed.
    """
    best, best_key = None, None
    for set_id, kit_set in ((assemblies or {}).get("sets") or {}).items():
        for t in kit_set["templates"]:
            if (t["part"] != asset_id or t["anchor"] == asset_id
                    or t["anchor"] not in index.asset_kit or t.get("offsetM") is None):
                continue
            key = (set_id == prefer_set, t.get("count") or 0)
            if best_key is None or key > best_key:
                best, best_key = t, key
    if best is None:
        return None
    return {"parent": best["anchor"], "offsetM": best["offsetM"],
            "yawDeg": float(best.get("yawDeg") or 0.0), "templateId": best["id"]}


def add_mount_hosts(spec: dict, mounts: dict | None, index: KitIndex,
                    assemblies: dict | None = None) -> dict:
    """Ghost each test piece's host behind it (a window needs its wall).

    For a root piece whose asset is a mount CHILD, the most-observed pair with
    a built parent is inverted: the host stands where the pair would put the
    child exactly on this piece. With no mined pair, a template placing the
    asset as its part against another anchor (`template_host`) stands in.
    Added as a `context` piece `host-<id>`.
    """
    pairs: dict[str, dict] = {}
    for pair in (mounts or {}).get("pairs", []):
        if pair["parent"] not in index.asset_kit or not pair.get("offsetM"):
            continue
        best = pairs.get(pair["child"])
        if best is None or (pair.get("n") or 0) > (best.get("n") or 0):
            pairs[pair["child"]] = pair
    source = spec.get("source", {}).get("kind", "")
    prefer_set = (spec.get("source") or {}).get("set")
    hosts = []
    placed = place_pieces([dict(p) for p in spec["pieces"]])

    def standing(asset_id: str, pos, yaw: float) -> bool:
        """The host is already in the assembly (t0429: it is the anchor)."""
        return any(p["assetId"] == asset_id
                   and math.dist(p["worldM"], pos) < 0.25
                   and abs((p["worldYawDeg"] - yaw + 180.0) % 360.0 - 180.0) < 2.0
                   for p in placed)

    for piece in placed:
        if piece.get("parentId") or piece_role(source, piece) != "test":
            continue
        pair = pairs.get(piece["assetId"]) or template_host(
            assemblies, piece["assetId"], index, prefer_set)
        if pair is None:
            continue
        yaw = piece["worldYawDeg"] - float(pair.get("yawDeg") or 0.0)
        ox, oup, oz = kit_to_compile(pair["offsetM"])
        t = math.radians(yaw)
        x, up, z = piece["worldM"]
        position = [x - (ox * math.cos(t) - oz * math.sin(t)), up - oup,
                    z - (ox * math.sin(t) + oz * math.cos(t))]
        if standing(pair["parent"], position, yaw % 360.0):
            continue
        hosts.append({"id": f"host-{piece['id']}", "assetId": pair["parent"],
                      "role": "context", "positionM": position, "yawDeg": yaw % 360.0})
    return {**spec, "pieces": list(spec["pieces"]) + hosts}


def pixels_per_metre(ortho_scale: float, res: int) -> float:
    """A square frame: Blender's orthographic scale spans the full width and height."""
    return res / ortho_scale


def scale_bar(ortho_scale: float, res: int, margin: int = MARGIN_PX) -> dict:
    """The metre bar along the bottom-left: a whole number of 5 m, at least 5 m.

    About half the frame wide, never wider than the frame less its margins.
    """
    ppm = pixels_per_metre(ortho_scale, res)
    length = 5 * max(1, math.floor(0.5 * ortho_scale / 5))
    length = max(1, min(length, math.floor((res - 2 * margin) / ppm)))
    x0 = float(margin)
    ticks = [x0 + ppm * i for i in range(length + 1)]
    step = 5 if length >= 5 else 1          # a short bar (a close frame) numbers every metre
    labels = [(x0 + ppm * i, str(i)) for i in range(0, length + 1, step)]
    return {"x0": x0, "y": res - margin - 4, "ppm": ppm, "lengthM": length,
            "ticks": ticks, "labels": labels}


def ground_row(ground_m: float, centre_m: float, ortho_scale: float,
               res: int) -> tuple[int, str | None]:
    """The pixel row a level elevation projects the ground line to.

    The camera looks level at height `centre_m`, which lands on the middle row;
    rows count down. Off the frame the row is clamped inside it (room for the
    3 px line and its halo) and the side is returned.
    """
    row = round(res / 2 - (ground_m - centre_m) * pixels_per_metre(ortho_scale, res))
    if row > res - 3:
        return res - 3, "below"
    if row < 2:
        return 2, "above"
    return row, None


ARROW_GREEN = (40, 230, 60)
HUMAN_FILL = (225, 225, 230)
CONTEXT_LEGEND = "solid = under test, ghost = context"
ARROW_HEAD_M = 0.4
HEAD_ON = 0.7            # |cos| between the arrow and the view axis


def arrow_glyph(meta: dict, arrow: dict) -> str:
    """`toward` the viewer, `away` from it, or an `arrow` across the frame."""
    along = _dot(arrow["directionM"], meta["toward"])
    if along > HEAD_ON:
        return "toward"
    if along < -HEAD_ON:
        return "away"
    return "arrow"


def draw_arrow(draw, meta: dict, arrow: dict, font) -> None:
    """The front arrow: shaft from the pivot, 0.4 m head (never under 8 px)."""
    ppm = pixels_per_metre(float(meta["orthoScale"]), int(meta["res"]))
    ox, oy = project(meta, arrow["originM"])
    glyph = arrow_glyph(meta, arrow)
    radius = min(12.0, max(7.0, 0.3 * ppm))     # a badge, never a disc hiding the piece
    if glyph != "arrow" and arrow.get("topM") is not None:
        # Head on, the badge stands just above the piece: on the piece it hid
        # a small mount child entirely.
        oy = project(meta, [arrow["originM"][0], arrow["originM"][1], arrow["topM"]])[1]
        oy -= radius + 3
    box = (ox - radius, oy - radius, ox + radius, oy + radius)
    if glyph == "toward":
        draw.ellipse(box, fill=ARROW_GREEN, outline=(0, 0, 0), width=2)
        draw.ellipse((ox - 2, oy - 2, ox + 2, oy + 2), fill=(0, 0, 0))
        draw.text((ox, oy - radius - 3), "FRONT", fill=ARROW_GREEN, font=font,
                  anchor="mb", stroke_width=2, stroke_fill=(0, 0, 0))
        return
    if glyph == "away":
        draw.ellipse(box, outline=(0, 0, 0), width=5)
        draw.ellipse(box, outline=ARROW_GREEN, width=3)
        return
    tip_m = [arrow["originM"][i] + arrow["directionM"][i] * arrow["lengthM"] for i in range(3)]
    tx, ty = project(meta, tip_m)
    dx, dy = tx - ox, ty - oy
    norm = math.hypot(dx, dy) or 1.0
    ux, uy = dx / norm, dy / norm
    head = max(8.0, ARROW_HEAD_M * ppm)
    bx, by = tx - ux * head, ty - uy * head
    wing = (-uy * head * 0.55, ux * head * 0.55)
    head_poly = [(tx, ty), (bx + wing[0], by + wing[1]), (bx - wing[0], by - wing[1])]
    draw.line((ox, oy, bx, by), fill=(0, 0, 0), width=6)
    draw.polygon(head_poly, fill=ARROW_GREEN, outline=(0, 0, 0))
    draw.line((ox, oy, bx, by), fill=ARROW_GREEN, width=3)
    draw.ellipse((ox - 3, oy - 3, ox + 3, oy + 3), fill=ARROW_GREEN, outline=(0, 0, 0))


def _font(res: int):
    from PIL import ImageFont
    return ImageFont.load_default(size=max(11, res // 40))


def annotate_frame(png: Path, view: str, label: str, meta: dict,
                   ground_m: float | None, arrows: list[dict] | None = None,
                   legend: str | None = None) -> str | None:
    """Draw the metre bar, the label, the front arrows and (elevations) the cut line.

    `ground_m` None (the plan) draws no cut line and no human bar. Arrows need
    the camera `frame_view` reports (`centre`, `right`, `up`, `toward`); a frames
    file from before round 6 has none and gets no arrow. Returns the off-frame
    note drawn beside a clamped ground line, else None.
    """
    from PIL import Image, ImageDraw
    img = Image.open(png).convert("RGB")
    res, scale = int(meta["res"]), float(meta["orthoScale"])
    draw = ImageDraw.Draw(img)
    font = _font(res)
    note = None
    if ground_m is not None:
        row, clamp = ground_row(ground_m, float(meta["centreUpM"]), scale, res)
        draw.rectangle((0, row - 2, res - 1, row + 2), fill=(255, 255, 255))
        draw.rectangle((0, row - 1, res - 1, row + 1), fill=CUT_RED)
        if clamp:
            note = f"(ground {clamp} frame)"
            ty = row - 18 if clamp == "below" else row + 5
            draw.text((res - MARGIN_PX, ty), note, fill=CUT_RED, font=font, anchor="ra",
                      stroke_width=1, stroke_fill=(0, 0, 0))
        else:
            # The 1.8 m human stands on the cut line at the right edge, drawn as
            # an outline so it never hides the piece behind it.
            ppm = pixels_per_metre(scale, res)
            # Floors on both sides: a frame spanning hundreds of metres has
            # under 1.1 px per metre, and an unfloored figure inverts its own
            # rectangle (PIL refuses y1 < y0; seen on a 663 m mount pair).
            w = max(3.0, 0.5 * ppm)
            h = max(4.0, 1.8 * ppm)
            x1 = res - MARGIN_PX
            draw.rectangle((x1 - w - 1, row - h - 1, x1 + 1, row - 1),
                           outline=(0, 0, 0), width=4)
            draw.rectangle((x1 - w, row - h, x1, row - 2), outline=HUMAN_FILL,
                           width=2)
    if "centre" in meta:
        for arrow in arrows or []:
            draw_arrow(draw, meta, arrow, font)
    bar = scale_bar(scale, res)
    x0, x1, y = bar["x0"], bar["ticks"][-1], bar["y"]
    draw.rectangle((x0 - 1, y - 2, x1 + 1, y + 2), fill=(0, 0, 0))
    draw.rectangle((x0, y - 1, x1, y + 1), fill=(255, 255, 255))
    for i, x in enumerate(bar["ticks"]):
        top = y - (9 if i % 5 == 0 else 5)
        draw.rectangle((x - 1, top - 1, x + 1, y), fill=(0, 0, 0))
        draw.line((x, top, x, y), fill=(255, 255, 255))
    for x, text in bar["labels"]:
        draw.text((x, y - 11), text, fill=(255, 255, 255), font=font, anchor="mb",
                  stroke_width=1, stroke_fill=(0, 0, 0))
    draw.text((x1 + 6, y), "m", fill=(255, 255, 255), font=font, anchor="lm",
              stroke_width=1, stroke_fill=(0, 0, 0))
    heading = f"{label}  [{view}]"
    box = draw.textbbox((4, 4), heading, font=font)
    draw.rectangle((0, 0, box[2] + 4, box[3] + 4), fill=(0, 0, 0))
    draw.text((4, 4), heading, fill=(255, 255, 255), font=font)
    if legend:
        top = box[3] + 6
        lbox = draw.textbbox((4, top), legend, font=font)
        draw.rectangle((0, top - 2, lbox[2] + 4, lbox[3] + 4), fill=(0, 0, 0))
        draw.text((4, top), legend, fill=(255, 230, 120), font=font)
    img.save(png)
    return note


def assembly_arrows(assembly: dict, boxes: dict) -> list[dict]:
    """One front arrow per TEST piece with a front bearing, from its pivot.

    The origin is the pivot raised to the middle of the piece's rendered box (the
    Blender script reports each box), so an elevation shows it on the piece, not
    on the cut line; the plan projects it onto the pivot.
    """
    arrows = []
    for piece in assembly["pieces"]:
        if piece.get("role", "test") != "test" or piece.get("frontDeg") is None:
            continue
        box = boxes.get(piece["id"])
        if not box:
            continue
        lo, hi = box["lo"], box["hi"]
        bx, by, _ = compile_to_blender(piece["worldM"])
        t = math.radians(float(piece["frontDeg"]) + float(piece["worldYawDeg"]))
        length = max(1.0, 0.4 * max(hi[0] - lo[0], hi[1] - lo[1]))
        arrows.append({"originM": [bx, by, (lo[2] + hi[2]) / 2],
                       "directionM": [math.sin(t), math.cos(t), 0.0],
                       "lengthM": length, "topM": hi[2]})
    return arrows


def annotate_assembly(out_dir: Path, assembly: dict) -> int:
    """Annotate every elevation Blender reported for one assembly; frames drawn."""
    meta_path = out_dir / f"{assembly['safeName']}-frames.json"
    if not meta_path.exists():
        return 0
    frames = json.loads(meta_path.read_text())
    boxes = frames.pop("pieces", {})
    tested = [p for p in assembly["pieces"] if p.get("role", "test") == "test"]
    label = " + ".join(p["assetId"] for p in (tested or assembly["pieces"]))
    legend = (CONTEXT_LEGEND if any(p.get("role") == "context" for p in assembly["pieces"])
              else None)
    arrows = assembly_arrows(assembly, boxes)
    drawn = 0
    for view, meta in frames.items():
        png = out_dir / f"{assembly['safeName']}-{view}.png"
        if png.exists():
            annotate_frame(png, view, label, meta,
                           None if view == "plan" else assembly["groundLineM"],
                           arrows=arrows, legend=legend)
            drawn += 1
    return drawn


def _root_pieces(pieces: list[dict]) -> list[dict]:
    return [p for p in pieces if not p.get("parentId")]


def _judged_roots(pieces: list[dict]) -> list[dict]:
    roots = _root_pieces(pieces) or pieces
    return [p for p in roots if p.get("role", "test") == "test"] or roots


def assembly_ground_line(pieces: list[dict]) -> float:
    """The first judged root piece's designed ground line: pivot up + designedSinkM."""
    roots = _judged_roots(pieces)
    first = roots[0]
    return float(first["worldM"][1]) + float(first.get("designedSinkM") or 0.0)


def assembly_front_bearing(pieces: list[dict]) -> float:
    """The first judged root piece with a front arrow; north (0) when none has one."""
    for piece in _judged_roots(pieces):
        if piece.get("frontDeg") is not None:
            return (float(piece["frontDeg"]) + float(piece["worldYawDeg"])) % 360.0
    return 0.0


# --------------------------------------------------------------------------- #
# the render job
# --------------------------------------------------------------------------- #


def flatten(spec: dict, index: KitIndex) -> dict:
    """Drop the whole assembly so the first TEST root's designed ground line is up = 0.

    `--flat` judges KIT truth, not terrain: the judged piece stands on the
    plane at its makers' sink, so a piece floating above its line or drowned
    below it is visible as itself. One offset for every root (round 6): a
    per-root drop threw away the mined rise between a template's anchor and
    part (t0429's roof corner). Children keep their parent-local offsets.
    """
    kind = (spec.get("source") or {}).get("kind", "")
    roots = [p for p in spec["pieces"] if not p.get("parentId")]
    judged = [p for p in roots if piece_role(kind, p) == "test"] or roots
    first = judged[0] if judged else None
    drop = 0.0
    if first is not None:
        sink = (index.asset(first["assetId"]).get("designedSinkM") or {}).get("p50")
        drop = float(first["positionM"][1]) + float(sink or 0.0)
    pieces = []
    for piece in spec["pieces"]:
        piece = dict(piece)
        if not piece.get("parentId"):
            x, up, z = (float(v) for v in piece["positionM"])
            piece["positionM"] = [x, up - drop, z]
        pieces.append(piece)
    return {**spec, "pieces": pieces, "groundZ": 0.0, "flat": True}


def build_jobs(specs: list[dict], index: KitIndex, out_dir: Path, res: int | None = None,
               flat: bool = False, preset: str = DEFAULT_PRESET) -> dict:
    chosen = PRESETS[preset]
    jobs = {"res": int(res or chosen["res"]), "views": list(chosen["views"]),
            "samples": chosen["samples"], "preset": preset, "assemblies": []}
    for spec in specs:
        if flat:
            spec = flatten(spec, index)
        pieces = place_pieces([dict(p) for p in spec["pieces"]])
        job_pieces = []
        for piece in pieces:
            described = index.describe(piece["assetId"])
            described.update({
                "id": piece["id"],
                "worldM": piece["worldM"],
                "worldYawDeg": piece["worldYawDeg"],
                "pitchDeg": float(piece.get("pitchDeg") or 0.0),
                "scale": float(piece.get("scale") or 1.0),
                "parentId": piece.get("parentId"),
                "glb": str(index.glb(described["kit"]).resolve()),
            })
            kind = (spec.get("source") or {}).get("kind", "")
            described["role"] = piece_role(kind, {**described, "role": piece.get("role")})
            described["override"] = render_override(kind, described)
            # The yellow dots are this piece's own doorways, and only a test
            # piece's; connectors stay data (the sheet table), never dots.
            described["dotsM"] = (list(described["doorwaysM"])
                                  if described["role"] == "test" else [])
            job_pieces.append(described)
        front = assembly_front_bearing(job_pieces)
        jobs["assemblies"].append({
            "name": spec["name"],
            "safeName": _safe(spec["name"]),
            "groundZ": float(spec.get("groundZ") or 0.0),
            "groundLineM": assembly_ground_line(job_pieces),
            "frontBearingDeg": front,
            "elevationBearingsDeg": elevation_bearings(front),
            "pieces": job_pieces,
            "source": spec.get("source", {}),
        })
    jobs["outDir"] = str(out_dir.resolve())
    return jobs


def _expand(p: str) -> Path:
    return Path(os.path.expanduser(p))


def to_windows(path: Path) -> str:
    return "Z:" + str(path.resolve()).replace("/", "\\")


def run_blender(jobs: dict, out_dir: Path, jobs_name: str = "jobs.json") -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    jobs_path = out_dir / jobs_name
    # Blender runs under Wine: every path it opens must be a Windows path. The
    # jobs the host keeps (tests, stamps) stay POSIX: the conversion is on a copy.
    jobs = {**jobs, "assemblies": [
        {**assembly, "pieces": [{**piece, "glb": to_windows(Path(piece["glb"]))}
                                for piece in assembly["pieces"]]}
        for assembly in jobs["assemblies"]]}
    jobs_path.write_text(json.dumps(jobs, indent=1))
    env = dict(os.environ)
    env["WINEPREFIX"] = str(_expand(TOOLCHAIN["winePrefix"]))
    env["WINEDEBUG"] = "-all"
    env["JOBS"] = to_windows(jobs_path)
    env["OUTDIR"] = to_windows(out_dir)
    cmd = [str(_expand(TOOLCHAIN["wine"])), str(_expand(TOOLCHAIN["blender"])),
           "--background", "--python", to_windows(BLENDER_SCRIPT)]
    proc = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=3600)
    for line in proc.stdout.splitlines():
        if line.startswith("[assembly]"):
            print("   " + line)
    # Blender exits 0 when a --python script raises: the script's closing line
    # is the only proof it ran (round 6: a failed import re-annotated old PNGs).
    if proc.returncode != 0 or "[assembly] done" not in proc.stdout:
        sys.stderr.write(proc.stdout[-6000:] + proc.stderr[-6000:])
        raise SystemExit("assembly render failed")


CHECKS = [
    "Do the pieces MEET — no gap, no interpenetration — where the template says they do?",
    "Does the piece's own base meet the red ground cut line on every elevation",
    "  (a piece floating above the line, or drowned below it, is a defect)?",
    "Is the green front arrow pointing at the open side you would walk up to?",
    "  (plan and side views: an arrow from the pivot; the front view: a filled",
    "  FRONT badge; the back view: a green ring).",
    "Are the yellow doorway dots on a face you can reach, not inside another piece?",
    "Is the cyan collider the shape of the thing, or a box swallowing the gaps?",
    "  (the table says which: `mesh` is the geometry's own wire, `box` a declared",
    "  volume, `none` no collider at all — nothing cyan in the frame).",
    "Against the 1.8 m human bar and the metre scale, is the piece the size the place needs?",
    "In a mount pair, is the magenta child hanging from the right part of the faded parent?",
]


def write_sheet(jobs: dict, out_dir: Path) -> Path:
    views = list(jobs.get("views") or VIEWS)
    lines = ["# Assembly sheets", "",
             f"{len(jobs['assemblies'])} assemblies, {len(views)} frames each "
             f"({', '.join(f'`-{v}`' for v in views)}; elevations are level orthographic "
             "views keyed off the front arrow; `-plan` is the orthographic top; "
             "`-collider` is the front elevation with the collider wire shown).",
             "Elevations carry a metre scale bottom-left (1 m ticks, a number every 5 m) "
             "and the designed ground line as a red cut line; plan grid squares are 1 m; "
             "the pale bar standing on the cut line is 1.8 m; every view is framed to the "
             "pieces with a 10 % margin, so read sizes off the scale bar, never the frame; "
             "green = the front arrow; yellow = the tested piece's doorways; "
             "cyan = the collider; solid pieces are under test, ghosted (40 %) pieces are "
             "context; in a mount pair the child is magenta.", "",
             "## What to check on every frame", ""]
    lines += [f"- {c}" if not c.startswith("  ") else c for c in CHECKS]
    for assembly in jobs["assemblies"]:
        lines += ["", f"## {assembly['name']}", ""]
        if assembly.get("source"):
            lines.append(f"Source: `{json.dumps(assembly['source'])}`")
            lines.append("")
        lines += ["| piece | asset | x,up,z m | yaw deg | sink m | front deg | "
                  "doorways | collider |",
                  "|---|---|---|---|---|---|---|---|"]
        for piece in assembly["pieces"]:
            x, up, z = piece["worldM"]
            sink = ("no sink record" if piece["designedSinkM"] is None
                    else f"{piece['designedSinkM']:.2f} ({piece['sinkEvidence']})")
            front = "none" if piece["frontDeg"] is None else f"{piece['frontDeg']:.0f}"
            parent = f" (on {piece['parentId']})" if piece.get("parentId") else ""
            if piece.get("role") == "context":
                parent += " (context)"
            lines.append(f"| {piece['id']}{parent} | `{piece['assetId']}` | "
                         f"{x:.2f}, {up:.2f}, {z:.2f} | {piece['worldYawDeg']:.1f} | "
                         f"{sink} | {front} | {len(piece['doorwaysM'])} | "
                         f"{'box' if piece.get('collisionBox') else piece.get('collision') or 'none'} |")
        frames = ", ".join(f"`{assembly['safeName']}-{v}.png`" for v in views)
        lines += ["", f"Frames: {frames}"]
    path = out_dir / "sheet.md"
    text = "\n".join(lines) + "\n"
    # A partial re-render MERGES its sections into the batch's sheet: the rows
    # of assemblies not in this job stay (round 6 overwrote a 377-row sheet).
    if path.exists():
        text = merge_sheet(path.read_text(), text)
    path.write_text(text)
    return path


SHEET_FIXED = "What to check on every frame"


def _sheet_sections(text: str) -> tuple[str, dict[str, str]]:
    """(the header up to the first assembly, {assembly name: its section})."""
    parts = text.split("\n## ")
    head, sections = parts[0], {}
    for part in parts[1:]:
        name = part.split("\n", 1)[0]
        if name == SHEET_FIXED:
            head += "\n## " + part
        else:
            sections[name] = "## " + part
    return head, sections


def merge_sheet(old: str, new: str) -> str:
    _, old_sections = _sheet_sections(old)
    head, new_sections = _sheet_sections(new)
    merged = {**old_sections, **new_sections}
    first_line = head.split("\n")[2]
    head = head.replace(first_line, f"{len(merged)} assemblies"
                        + first_line[first_line.index(","):], 1)
    body = "\n".join(s.rstrip("\n") + "\n" for s in merged.values())
    return head.rstrip("\n") + "\n\n" + body


def frames_exist(out_dir: Path, safe_name: str, views=VIEWS) -> bool:
    return all((out_dir / f"{safe_name}-{v}.png").exists() for v in views)


#: The piece fields a sheet's geometry depends on besides the kit GLB: a
#: mined pair's offsetM/yawDeg land here as the child's pose (16h K10 F).
POSE_KEYS = ("id", "assetId", "parentId", "positionM", "yawDeg", "pitchDeg", "scale")


def pose_hash(assembly: dict) -> str:
    """sha256 over every piece's pose, so a re-mined pair offset or yaw makes
    `--skip-existing` re-render the sheet even when no kit GLB changed."""
    import hashlib
    poses = [[p.get(k) for k in POSE_KEYS] for p in assembly["pieces"]]
    return hashlib.sha256(json.dumps(poses, sort_keys=True).encode()).hexdigest()[:16]


def assembly_stamp(assembly: dict, preset: dict) -> dict:
    """What a render depends on: each kit GLB's mtime + size, the pieces'
    poses (`pose_hash`) and the preset."""
    kits = {}
    for glb in sorted({p["glb"] for p in assembly["pieces"]}):
        st = Path(glb).stat()
        kits[glb] = [st.st_mtime_ns, st.st_size]
    return {"kits": kits, "pose": pose_hash(assembly), "preset": {"res": int(preset["res"]),
                                     "views": list(preset["views"]),
                                     "samples": int(preset["samples"])}}


def _stamp_path(out_dir: Path, assembly: dict) -> Path:
    return out_dir / f"{assembly['safeName']}.stamp.json"


def write_stamp(out_dir: Path, assembly: dict, preset: dict) -> None:
    _stamp_path(out_dir, assembly).write_text(json.dumps(assembly_stamp(assembly, preset)))


def is_current(out_dir: Path, assembly: dict, preset: dict) -> bool:
    """`--skip-existing`: every frame on disk AND the stamp matches kit + preset."""
    path = _stamp_path(out_dir, assembly)
    if not (path.exists() and frames_exist(out_dir, assembly["safeName"], preset["views"])):
        return False
    try:
        return json.loads(path.read_text()) == assembly_stamp(assembly, preset)
    except (OSError, ValueError):
        return False


def kit_groups(jobs: dict) -> list[tuple[str, list[dict]]]:
    """Split the assemblies into one batch per SET OF KITS they need.

    Why: a Blender session pays for every GLB it has imported on every Cycles
    frame, and the built kits are ~600 MB together. One session that imports
    all of them to render 377 two-piece assemblies spends nearly all its time
    on geometry no frame shows (round 1: 48 s per template). Grouped, a session
    imports one or two kits, loads them once, and renders every assembly that
    uses exactly those.
    """
    groups: dict[tuple[str, ...], list[dict]] = {}
    for assembly in jobs["assemblies"]:
        key = tuple(sorted({p["glb"] for p in assembly["pieces"]}))
        groups.setdefault(key, []).append(assembly)
    out = []
    for i, key in enumerate(sorted(groups)):
        label = "+".join(Path(k).name.split(".")[0] for k in key) or f"group{i}"
        out.append((_safe(label)[:80], groups[key]))
    return out


def render(specs: list[dict], out_dir: Path, res: int | None = None,
           dry_run: bool = False, flat: bool = False, skip_existing: bool = False,
           preset: str = DEFAULT_PRESET, jobs: int = DEFAULT_RENDER_JOBS) -> dict:
    index = KitIndex.load()
    job = build_jobs(specs, index, out_dir, res, flat=flat, preset=preset)
    stamp_preset = {"res": job["res"], "views": job["views"], "samples": job["samples"]}
    out_dir.mkdir(parents=True, exist_ok=True)
    # The sheet is written BEFORE the render: a long batch that is interrupted
    # still leaves the reader the table for the frames that did land. It covers
    # every assembly asked for, including ones --skip-existing does not re-render.
    write_sheet(job, out_dir)
    todo = [a for a in job["assemblies"]
            if not (skip_existing and is_current(out_dir, a, stamp_preset))]
    skipped = len(job["assemblies"]) - len(todo)
    if not dry_run and todo:
        groups = kit_groups({"assemblies": todo})

        def one(i: int, label: str, assemblies: list[dict]) -> None:
            print(f"[assembly] batch {i}/{len(groups)} {label}: {len(assemblies)}")
            run_blender({**job, "assemblies": assemblies}, out_dir, f"jobs.{label}.json")
            # Frames go to files named by safeName, which differ between
            # groups, so overlapped sessions never write the same file.
            for assembly in assemblies:
                annotate_assembly(out_dir, assembly)
                write_stamp(out_dir, assembly, stamp_preset)

        if jobs <= 1 or len(groups) <= 1:
            for i, (label, assemblies) in enumerate(groups, 1):
                one(i, label, assemblies)
        else:
            from concurrent.futures import ThreadPoolExecutor
            # Threads suffice: each one waits on its own Blender process.
            with ThreadPoolExecutor(max_workers=jobs) as pool:
                futures = [pool.submit(one, i, label, assemblies)
                           for i, (label, assemblies) in enumerate(groups, 1)]
                for future in futures:
                    future.result()
    print(f"[assembly] {len(job['assemblies'])} assemblies "
          f"({skipped} already rendered) -> {out_dir}")
    return job


# --------------------------------------------------------------------------- #
def add_arguments(ap: argparse.ArgumentParser) -> None:
    ap.add_argument("--assembly", help="assembly json: {name, pieces:[...], groundZ?}")
    ap.add_argument("--template", help="<set>/<templateId> from kit-assemblies-mined.json")
    ap.add_argument("--all-templates", action="store_true",
                    help="every mined template whose pieces are both in a built kit")
    ap.add_argument("--kit-sheet", help="every asset of a kit, alone, with its mounts")
    ap.add_argument("--mount-pair", nargs=2, metavar=("CHILD", "PARENT"))
    ap.add_argument("--all-mount-pairs", action="store_true",
                    help="every mined pair whose child and parent are both built")
    ap.add_argument("--limit", type=int, default=0, help="render at most N assemblies")
    ap.add_argument("--flat", action="store_true",
                    help="stand every root piece on one plane at its designed sink")
    ap.add_argument("--skip-existing", action="store_true",
                    help="leave assemblies whose frames are on disk and whose stamp "
                         "(kit GLB mtime+size, preset) is unchanged")
    ap.add_argument("--preset", choices=sorted(PRESETS), default=DEFAULT_PRESET,
                    help="owner: 512 px, six views, 12 samples; "
                         "sonnet: 256 px, plan/front/right, 6 samples")
    ap.add_argument("--jobs", type=int, default=DEFAULT_RENDER_JOBS,
                    help="Blender sessions (kit groups) rendered at once")
    ap.add_argument("--dry-run", action="store_true",
                    help="build the jobs and the sheet without calling Blender")


def specs_from_args(args) -> list[dict]:
    index = KitIndex.load()
    if args.assembly:
        return [spec_from_file(Path(args.assembly))]
    # A template asset that hangs on something (a window on its wall) cannot be
    # judged alone: its mined mount parent is ghosted behind it.
    mounts = json.loads(MOUNTS_PATH.read_text()) if MOUNTS_PATH.exists() else None
    if args.template:
        set_id, _, template_id = args.template.partition("/")
        assemblies = json.loads(ASSEMBLIES_PATH.read_text())
        return [add_mount_hosts(spec_from_template(assemblies, set_id, template_id),
                                mounts, index, assemblies)]
    if args.all_templates:
        assemblies = json.loads(ASSEMBLIES_PATH.read_text())
        return [add_mount_hosts(spec, mounts, index, assemblies)
                for spec in all_template_specs(assemblies, index)]
    if args.kit_sheet:
        return specs_for_kit_sheet(index, args.kit_sheet, mounts)
    if args.all_mount_pairs:
        mounts = json.loads(MOUNTS_PATH.read_text())
        return [spec_from_mount_pair(mounts, pair["child"], pair["parent"])
                for pair in mounts.get("pairs", [])
                if pair["child"] in index.asset_kit and pair["parent"] in index.asset_kit]
    if args.mount_pair:
        if not MOUNTS_PATH.exists():
            raise SystemExit(f"{MOUNTS_PATH} missing — lane A mines it")
        return [spec_from_mount_pair(json.loads(MOUNTS_PATH.read_text()), *args.mount_pair)]
    raise SystemExit("nothing to render: pass --assembly, --template, --all-templates, "
                     "--kit-sheet or --mount-pair")


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    add_arguments(ap)
    ap.add_argument("--out", required=True)
    ap.add_argument("--res", type=int, default=None, help="overrides the preset's")
    args = ap.parse_args(argv)
    specs = specs_from_args(args)
    if args.limit:
        specs = specs[:args.limit]
    out = Path(args.out).resolve()   # relative paths are relative to the cwd
    render(specs, out, args.res, dry_run=args.dry_run, flat=args.flat,
           skip_existing=args.skip_existing, preset=args.preset, jobs=args.jobs)


if __name__ == "__main__":
    main()
