"""The workbench scene: a JSON file of posed pieces over an extracted ground
window. Every command loads it, acts, and writes it back, so an agent's
session is a sequence of shell calls and the file is the whole state.

Frames (one table, used everywhere):

* **province**: x east, z south, metres (studio km x 1000); y up.
* **workbench (wb)**: (E, N, up) = (x, -z, y), right-handed, z up. The kit
  frame (`mesh_ground_line.KitGeometry`: z up, pivot at the origin, +y
  north at yaw 0) turned by the placement's yaw lands in wb. Yaw is
  clockwise from north seen from above: the compile's
  ``wx = cx + x cos t - z sin t; wz = cz + x sin t + z cos t`` and the
  runtime's ``placementQuaternion`` (anchoring.ts), which is
  ``mine_mounts.rotation`` about z by ``-yaw``.
"""
from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass, field
from pathlib import Path

import numpy as np

SCHEMA_VERSION = 1


def yaw_matrix(yaw_deg: float) -> np.ndarray:
    """Kit -> wb rotation for a yaw clockwise from north (about +z by -yaw)."""
    t = -math.radians(yaw_deg)
    c, s = math.cos(t), math.sin(t)
    return np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])


def pose_matrix(yaw_deg: float, pitch_deg: float = 0.0, roll_deg: float = 0.0,
                mirror: bool = False) -> np.ndarray:
    """Kit -> wb rotation: yaw, then pitch about the piece's own x (east at
    yaw 0; positive lifts its north end), then roll about its own y. The
    runtime's `placementQuaternion` is Euler(pitch, -yaw, 0, 'YXZ'): the same
    yaw and pitch; it has no roll and no mirror (export refuses both)."""
    p, r = math.radians(pitch_deg), math.radians(roll_deg)
    rx = np.array([[1.0, 0.0, 0.0], [0.0, math.cos(p), -math.sin(p)],
                   [0.0, math.sin(p), math.cos(p)]])
    ry = np.array([[math.cos(r), 0.0, math.sin(r)], [0.0, 1.0, 0.0],
                   [-math.sin(r), 0.0, math.cos(r)]])
    m = yaw_matrix(yaw_deg) @ rx @ ry
    return m @ np.diag([-1.0, 1.0, 1.0]) if mirror else m


def plan_to_province(centre_xz, yaw_deg: float, local_xz) -> tuple[float, float]:
    """A piece-local plan point (x east, z south) to province metres."""
    t = math.radians(yaw_deg)
    x, z = local_xz
    return (centre_xz[0] + x * math.cos(t) - z * math.sin(t),
            centre_xz[1] + x * math.sin(t) + z * math.cos(t))


@dataclass
class Piece:
    uid: str
    asset: str
    x: float                 # province metres east
    z: float                 # province metres south
    yaw: float = 0.0         # degrees clockwise from north
    y: float | None = None   # pivot height (metres); None until settled or set
    scale: float = 1.0
    role: dict = field(default_factory=dict)     # export binding: parcel/run/landmark/assembly
    notes: list = field(default_factory=list)    # the agent's own log for this piece
    settledBy: str | None = None                 # how y was decided
    pitch: float = 0.0       # degrees about the piece's own x after the yaw
    roll: float = 0.0        # degrees about its own y (the runtime has none)
    mirror: bool = False     # mirrored across its own x (the runtime has none)
    pad: dict | None = None  # a declared building pad {apronM?, datumM?, floorMinM?} (0101)
    beached: bool = False    # a hull or cleat drawn up on the bank (R5): `wb.py check` beachedRule
    walkable: bool = False   # a walkable deck (ramp, stair, boardwalk, bridge): walkRule's surface (0102)

    def matrix(self) -> tuple[np.ndarray, np.ndarray]:
        """(A, b): kit-frame points p -> wb points A @ p + b."""
        a = pose_matrix(self.yaw, self.pitch, self.roll, self.mirror) * self.scale
        b = np.array([self.x, -self.z, self.y if self.y is not None else 0.0])
        return a, b

    def world_points(self, points: np.ndarray) -> np.ndarray:
        a, b = self.matrix()
        return np.asarray(points) @ a.T + b


