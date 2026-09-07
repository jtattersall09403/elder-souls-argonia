"""Mine **exterior -> interior door links** out of the shipped plugins.

Owner ruling 2026-09-07: *every exterior designed to have an interior must be
matched to the actual interior it is designed to go with, and must have a
derived entrance.* Filenames cannot answer that; the plugins can. A modder
links a building to its inside with a **load door**: an exterior door ``REFR``
carrying an ``XTEL`` teleport subrecord whose target is a door ``REFR`` sitting
inside an interior ``CELL``. That cell's own ``REFR`` list is the complete piece
set of the interior. See
`docs/research/placement-settlements/exterior-interior-linking-in-skyrim-mods.md`.

What this module derives, per link:

* **shell** — the building the exterior door belongs to. Rule, and it is a
  measurement, not a label: among the ``STAT``/``MSTT``/``SCOL`` refs in the
  same exterior cell, take the one whose pivot is nearest the door in 3D within
  ``SHELL_RADIUS_M`` (6 m) **and** whose base object is big enough to be a
  building (``OBND`` diagonal >= ``SHELL_MIN_OBND_M``); ties break to the larger
  ``OBND`` volume. A door is hung on the wall of its own building, so the
  building's pivot is the nearest large static to it; small props (crates,
  lanterns, planters) are excluded by the size floor rather than by name.
* **doorOffsetInShell** — the exterior door's position and yaw expressed in the
  shell's own frame (rotate the world delta by the shell's -yaw). **This is the
  derived entrance**: where, on this shell, the way in is.
* **interiorPieces** — every ``STAT``/``FURN``/``CONT``/``LIGH``/``DOOR``/
  ``MSTT``/``ACTI`` ref in the target cell, as model -> count.
* **interiorSizeM** — the plan/height extent of those pieces.

Both directions are read: a load door in an interior whose target REFR lives in
an exterior cell evidences the same link, and some mods only author one side.

Deterministic: plugins sorted, models sorted, metres rounded, no timestamps.
Provenance: plugin file name plus sha256 for every plugin mined.

Run (from tooling/world-generation/):
  python3 -m worldgen.mine_door_links            # every pool plugin in the vault
  python3 -m worldgen.mine_door_links --out <path>
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

from .asset_registry import DEFAULT_VAULT, POOLS, REPO_ROOT, _resolve
from .asset_taxonomy import classify
from .esp_index import (GT_WORLD_CHILDREN, UNITS_PER_METRE, Plugin, decode_ref)

OUT_PATH = REPO_ROOT / "world" / "sources" / "placement" / "exterior-interior-links.json"
REGISTRY_DIR = REPO_ROOT / "world" / "sources" / "assets"
SCHEMA_VERSION = 1

#: How far from a door we will look for the building it is hung on.
SHELL_RADIUS_M = 12.0
#: A building's bounding box diagonal floor — under this it is a prop.
SHELL_MIN_OBND_M = 2.5
SHELL_TYPES = {"STAT", "MSTT", "SCOL"}
#: A door is hung on a *building*, so the candidate is filtered by what it
#: cannot be rather than by what it is called: the taxonomy's living, loose and
#: prop categories are never a shell however large their bounding box, but
#: `misc` stays in because several mods file their whole house mesh under a
#: private directory the taxonomy has no rule for (`gv_meshes/argoniannest/`,
#: `dmargonian/`) and a whitelist would throw those buildings away.
NOT_SHELL_CATEGORIES = frozenset({
    "lod", "tree", "plant", "shrub", "grass", "fungus", "aquatic-plant", "root",
    "deadfall", "creature", "boat", "vehicle", "weapon", "armour", "ammo",
    "ice", "rock", "door", "light", "container", "furniture", "clutter",
    "signage", "terrain-feature", "effect",
})
#: Directory evidence beats any category: nothing under these is geometry a
#: player can enter (quest markers, particle effects, the skydome).
NOT_SHELL_DIRS = ("markers/", "effects/", "sky/", "interface/")
#: Record types whose refs count as an interior's pieces.
PIECE_TYPES = {"STAT", "FURN", "CONT", "LIGH", "DOOR", "MSTT", "ACTI"}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def registry_index() -> dict[str, dict[str, str]]:
    """`meshes/...nif` path -> {pool: asset id}, from the built asset registry.

    One mesh path can be registered in several pools — a mod that bundles a
    credited resource ships the same relative path the resource does — so the
    caller resolves with the pool of the plugin it is reading.
    """
    out: dict[str, dict[str, str]] = {}
    for jsonl in sorted(REGISTRY_DIR.glob("registry-*.jsonl")):
        for line in jsonl.read_text(errors="replace").splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            out.setdefault(row["path"].lower(), {})[row["pool"]] = row["id"]
    return out


def asset_id_for(model_key: str | None, index, pool: str | None = None) -> str | None:
    if not model_key:
        return None
    key = model_key if model_key.startswith("meshes/") else "meshes/" + model_key
    pools = index.get(key)
    if not pools:
        return None
    if pool and pool in pools:
        return pools[pool]
    if "vanilla" in pools:
        return pools["vanilla"]
    return pools[sorted(pools)[0]]


#: Plugins in the vault that no `Pool` row owns because the mod ships no
#: meshes of its own (it dresses vanilla assets) — but which still evidence
#: real door links, so they are mined.
EXTRA_PLUGINS: tuple[tuple[str, str], ...] = (
    ("marshrest", "{vault}/skyrim-source/mod-sources/marsh-rest-50111/extracted/"
                  "ArgonianHome.esp"),
)


def discover_plugins(vault: Path) -> list[tuple[str, Path]]:
    """`(pool id, path)` for every plugin a registered pool ships or contains."""
    found: dict[Path, str] = {}
    for pool in POOLS:
        for template in pool.plugins:
            path = _resolve(template, vault)
            if path.exists():
                found.setdefault(path, pool.id)
        if pool.directory:
            directory = _resolve(pool.directory, vault)
            if directory.exists():
                for path in sorted(directory.rglob("*")):
                    if path.suffix.lower() in (".esp", ".esm", ".esl") and path.is_file():
                        found.setdefault(path, pool.id)
    for pool_id, template in EXTRA_PLUGINS:
        path = _resolve(template, vault)
        if path.exists():
            found.setdefault(path, pool_id)
    return sorted(((pid, p) for p, pid in found.items()), key=lambda r: str(r[1]))


def _obnd_metres(base) -> tuple[float, float]:
    """`(diagonal, volume)` in metres from a base object's OBND, or `(0, 0)`."""
    if not base or not base.bounds:
        return (0.0, 0.0)
    x0, y0, z0, x1, y1, z1 = base.bounds
    dx, dy, dz = (abs(x1 - x0) / UNITS_PER_METRE, abs(y1 - y0) / UNITS_PER_METRE,
                  abs(z1 - z0) / UNITS_PER_METRE)
    return (math.sqrt(dx * dx + dy * dy + dz * dz), dx * dy * dz)


