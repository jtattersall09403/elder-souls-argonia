"""The per-scene derived-state cache (speed lane, owner 2026-09-27):
`output/apply/<scene>/cache/`. Two stores, both keyed by what the value is
a function of, so a hit is the value a fresh derivation would give:

* ops (`ops.json`): a layout op's effect on the scene (the pieces it adds,
  changes or removes, the paths, its log line and warnings), keyed by the
  op's own JSON, the content of every piece it names (uid, child, parent,
  host) as the scene stands when it runs, the yard set it places, the
  scene's pad and run-pad overlays when the op seats anything, and the
  global key. A changed dependency changes the key, so a moved parent
  re-derives its children; ops after an edit whose inputs are unchanged
  are restored.
* pairs (`pairs.json`): `check`'s near-pair contact and verdict, keyed by
  both pieces' content and manifest rows.

Every key is a content hash, never an mtime: the op keys add each named
asset's manifest row, footprint row and GLB identity; the global key is
the content of the workbench, world-generation and pipeline sources and
the placement records and yard sets, the place, and the ground window's
chunk sha256s. Stores are written atomically (temp file + rename).
`apply --full` ignores the op store; deleting the directory is always safe."""
from __future__ import annotations

import hashlib
import json
from dataclasses import asdict
from pathlib import Path

from . import paths

SCHEMA_VERSION = 2

# op fields that name a piece whose state the op reads
NAMED = ("uid", "child", "parent", "host")
# ops that never read the ground or a pad
GROUNDLESS = {"bind", "path", "note", "remove", "mirror"}


_CODE_KEY: dict = {}


def _content(files) -> str:
    h = hashlib.sha256()
    for f in sorted(files):
        try:
            data = f.read_bytes()
        except OSError:
            continue
        h.update(str(f.relative_to(paths.REPO_ROOT)).encode() + b"\0" + data + b"\0")
    return h.hexdigest()


def code_key() -> str:
    """The CONTENT of every source and record a derivation reads: the
    workbench, the world-generation and pipeline sources, the placement
    records and yard sets (hashed once per process; never mtimes)."""
    if "key" not in _CODE_KEY:
        wb = paths.WORKBENCH
        _CODE_KEY["key"] = _content(
            [wb / "wb.py", *(wb / "workbench").glob("*.py"),
             *(paths.WORLDGEN / "worldgen").glob("*.py"),
             *(paths.ASSET_PIPELINE / "pipeline").glob("*.py"),
             *paths.PLACEMENT_RECORDS.glob("*.json"),
             *(paths.PLACEMENT_RECORDS / "yard-sets").glob("*.json")])
    return _CODE_KEY["key"]


def global_key(place_id: str, ground_stem: str) -> str:
    """`code_key`, the place, and the ground window's chunk files by their
    sha256 (the frozen ground every sample under a footprint is read from)."""
    meta = Path(ground_stem).with_suffix(".json") if ground_stem else None
    ground = (json.loads(meta.read_text()).get("chunks") if meta and meta.exists() else None)
    return _sha([SCHEMA_VERSION, place_id, ground, code_key()])


_DATA_KEY: dict = {}


def data_key() -> str:
    """The CONTENT of every JSON record the compile and its derive passes
    may read beyond `code_key` (hashed once per process, never mtimes): the
    world records (`world/sources/**`), the published and raw kit manifests
    and sidecars, the kit build configs and placement policies, and the
    province's JSON (its rasters are the frozen world, keyed by the ground
    window's chunk sha256s in `global_key`); the GLB geometry is keyed per
    placed asset (`asset_key`) by `compile_key`."""
    if "key" not in _DATA_KEY:
        root = paths.REPO_ROOT
        _DATA_KEY["key"] = _content(
            [*(root / "world" / "sources").rglob("*.json"),
             *paths.PUBLISHED_KITS.glob("*.json"), *paths.RAW_KITS.glob("*.json"),
             *(paths.ASSET_PIPELINE / "pipeline" / "config").rglob("*.json"),
             *paths.PROVINCE.glob("*.json"), *(paths.PROVINCE / "refined").glob("*.json")])
    return _DATA_KEY["key"]