@dataclass
class Scene:
    path: Path
    placeId: str = ""
    groundStem: str = ""
    pieces: list[Piece] = field(default_factory=list)
    paths: list[dict] = field(default_factory=list)    # {id, kind, widthM, pointsM [[x,z]...]}
    log: list[str] = field(default_factory=list)
    layout: dict | None = None     # {path, sha256} of the layout `apply` built it from

    @classmethod
    def load(cls, path: Path) -> "Scene":
        path = Path(path)
        if not path.exists():
            return cls(path=path)
        data = json.loads(path.read_text())
        if data.get("schemaVersion") != SCHEMA_VERSION:
            raise ValueError(f"{path}: scene schemaVersion {data.get('schemaVersion')} "
                             f"!= {SCHEMA_VERSION}")
        return cls(path=path, placeId=data.get("placeId", ""),
                   groundStem=data.get("groundStem", ""),
                   pieces=[Piece(**p) for p in data.get("pieces", [])],
                   paths=data.get("paths", []), log=data.get("log", []),
                   layout=data.get("layout"))

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        out = {"schemaVersion": SCHEMA_VERSION, "placeId": self.placeId,
               "groundStem": self.groundStem,
               "pieces": [asdict(p) for p in self.pieces], "paths": self.paths,
               "log": self.log[-400:], "layout": self.layout}
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(out, indent=1))
        tmp.replace(self.path)

    def piece(self, uid: str) -> Piece:
        for p in self.pieces:
            if p.uid == uid:
                return p
        raise KeyError(f"no piece {uid!r} in the scene (have: {', '.join(p.uid for p in self.pieces)})")

    def add(self, piece: Piece) -> Piece:
        if any(p.uid == piece.uid for p in self.pieces):
            raise ValueError(f"piece {piece.uid!r} already exists")
        self.pieces.append(piece)
        return piece

    def remove(self, uid: str) -> None:
        self.pieces = [p for p in self.pieces if p.uid != uid]

    def view(self) -> "Scene":
        """A copy to mutate without touching this scene, cheaper than a
        deepcopy: the pieces, paths, log and layout are copied; the derived
        pad memo (`pads.ground_for`, keyed by content, so it hits only while
        the pads and runs are unchanged) is carried over as a new dict whose
        resolved pads are copied and whose padded ground and run overlays are
        shared read-only (a changed pad rebuilds them into the view's own
        memo). Test fixtures and trials take a view of a warmed scene."""
        import copy
        out = Scene(path=self.path, placeId=self.placeId, groundStem=self.groundStem,
                    pieces=[copy.deepcopy(p) for p in self.pieces],
                    paths=copy.deepcopy(self.paths), log=list(self.log),
                    layout=copy.deepcopy(self.layout))
        memo = self.__dict__.get("_padMemo")
        if memo:
            out.__dict__["_padMemo"] = {k: (copy.deepcopy(v) if k == "pads" else v)
                                        for k, v in memo.items()}
        return out

    def ground(self):
        from .ground import Ground
        if not self.groundStem:
            raise ValueError("the scene has no ground window: run `window` first")
        return Ground(Path(self.groundStem))


#: settledBy tags that name the piece a piece hangs on (the part after the last ':')
HUNG_TAGS = ("mount:", "evidence-snap:", "geometry-snap:", "template:")


def hung_on(p) -> str | None:
    """The uid of the piece `p` hangs on, stands on or was lifted onto: the
    role's `mountedOn` (a mined or unmined mount, a yard-set `mount.on`) or
    `liftedOn` (a yard-set member given its height above the set's anchor,
    `assembly.lift_group`), else the parent its `settledBy` names. One reader
    for the reseat and propSeatRule (r4 review)."""
    role = p.role or {}
    if role.get("mountedOn"):
        return role["mountedOn"]
    if role.get("liftedOn"):
        return role["liftedOn"]
    by = p.settledBy or ""
    for tag in HUNG_TAGS:
        if by.startswith(tag):
            return by.rsplit(":", 1)[-1]
    return None