#: How far outside a candidate's own bounding box the door may stand and still
#: be that candidate's door. A door is set INTO the wall of the building it
#: opens, so the gap is the wall's own thickness plus the placement slop a
#: level designer leaves; three metres is generous and still excludes the
#: neighbouring house.
GAP_MAX_M = 3.0


def _box_gap(ref, base, door) -> float:
    """Distance from the door to the candidate's OBND box, 0 when inside.

    OBND is in the base object's local frame, so the door is rotated back into
    it. Pivot distance is the wrong measure — a large building's pivot can be
    ten metres from its own front door while a pebble's pivot is at its face.
    """
    if not base.bounds:
        return float("inf")
    yaw = _yaw(ref)
    dx = (door.pos[0] - ref.pos[0]) / UNITS_PER_METRE
    dy = (door.pos[1] - ref.pos[1]) / UNITS_PER_METRE
    dz = (door.pos[2] - ref.pos[2]) / UNITS_PER_METRE
    c, s = math.cos(-yaw), math.sin(-yaw)
    lx, ly = dx * c - dy * s, dx * s + dy * c
    x0, y0, z0, x1, y1, z1 = [v / UNITS_PER_METRE for v in base.bounds]
    gaps = [max(lo - v, v - hi, 0.0) for v, lo, hi in (
        (lx, min(x0, x1), max(x0, x1)),
        (ly, min(y0, y1), max(y0, y1)),
        (dz, min(z0, z1), max(z0, z1)))]
    return math.sqrt(sum(g * g for g in gaps))