def compile_key(cat, scene, blueprint_bytes: bytes) -> str:
    """What `wb.compile_scene`'s result is a function of: the exported
    blueprint's bytes, the code and ground (`global_key`), the records
    (`data_key`) and every placed asset's manifest row, footprint and mesh."""
    assets = sorted({p.asset for p in scene.pieces})
    return _sha([hashlib.sha256(blueprint_bytes).hexdigest(),
                 global_key(scene.placeId, scene.groundStem), data_key(),
                 {a: asset_key(cat, a) for a in assets}])


_MESH_KEY: dict = {}


def mesh_key(cat, asset: str) -> str:
    """The sha256 of the mesh the workbench measures (vertices and faces),
    once per asset per process."""
    if asset not in _MESH_KEY:
        import numpy as np
        m = cat.mesh(asset)
        _MESH_KEY[asset] = hashlib.sha256(
            np.ascontiguousarray(m.vertices, dtype=np.float64).tobytes()
            + np.ascontiguousarray(m.faces, dtype=np.int64).tobytes()).hexdigest()
    return _MESH_KEY[asset]


def asset_key(cat, asset: str) -> list:
    """What a piece's derivation reads of its kit, by content: the manifest
    row, the footprint sidecar row and the mesh."""
    try:
        return [cat.row(asset), cat.footprint(asset), mesh_key(cat, asset)]
    except Exception as err:                      # noqa: BLE001 - keyed as is
        return [f"unresolved: {err}"]


def _sha(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, default=_plain).encode()).hexdigest()


def _plain(o):
    try:
        return float(o)
    except (TypeError, ValueError):
        return str(o)


def plain(obj):
    """``obj`` as it reads back from a store (JSON types, sorted keys)."""
    return json.loads(json.dumps(obj, sort_keys=True, default=_plain))


def state(piece) -> dict:
    return asdict(piece)


class Store:
    """One JSON file of {key: value}; `get` marks a key used, `save` keeps the
    used and the newly put ones only (the store never grows past a scene)."""

    def __init__(self, path: Path, enabled: bool = True):
        self.path, self.enabled = path, enabled
        self.data, self.used = {}, {}
        self.hits = self.misses = 0
        if enabled and path.exists():
            try:
                doc = json.loads(path.read_text())
                if doc.get("schemaVersion") == SCHEMA_VERSION:
                    self.data = doc.get("entries") or {}
            except (OSError, ValueError):
                self.data = {}

    def get(self, key: str):
        if self.enabled and key in self.data:
            self.hits += 1
            self.used[key] = self.data[key]
            return self.data[key]
        self.misses += 1
        return None

    def put(self, key: str, value) -> None:
        self.used[key] = value

    def keep_all(self) -> None:
        """Keep every stored entry at `save` (a scoped run touches a few)."""
        self.used.update({k: v for k, v in self.data.items() if k not in self.used})

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps({"schemaVersion": SCHEMA_VERSION, "entries": self.used},
                                  default=_plain))
        tmp.replace(self.path)


def cache_dir(scene_path) -> Path:
    return paths.OUTPUT / "apply" / Path(scene_path).stem / "cache"


# --------------------------------------------------------------------------
# ops
# --------------------------------------------------------------------------

def pad_env(cat, scene) -> list:
    """What the ground a settle reads is made of: every resolved building pad
    (owner, outline, datum, blend, error) and every run's posed members
    (`pads.ground_for`'s own key)."""
    from . import pads
    resolved = pads.scene_pads(cat, scene)
    return [sorted((uid, pads._pad_owner(scene.piece(uid)), r["polygonM"], r["datumM"],
                    r.get("blendM"), r["error"]) for uid, r in resolved.items()),
            pads._run_key(scene)]


def env_key(cat, scene) -> str:
    """`pad_env` hashed; `apply` recomputes it only after an op that touched
    a padded piece or a run member (`touches_env`), never per op."""
    return _sha(pad_env(cat, scene))


def touches_env(scene, d: dict) -> bool:
    """Whether an op's delta can change the pad and run-pad overlays."""
    if d["removed"]:
        return True
    by = {p.uid: p for p in scene.pieces}
    for uid in d["pieces"]:
        p = by.get(uid)
        if p is None or p.pad is not None or (p.role or {}).get("kind") == "run":
            return True
    return False


