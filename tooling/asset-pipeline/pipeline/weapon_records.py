"""Read WEAP (and shield ARMO) records straight out of a vanilla Skyrim plugin.

The arsenal's weight, value, damage, speed and reach used to be placeholders.
Bethesda already balanced every one of these meshes, so the numbers are read
from the plugin rather than invented: this module walks Skyrim.esm's record
tree, matches each `config/weapons/arsenal.json` entry to the record that uses
the same model, and writes one generated JSON the runtime reads.

Six arsenal entries are shields, which Skyrim stores as ARMO, not WEAP; they
carry `kind: "ARMO"` and an `armourRating` instead of damage/speed/reach.

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
        index.setdefault(_model_key(parsed["model"]), []).append(parsed)
    return index


def mine(plugins: tuple[str, ...] = ("Skyrim.esm", "Update.esm")) -> dict:
    arsenal = json.loads(ARSENAL.read_text())
    index: dict[str, list[dict]] = {}
    for plugin in plugins:
        p = DATA / plugin
        if not p.exists():
            continue
        for key, recs in index_plugin(p).items():
            index.setdefault(key, []).extend(recs)

    items: dict[str, dict] = {}
    missing: list[str] = []
    for item in arsenal["items"]:
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
    args = ap.parse_args()
    payload = mine()
    text = json.dumps(payload, indent=2) + "\n"
    if args.write:
        OUTPUT.write_text(text)
        print(f"{len(payload['items'])} items -> {OUTPUT}")
    else:
        print(text)


if __name__ == "__main__":
    _main()