class Vault:
    """Every mined plugin, with cross-plugin form-id resolution."""

    def __init__(self, plugins: list[tuple[str, Path]]):
        self.entries: list[tuple[str, Path, Plugin]] = []
        self.bases: dict[tuple[str, int], object] = {}
        #: (source plugin, local id) -> (plugin name, interior cell editor id)
        self.interior_of_ref: dict[tuple[str, int], tuple[str, str]] = {}
        #: (plugin name, cell editor id) -> piece refs
        self.interior_cells: dict[tuple[str, str], list] = {}
        #: (source plugin, local id) -> (plugin name, ref) for every ref in a
        #: worldspace, persistent group included — teleport doors are almost
        #: always persistent, so a cell-grid walk misses them entirely.
        self.exterior_refs: dict[tuple[str, int], tuple[str, object]] = {}
        #: plugin name -> {(gx, gy): [refs]} spatial hash on SHELL_RADIUS_M
        self.ext_hash: dict[str, dict[tuple[int, int], list]] = {}
        for pool_id, path in plugins:
            try:
                plugin = Plugin(path)
            except Exception as exc:                       # unreadable plugin
                print(f"  ! {path.name}: {exc}")
                continue
            self.entries.append((pool_id, path, plugin))

    def key(self, plugin: Plugin, form_id: int) -> tuple[str, int]:
        return (plugin.source_of(form_id).lower(), form_id & 0xFFFFFF)

    def index(self) -> None:
        for _pool, path, plugin in self.entries:
            for form_id, base in plugin.base_objects().items():
                self.bases.setdefault(self.key(plugin, form_id), base)
        for _pool, path, plugin in self.entries:
            for cell in plugin.interior_cells(with_refs=True):
                edid = cell.editor_id or f"cell{cell.form_id:08X}"
                cell_key = (path.name, edid)
                self.interior_cells[cell_key] = cell.refs
                for ref in cell.refs:
                    self.interior_of_ref[self.key(plugin, ref.form_id)] = cell_key
            buckets: dict[tuple[int, int], list] = {}
            for ref in world_refs(plugin):
                self.exterior_refs[self.key(plugin, ref.form_id)] = (path.name, ref)
                buckets.setdefault(bucket_of(ref.pos), []).append(ref)
            self.ext_hash[path.name] = buckets

    def near(self, plugin_name: str, pos) -> list:
        """Every worldspace ref within one bucket of `pos`."""
        gx, gy = bucket_of(pos)
        buckets = self.ext_hash.get(plugin_name, {})
        out = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                out.extend(buckets.get((gx + dx, gy + dy), ()))
        return out

    def pool_of(self, plugin_name: str) -> str | None:
        for pool, path, _p in self.entries:
            if path.name == plugin_name:
                return pool
        return None

    def base_of(self, plugin: Plugin, form_id: int):
        return self.bases.get(self.key(plugin, form_id))


def bucket_of(pos) -> tuple[int, int]:
    span = SHELL_RADIUS_M * UNITS_PER_METRE
    return (int(math.floor(pos[0] / span)), int(math.floor(pos[1] / span)))


def world_refs(plugin: Plugin):
    """Every REFR anywhere in a worldspace — temporary, distant AND persistent.

    `Plugin.exterior_cells` keys refs to a grid cell and so drops the
    worldspace's persistent cell, which is exactly where the Creation Kit puts
    load doors. Door mining has to see them.
    """
    in_world = False
    for rec, stack in plugin.records():
        types = [f.type for f in stack]
        in_world = GT_WORLD_CHILDREN in types
        if rec.type == b"REFR" and in_world:
            ref = decode_ref(rec)
            if ref is not None:
                yield ref


def _yaw(ref) -> float:
    return ref.rot[2] if ref.rot else 0.0


def shell_for(door, refs, vault: Vault, plugin: Plugin):
    """The building the exterior door is hung on — nearest large building static."""
    best = None
    radius = SHELL_RADIUS_M * UNITS_PER_METRE
    for ref in refs:
        if ref.form_id == door.form_id:
            continue
        base = vault.base_of(plugin, ref.base)
        if base is None or base.type not in SHELL_TYPES or not base.model:
            continue
        diag, volume = _obnd_metres(base)
        if diag < SHELL_MIN_OBND_M:
            continue
        model = base.model_key
        if classify(model).category in NOT_SHELL_CATEGORIES:
            continue
        if any(model.startswith(d) or f"/{d}" in model for d in NOT_SHELL_DIRS):
            continue
        d = math.dist(ref.pos, door.pos)
        if d > radius:
            continue
        gap = _box_gap(ref, base, door)
        # A candidate whose own box the door stands in (or against) always beats
        # one it does not; among those, the BIGGEST is the building — ivy
        # overlays, walkways, stair blocks and lampposts stand against the same
        # door and are a fraction of its volume. Only if nothing is against the
        # door at all does bare pivot distance decide.
        cand = ((0 if gap <= GAP_MAX_M else 1),
                -volume if gap <= GAP_MAX_M else 0.0,
                round(gap, 3), round(d, 3), ref, base)
        if best is None or cand[:4] < best[:4]:
            best = cand
    return (best[4], best[5]) if best else (None, None)