def op_key(cat, scene, op: dict, gkey: str, env: str | None = None) -> str:
    named, assets = {}, set()
    for field in NAMED:
        uid = op.get(field)
        if isinstance(uid, str):
            hit = next((p for p in scene.pieces if p.uid == uid), None)
            named[field] = None if hit is None else state(hit)
            if hit is not None:
                assets.add(hit.asset)
    if isinstance(op.get("asset"), str):
        assets.add(op["asset"])
    kits = {a: asset_key(cat, a) for a in sorted(assets)}
    extra = None
    if op.get("op") == "group":
        from . import assembly
        try:
            extra = [assembly.load_group(op["name"]),
                     sorted(p.uid for p in scene.pieces)]    # a prefix collision refuses
        except Exception as err:                              # noqa: BLE001 - keyed as is
            extra = f"unloadable: {err}"
    if op.get("op") in GROUNDLESS:
        env = None
    elif env is None:
        env = env_key(cat, scene)
    return _sha([gkey, op, named, kits, extra, env])


def fast_state(p) -> str:
    return json.dumps([p.x, p.z, p.yaw, p.y, p.scale, p.pitch, p.roll, p.mirror, p.beached,
                       p.walkable, p.wet, p.settledBy, p.asset, p.role, p.pad, p.notes],
                      sort_keys=True, default=_plain)


def touched(scene, op: dict) -> dict:
    """{uid: fast_state} of the pieces an op may change: the ones it names.
    An op changes only the pieces it names and the pieces it adds (every
    `cmd_*` in wb.py; `tests/test_speed.py` replays inserted, removed and
    edited ops against full applies), so the snapshot is O(named), not
    O(scene)."""
    names = {op.get(f) for f in NAMED if isinstance(op.get(f), str)}
    return {p.uid: fast_state(p) for p in scene.pieces if p.uid in names}


def diff(before_order: list, before_states: dict, scene, before_paths: list) -> dict | None:
    """The op's own effect as a delta the scene can replay whatever else an
    earlier op changed: the uids it removed, the pieces it appended (in
    order), the full state of every named piece it changed, the path ids it
    removed and the paths it appended. None when the op did anything a delta
    cannot say (a reorder): such an op is never cached."""
    now = [p.uid for p in scene.pieces]
    now_set, before_set = set(now), set(before_order)
    removed = [u for u in before_order if u not in now_set]
    added = [u for u in now if u not in before_set]
    if now != [u for u in before_order if u not in set(removed)] + added:
        return None
    changed = {p.uid: state(p) for p in scene.pieces
               if p.uid in added or (p.uid in before_states
                                     and before_states[p.uid] != fast_state(p))}
    old = {json.dumps(w, sort_keys=True, default=_plain) for w in before_paths}
    kept_ids = [w["id"] for w in before_paths]
    new_ids = [w["id"] for w in scene.paths]
    appended = [w for w in scene.paths
                if json.dumps(w, sort_keys=True, default=_plain) not in old]
    path_removed = [i for i in kept_ids if i not in new_ids]
    ids_after = [i for i in kept_ids if i not in path_removed
                 and i not in {w["id"] for w in appended}] + [w["id"] for w in appended]
    if ids_after != new_ids:
        return None
    return {"removed": removed, "added": added, "pieces": changed,
            "pathsRemoved": path_removed, "pathsAppended": appended}


def restore(scene, d: dict) -> None:
    """Replay a cached delta (`diff`) on the scene as it stands now."""
    from .scene import Piece
    fresh = json.loads(json.dumps(d["pieces"], default=_plain))     # never alias the store
    gone = set(d["removed"]) | set(d["added"])
    kept = [Piece(**fresh[p.uid]) if p.uid in fresh else p for p in scene.pieces
            if p.uid not in gone]
    scene.pieces = kept + [Piece(**fresh[u]) for u in d["added"]]
    appended = json.loads(json.dumps(d["pathsAppended"], default=_plain))
    drop = set(d["pathsRemoved"]) | {w["id"] for w in appended}
    scene.paths = [w for w in scene.paths if w["id"] not in drop] + appended
