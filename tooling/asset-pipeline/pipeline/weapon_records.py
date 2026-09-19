"""Read WEAP (and shield ARMO) records straight out of the plugin that ships them.

The arsenal's weight, value, damage, speed and reach used to be placeholders.
Bethesda already balanced every one of these meshes, so the numbers are read
from the plugin rather than invented: this module walks Skyrim.esm's record
tree, matches each `config/weapons/arsenal.json` entry to the record that uses
the same model, and writes one generated JSON the runtime reads.

Six arsenal entries are shields, which Skyrim stores as ARMO, not WEAP; they
carry `kind: "ARMO"` and an `armourRating` instead of damage/speed/reach.

Arsenal entries sourced from a mod carry a `root` (a vault-relative data
directory); those are read from that mod's own plugin, the same way, and record
the plugin name and hash per item. Nothing about a sourced weapon's numbers is
invented either.

Format reference: UESP "Skyrim Mod:Mod File Format/WEAP" (and /ARMO).
Reuses `npc_records`' generic readers -- there is one ESM reader in this
pipeline, not two.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from dataclasses import dataclass, asdict, field
from datetime import date
from pathlib import Path

from . import npc_records as nr
from .npc_records import DATA, iter_records, iter_subrecords, record_data
from .models import ROOT

SCHEMA_VERSION = 1

ARSENAL = Path(__file__).resolve().parent / "config" / "weapons" / "arsenal.json"
OUTPUT = (
    Path(__file__).resolve().parents[3]
    / "packages" / "game-core" / "src" / "equipment" / "generated" / "weapon-records.json"
)

#: EDID fragments that mark a record as a variant of the real item -- an NPC-only
#: copy, a draugr's, an enchanted or conjured one -- rather than the item itself.
VARIANT_MARKERS = ("npc", "draugr", "skeleton", "enchanted", "ench", "bound")


@dataclass
class WeaponRecord:
    editorId: str
    formId: str
    kind: str
    model: str
    weight: float
    value: int
    damage: int | None = None
    speed: float | None = None
    reach: float | None = None
    critDamage: int | None = None
    armourRating: float | None = None
    candidates: list[str] = field(default_factory=list)
    #: Which plugin file the record was read from, for items sourced from a mod
    #: (``{"plugin": ..., "sha256": ...}``). Vanilla items carry the top-level
    #: ``source`` of the generated file instead.
    source: dict | None = None


def _model_key(path: str) -> str:
    """The model path an arsenal `nif` and a record MODL can be compared on.

    Lowercased, forward slashes, relative to `meshes/`. A WEAP's MODL is
    sometimes the first-person mesh of the same weapon (`ElvenDagger` is the one
    vanilla case in this arsenal), so the `1stperson` prefix on the file name is
    dropped: it is the same object either way.
    """
    p = path.lower().replace("\\", "/").lstrip("/")
    if p.startswith("meshes/"):
        p = p[len("meshes/"):]
    head, _, name = p.rpartition("/")
    if name.startswith("1stperson"):
        name = name[len("1stperson"):]
    return f"{head}/{name}" if head else name


def parse_weap(data: bytes) -> dict:
    """Decode the subrecords of one WEAP: EDID, MODL, DATA, DNAM, CRDT.

    DATA is uint32 value, float32 weight, uint16 damage; DNAM is uint8 animType,
    int8, uint16, float32 speed, float32 reach; CRDT opens with a uint16 crit
    damage. FULL is skipped: Skyrim.esm is localised, so it holds a string-table
    id rather than a name.
    """
    out: dict = {"editorId": "", "model": None, "value": None, "weight": None,
                 "damage": None, "speed": None, "reach": None, "critDamage": None}
    for sig, p in iter_subrecords(data):
        if sig == b"EDID":
            out["editorId"] = nr._cstr(p)
        elif sig == b"MODL" and b"." in p:
            out["model"] = nr._cstr(p)
        elif sig == b"DATA" and len(p) >= 10:
            value, weight, damage = struct.unpack_from("<IfH", p, 0)
            out.update(value=value, weight=weight, damage=damage)
        elif sig == b"DNAM" and len(p) >= 16:
            speed, reach = struct.unpack_from("<ff", p, 4)
            out.update(speed=speed, reach=reach)
        elif sig == b"CRDT" and len(p) >= 2:
            out["critDamage"] = struct.unpack_from("<H", p, 0)[0]
    return out


def parse_armo(data: bytes) -> dict:
    """Decode one ARMO: EDID, MOD2 (the world model), DATA (value, weight),
    DNAM (armour rating x100)."""
    out: dict = {"editorId": "", "model": None, "value": None, "weight": None,
                 "armourRating": None}
    for sig, p in iter_subrecords(data):
        if sig == b"EDID":
            out["editorId"] = nr._cstr(p)
        elif sig == b"MOD2" and b"." in p:
            out["model"] = nr._cstr(p)
        elif sig == b"DATA" and len(p) >= 8:
            value, weight = struct.unpack_from("<If", p, 0)
            out.update(value=value, weight=weight)
        elif sig == b"DNAM" and len(p) >= 4:
            out["armourRating"] = struct.unpack_from("<i", p, 0)[0] / 100.0
    return out


def _is_plain(editor_id: str) -> bool:
    """Whether an EDID names the item itself rather than a variant of it."""
    low = editor_id.lower()
    return not any(m in low for m in VARIANT_MARKERS) and not any(c.isdigit() for c in low)


def choose(candidates: list[dict]) -> dict:
    """The record that *is* the weapon, out of everything sharing its model.

    Prefer a plain EDID (no NPC/draugr/enchanted marker, no digits); break a
    remaining tie on the shortest, then alphabetical, EDID, so the choice does
    not depend on record order in the file.
    """
    plain = [c for c in candidates if _is_plain(c["editorId"])] or candidates
    return min(plain, key=lambda c: (len(c["editorId"]), c["editorId"]))


def index_plugin(path: Path) -> dict[str, list[dict]]:
    """Every WEAP and shield-bearing ARMO in `path`, keyed by model key."""
    buf = path.read_bytes()
    index: dict[str, list[dict]] = {}
    for sig, form_id, body, flags in iter_records(buf):
        if sig not in (b"WEAP", b"ARMO"):
            continue
        parsed = (parse_weap if sig == b"WEAP" else parse_armo)(record_data(body, flags))
        if not parsed["model"] or parsed["weight"] is None:
            continue
        parsed["formId"] = f"{form_id:08x}"
        parsed["kind"] = sig.decode()
        parsed["plugin"] = path.name
        index.setdefault(_model_key(parsed["model"]), []).append(parsed)
    return index


def build_index(plugin_paths: list[Path]) -> dict[str, list[dict]]:
    """One model-keyed record index over several plugins, later ones appended."""
    index: dict[str, list[dict]] = {}
    for p in plugin_paths:
        if not Path(p).exists():
            continue
        for key, recs in index_plugin(Path(p)).items():
            index.setdefault(key, []).extend(recs)
    return index


def records_for_models(plugin_paths: list[Path], models: list[str]) -> dict[str, dict | None]:
    """The chosen WEAP/ARMO record for each model path, keyed by that path.

    The same reader the arsenal mine uses, pointed at an arbitrary plugin and an
    arbitrary list of model paths -- a mod's meshes are read exactly the way
    Skyrim.esm's are, so a sourced weapon's damage/speed/reach never has to be
    guessed. `None` means no record in those plugins uses that model.
    """
    index = build_index(list(plugin_paths))
    out: dict[str, dict | None] = {}
    for model in models:
        recs = index.get(_model_key(model))
        if not recs:
            out[model] = None
            continue
        best = choose(recs)
        out[model] = {
            "editorId": best["editorId"], "formId": best["formId"], "kind": best["kind"],
            "model": best["model"].replace("\\", "/"),
            "weight": round(best["weight"], 4), "value": int(best["value"]),
            "damage": best.get("damage"),
            "speed": None if best.get("speed") is None else round(best["speed"], 4),
            "reach": None if best.get("reach") is None else round(best["reach"], 4),
            "critDamage": best.get("critDamage"),
            "armourRating": best.get("armourRating"),
            "candidates": sorted(c["editorId"] for c in recs),
        }
    return out


def plugins_under(root: Path) -> list[Path]:
    """Every plugin file sitting directly in a mod's ``Data`` directory, sorted."""
    return sorted(
        p for p in Path(root).iterdir()
        if p.is_file() and p.suffix.lower() in (".esp", ".esm", ".esl")
    )