def door_offset(door, shell) -> dict:
    """The exterior door in the shell's own frame, in metres and degrees."""
    yaw = _yaw(shell)
    dx = (door.pos[0] - shell.pos[0]) / UNITS_PER_METRE
    dy = (door.pos[1] - shell.pos[1]) / UNITS_PER_METRE
    dz = (door.pos[2] - shell.pos[2]) / UNITS_PER_METRE
    c, s = math.cos(-yaw), math.sin(-yaw)
    lx, ly = dx * c - dy * s, dx * s + dy * c
    rel = math.degrees(_yaw(door) - yaw) % 360.0
    return {"xM": round(lx, 3), "yM": round(ly, 3), "zM": round(dz, 3),
            "yawDeg": round(rel, 2),
            "sideDeg": round(math.degrees(math.atan2(lx, ly)) % 360.0, 2),
            "radiusM": round(math.hypot(lx, ly), 3)}


STRUCTURAL_CATEGORIES = frozenset({"architecture", "dungeon-kit", "ruin"})


def _family(model: str) -> str:
    """Directory identity of a piece — `<pool>:a/b/c/x` -> `<pool>:a/b/c`.

    Directory names are the reliable signal in asset archives; the filename is
    not (CLAUDE.md). The modal structural family of an interior cell is what
    names the interior KIT that cell belongs to.
    """
    return model.rsplit("/", 1)[0] if "/" in model else model


def interior_profile(refs, vault: Vault, plugin: Plugin, index, pool=None) -> dict:
    counts: Counter = Counter()
    families: Counter = Counter()
    xs, ys, zs = [], [], []
    for ref in refs:
        base = vault.base_of(plugin, ref.base)
        if base is None or base.type not in PIECE_TYPES or not base.model_key:
            continue
        model = asset_id_for(base.model_key, index, pool) or base.model_key
        counts[model] += 1
        if classify(base.model_key).category in STRUCTURAL_CATEGORIES:
            families[_family(model)] += 1
        xs.append(ref.pos[0]); ys.append(ref.pos[1]); zs.append(ref.pos[2])
    size = {}
    if xs:
        size = {
            "planXM": round((max(xs) - min(xs)) / UNITS_PER_METRE, 2),
            "planYM": round((max(ys) - min(ys)) / UNITS_PER_METRE, 2),
            "heightM": round((max(zs) - min(zs)) / UNITS_PER_METRE, 2),
        }
    return {
        "interiorFamily": families.most_common(1)[0][0] if families else None,
        "interiorFamilies": [{"family": f, "count": n}
                             for f, n in families.most_common(5)],
        "pieces": [{"model": m, "count": n} for m, n in sorted(counts.items())],
        "pieceRefs": sum(counts.values()),
        "distinctPieces": len(counts),
        "interiorSizeM": size,
    }


def mine(vault: Vault, index) -> tuple[dict, set]:
    """`(links by shell asset, the interior cells that got linked)`."""
    links: dict[str, dict[tuple, dict]] = defaultdict(dict)
    linked_cells: set[tuple[str, str]] = set()
    diagnostics: dict[str, Counter] = {}
    for _pool, path, plugin in vault.entries:
        stats = diagnostics.setdefault(path.name, Counter())
        # exterior side: a load door in the worldspace pointing INTO a cell
        for refs in vault.ext_hash.get(path.name, {}).values():
            for door in refs:
                if not door.teleport:
                    continue
                stats["exteriorLoadDoors"] += 1
                target = vault.interior_of_ref.get(vault.key(plugin, door.teleport[0]))
                if target is None:
                    stats["targetNotAnInterior"] += 1
                    continue
                record_link(links, linked_cells, vault, plugin, door,
                            vault.near(path.name, door.pos), target, index, stats)
        # interior side: a load door inside a cell pointing OUT at an exterior
        # door — some mods author only this half.
        for cell in plugin.interior_cells(with_refs=True):
            edid = cell.editor_id or f"cell{cell.form_id:08X}"
            for ref in cell.refs:
                if not ref.teleport:
                    continue
                ext = vault.exterior_refs.get(vault.key(plugin, ref.teleport[0]))
                if ext is None:
                    continue
                ext_plugin_name, ext_door = ext
                host = next((pl for _c, hp, pl in vault.entries
                             if hp.name == ext_plugin_name), plugin)
                record_link(links, linked_cells, vault, host, ext_door,
                            vault.near(ext_plugin_name, ext_door.pos),
                            (path.name, edid), index, stats)
    return links, linked_cells, diagnostics