def _plugin_source(plugin_name: str, roots: dict[str, Path]) -> dict | None:
    """``{"plugin", "sha256"}`` for a mod plugin, or None for a vanilla one."""
    path = roots.get(plugin_name)
    if path is None:
        return None
    return {"plugin": plugin_name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


#: Marks a record nobody's plugin ships: the numbers were authored by hand from
#: a named vanilla record, because the mod is loose meshes with no ESP at all.
AUTHORED_NOTE = "no plugin ships with this mod"


def _plugin_key(item: dict) -> str | None:
    """Where an item's WEAP record is read from, as a cache key.

    An explicit ``plugin`` (a vault-relative plugin file) wins over the ``root``
    scan: a mod may split its meshes and its ESP across sibling install
    directories, so the directory holding ``meshes/`` is not always the
    directory holding the plugin.
    """
    if item.get("plugin"):
        return item["plugin"]
    return item.get("root")


def _plugin_paths(root_base: Path, key: str) -> list[Path]:
    """The plugin files a `_plugin_key` names: one file, or a data root's own."""
    path = root_base / key
    return [path] if path.is_file() else plugins_under(path)


def _authored(item: dict) -> dict:
    """One arsenal entry's hand-authored record, with what it was taken from.

    Five Black Marsh Import meshes ship as OBJ with no plugin, so there is no
    Bethesda record to read. The numbers are copied wholesale from the named
    vanilla record of the same class and material tier -- still not invented,
    but the provenance is different and says so.
    """
    record = item["record"]
    taken_from = item["recordFrom"]
    return {
        "editorId": taken_from,
        "kind": "AUTHORED",
        "model": item.get("obj") or item.get("nif"),
        "weight": float(record["weight"]),
        "value": int(record["value"]),
        "damage": int(record["damage"]),
        "speed": float(record["speed"]),
        "reach": float(record["reach"]),
        "critDamage": int(record["critDamage"]),
        "candidates": [taken_from],
        "source": {"kind": "authored", "note": AUTHORED_NOTE, "takenFrom": taken_from},
    }


def mine(plugins: tuple[str, ...] = ("Skyrim.esm", "Update.esm"),
         vault_root: Path | None = None) -> dict:
    """Resolve every arsenal item against the plugin that ships its mesh.

    Items without a ``root`` are matched in the vanilla plugins. An item with a
    ``root`` (a vault-relative mod data directory) is matched in the plugins
    found directly under that root, and gains a per-item ``source`` naming that
    plugin and its hash. Model paths are compared by `_model_key`, so a mod
    author's casing and a leading ``meshes/`` on either side do not matter.

    An item carrying a ``record`` block is authored rather than mined: its mod
    ships no plugin at all (see `_authored`).

    Animated Armoury's four "spear" items share the pike NIF, so they resolve to
    the pike WEAP record; that is the record for that mesh and is correct.
    """
    root_base = Path(vault_root) if vault_root is not None else ROOT
    arsenal = json.loads(ARSENAL.read_text())
    vanilla_index = build_index([DATA / plugin for plugin in plugins])

    mod_indexes: dict[str, dict[str, list[dict]]] = {}
    mod_plugins: dict[str, Path] = {}
    # An authored item's root holds meshes and no plugin; nothing is read from it.
    keys = {_plugin_key(i) for i in arsenal["items"] if not i.get("record")}
    for key in sorted(k for k in keys if k):
        paths = _plugin_paths(root_base, key)
        mod_indexes[key] = build_index(paths)
        for path in paths:
            mod_plugins[path.name] = path

    items: dict[str, dict] = {}
    missing: list[str] = []
    for item in arsenal["items"]:
        if item.get("record"):
            items[item["id"]] = _authored(item)
            continue
        key = _plugin_key(item)
        index = mod_indexes[key] if key else vanilla_index
        recs = index.get(_model_key(item["nif"]))
        if not recs:
            missing.append(item["id"])
            continue
        best = choose(recs)
        rec = WeaponRecord(
            editorId=best["editorId"], formId=best["formId"], kind=best["kind"],
            model=best["model"].replace("\\", "/"),
            weight=round(best["weight"], 4), value=int(best["value"]),
            damage=best.get("damage"),
            speed=None if best.get("speed") is None else round(best["speed"], 4),
            reach=None if best.get("reach") is None else round(best["reach"], 4),
            critDamage=best.get("critDamage"),
            armourRating=best.get("armourRating"),
            candidates=sorted(c["editorId"] for c in recs),
            source=_plugin_source(best["plugin"], mod_plugins),
        )
        items[item["id"]] = {k: v for k, v in asdict(rec).items() if v is not None}
    if missing:
        raise SystemExit(f"unresolved arsenal items: {', '.join(missing)}")

    esm = DATA / plugins[0]
    return {
        "schemaVersion": SCHEMA_VERSION,
        "source": {
            "plugin": plugins[0],
            "sha256": hashlib.sha256(esm.read_bytes()).hexdigest(),
            "minedAt": date.today().isoformat(),
        },
        "items": {k: items[k] for k in sorted(items)},
    }


def _main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--write", action="store_true", help=f"write {OUTPUT.name}")
    ap.add_argument("--plugin", action="append", default=[], type=Path,
                    help="plugin to read instead of the vault's Skyrim.esm (repeatable)")
    ap.add_argument("--models", nargs="*", default=[],
                    help="model paths to look up in --plugin, instead of the arsenal")
    args = ap.parse_args()
    if args.plugin or args.models:
        if not (args.plugin and args.models):
            raise SystemExit("--plugin and --models are used together")
        print(json.dumps(records_for_models(args.plugin, args.models), indent=2))
        return
    payload = mine()
    text = json.dumps(payload, indent=2) + "\n"
    if args.write:
        OUTPUT.write_text(text)
        print(f"{len(payload['items'])} items -> {OUTPUT}")
    else:
        print(text)


if __name__ == "__main__":
    _main()