def record_link(links, linked_cells, vault, plugin, door, refs, target, index, stats):
    shell, shell_base = shell_for(door, refs, vault, plugin)
    if shell is None:
        stats["shellNotFound"] += 1
        return
    pool = vault.pool_of(plugin.path.name)
    shell_id = asset_id_for(shell_base.model_key, index, pool) or shell_base.model_key
    door_base = vault.base_of(plugin, door.base)
    door_id = (asset_id_for(door_base.model_key, index, pool)
               if door_base and door_base.model_key else None)
    cell_plugin, cell_edid = target
    key = (cell_plugin, cell_edid)
    entry = links[shell_id].get(key)
    if entry is None:
        refs_in = vault.interior_cells.get(target, [])
        host = next((p for _c, _hp, p in vault.entries
                     if p.path.name == cell_plugin), plugin)
        profile = interior_profile(refs_in, vault, host, index,
                                   vault.pool_of(cell_plugin))
        entry = {
            "plugin": cell_plugin,
            "interiorCell": cell_edid,
            "doorModel": door_id or (door_base.model_key if door_base else None),
            "doorOffsetsInShell": [],
            "shellEditorId": shell_base.editor_id,
            **profile,
        }
        links[shell_id][key] = entry
    entry["doorOffsetsInShell"].append(door_offset(door, shell))
    linked_cells.add(target)
    stats["linked"] += 1


def _median(values):
    ordered = sorted(values)
    return ordered[len(ordered) // 2]


def consolidate(links) -> dict:
    out: dict[str, list] = {}
    for shell_id in sorted(links):
        rows = []
        for key in sorted(links[shell_id]):
            entry = dict(links[shell_id][key])
            offsets = entry.pop("doorOffsetsInShell")
            entry["placements"] = len(offsets)
            entry["doorOffsetInShell"] = {
                field: round(_median([o[field] for o in offsets]), 3)
                for field in ("xM", "yM", "zM", "yawDeg", "sideDeg", "radiusM")
            }
            entry["doorOffsetSpreadM"] = round(
                max(math.dist((o["xM"], o["yM"]), (entry["doorOffsetInShell"]["xM"],
                                                   entry["doorOffsetInShell"]["yM"]))
                    for o in offsets), 3)
            rows.append(entry)
        rows.sort(key=lambda r: (-r["placements"], r["interiorCell"]))
        out[shell_id] = rows
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--vault", type=Path, default=DEFAULT_VAULT)
    ap.add_argument("--out", type=Path, default=OUT_PATH)
    args = ap.parse_args()

    index = registry_index()
    plugins = discover_plugins(args.vault)
    print(f"mining {len(plugins)} plugins")
    vault = Vault(plugins)
    vault.index()
    links, linked_cells, diagnostics = mine(vault, index)
    shells = consolidate(links)

    unlinked = []
    for (plugin_name, edid) in sorted(vault.interior_cells):
        if (plugin_name, edid) in linked_cells:
            continue
        refs = vault.interior_cells[(plugin_name, edid)]
        if len(refs) >= 5:
            unlinked.append({"plugin": plugin_name, "interiorCell": edid,
                             "refs": len(refs)})

    doc = {
        "schemaVersion": SCHEMA_VERSION,
        "source": "worldgen.mine_door_links",
        "rule": {
            "link": "exterior door REFR XTEL -> interior door REFR -> its CELL",
            "shell": (f"nearest STAT/MSTT/SCOL ref within {SHELL_RADIUS_M} m of the "
                      f"exterior door whose OBND diagonal is >= {SHELL_MIN_OBND_M} m; "
                      "ties to the larger OBND volume"),
            "entrance": "doorOffsetInShell: the exterior door in the shell's own frame",
        },
        "plugins": [
            {"pool": pool, "file": path.name, "sha256": sha256(path)}
            for pool, path, _p in sorted(vault.entries, key=lambda e: e[1].name)
        ],
        "diagnostics": {name: dict(sorted(c.items()))
                        for name, c in sorted(diagnostics.items()) if c},
        "interiorCellsSeen": len(vault.interior_cells),
        "interiorCellsLinked": len(linked_cells),
        "shells": shells,
        "unlinkedInteriors": unlinked,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(doc, indent=1, sort_keys=False) + "\n")
    print(f"  {len(shells)} shells linked, {len(linked_cells)} interior cells, "
          f"{len(unlinked)} unlinked interiors -> {args.out}")


if __name__ == "__main__":
    main()
