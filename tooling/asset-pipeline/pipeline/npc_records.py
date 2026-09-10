"""Read NPC_ appearance records straight out of a vanilla Skyrim plugin.

`pipeline/config/races/*.json` used to carry hand-transcribed magic numbers --
skin tint, hair tint, body weight, a FaceGen form id -- copied out of the
Creation Kit by eye. That is fine for seven male exemplars and hopeless the
moment we want to *select* appearances (female heads, race-valid candidates,
FaceGen actually present in the archives) rather than name them one at a time.

This module parses the plugin's record tree directly and hands back a typed
`NpcRecord` per NPC, so a config value is either read from Bethesda's data or
does not exist. It deliberately understands only what appearance selection
needs: NPC_, RACE, HDPT and CLFM, plus enough GRUP walking to find them.

Format reference: https://en.uesp.net/wiki/Skyrim_Mod:Mod_File_Format
"""

from __future__ import annotations

import argparse
import json
import struct
import zlib
from dataclasses import dataclass, asdict
from pathlib import Path

from .bsa import BSAArchive
from .models import ROOT

DATA = ROOT / "skyrim-source" / "Data"
CACHE = Path(__file__).resolve().parent.parent / "output" / "npc-records.json"

#: Record header flag: the record's data is a zlib stream behind a uint32 size.
_COMPRESSED = 0x00040000
#: ACBS flag bit 0 -- the actor is female.
_ACBS_FEMALE = 0x00000001
#: Skyrim stores hair colour as 0-255 bytes but the shader divides by 128, so a
#: CLFM's CNAM reproduces the game's tint only at that scale (see
#: docs/research/combat-and-systems/skyrim-facegen-runtime-pipeline.md).
_TINT_SCALE = 128.0

_FACEGEN_DIR = "meshes/actors/character/facegendata/facegeom/{plugin}/"

#: The ten races the player can be, in the order the race select screen uses.
PLAYABLE_RACES = (
    "NordRace",
    "ImperialRace",
    "BretonRace",
    "RedguardRace",
    "HighElfRace",
    "WoodElfRace",
    "DarkElfRace",
    "OrcRace",
    "KhajiitRace",
    "ArgonianRace",
)


@dataclass(frozen=True)
class NpcRecord:
    formId: str
    editorId: str
    isFemale: bool
    raceEditorId: str | None
    skinTint: tuple[float, float, float] | None
    hairTint: tuple[float, float, float] | None
    bodyWeight: float | None
    headParts: tuple[str, ...]
    hasFaceGen: bool


# -- low-level plugin walking ----------------------------------------------


def iter_subrecords(data: bytes):
    """Yield ``(signature, payload)`` for a record's flat subrecord run.

    An ``XXXX`` subrecord does not carry data of its own: it supplies the real
    length of the *next* subrecord, whose own uint16 size field is then zero.
    """
    pos = 0
    override: int | None = None
    end = len(data)
    while pos + 6 <= end:
        sig = data[pos : pos + 4]
        size = struct.unpack_from("<H", data, pos + 4)[0]
        pos += 6
        if sig == b"XXXX":
            override = struct.unpack_from("<I", data, pos)[0]
            pos += size
            continue
        if override is not None:
            size = override
            override = None
        yield sig, data[pos : pos + size]
        pos += size


def record_data(raw: bytes, flags: int) -> bytes:
    """Return a record's subrecord run, inflating it if the record is packed."""
    if flags & _COMPRESSED:
        # The uint32 prefix is the inflated size; zlib knows it too, so it is
        # only useful as a sanity check and we let zlib do the work.
        return zlib.decompress(raw[4:])
    return raw


def iter_records(buf: bytes, start: int = 0, end: int | None = None):
    """Yield ``(type, formId, data)`` for every record in a GRUP tree.

    GRUPs nest arbitrarily (top group -> block -> sub-block -> cell children),
    so this recurses rather than assuming a depth.
    """
    end = len(buf) if end is None else end
    pos = start
    while pos + 24 <= end:
        sig = buf[pos : pos + 4]
        size, flags, form_id = struct.unpack_from("<III", buf, pos + 4)
        if sig == b"GRUP":
            # `size` on a GRUP counts its own 24-byte header.
            yield from iter_records(buf, pos + 24, pos + size)
            pos += size
            continue
        body = buf[pos + 24 : pos + 24 + size]
        yield sig, form_id, body, flags
        pos += 24 + size


# -- field decoding ---------------------------------------------------------


def _cstr(payload: bytes) -> str:
    return payload.split(b"\x00", 1)[0].decode("cp1252", "replace")


def cnam_to_tint(packed: int) -> tuple[float, float, float]:
    """Convert a CLFM ``CNAM`` packed colour to the runtime's /128 tint.

    CNAM's four bytes are in file order R,G,B,alpha, which as a little-endian
    uint32 is 0x00BBGGRR -- red is the *low* byte. Cross-checked against
    argonian.json's recorded hair tint (36, 23, 23)/128.
    """
    return (
        (packed & 0xFF) / _TINT_SCALE,
        ((packed >> 8) & 0xFF) / _TINT_SCALE,
        ((packed >> 16) & 0xFF) / _TINT_SCALE,
    )


def acbs_is_female(payload: bytes) -> bool:
    if len(payload) < 4:
        return False
    return bool(struct.unpack_from("<I", payload, 0)[0] & _ACBS_FEMALE)


def _floats(payload: bytes, count: int) -> tuple[float, ...] | None:
    if len(payload) < 4 * count:
        return None
    return struct.unpack_from("<" + "f" * count, payload, 0)


# -- parsing ----------------------------------------------------------------


def _facegen_names(plugin: str) -> set[str]:
    """Form ids (8-hex lowercase) with a generated head NIF in the meshes BSA."""
    archive = DATA / "Skyrim - Meshes.bsa"
    if not archive.exists():
        return set()
    prefix = _FACEGEN_DIR.format(plugin=plugin.lower())
    found = set()
    for name in BSAArchive(archive).namelist():
        low = name.replace("\\", "/").lower()
        if low.startswith(prefix) and low.endswith(".nif"):
            found.add(Path(low).stem)
    return found


def parse_plugin(path: Path) -> tuple[dict[int, dict], dict[int, str], dict[int, str], dict[int, int]]:
    """Return ``(npcs, races, headparts, hair_colours)`` keyed by form id."""
    buf = path.read_bytes()
    npcs: dict[int, dict] = {}
    races: dict[int, str] = {}
    headparts: dict[int, str] = {}
    hair: dict[int, int] = {}

    for sig, form_id, body, flags in iter_records(buf):
        if sig not in (b"NPC_", b"RACE", b"HDPT", b"CLFM"):
            continue
        data = record_data(body, flags)
        if sig == b"NPC_":
            npcs[form_id] = _parse_npc(data)
        elif sig == b"RACE":
            for s, p in iter_subrecords(data):
                if s == b"EDID":
                    races[form_id] = _cstr(p)
                    break
        elif sig == b"HDPT":
            for s, p in iter_subrecords(data):
                if s == b"EDID":
                    headparts[form_id] = _cstr(p)
                    break
        else:  # CLFM
            for s, p in iter_subrecords(data):
                if s == b"CNAM" and len(p) >= 4:
                    hair[form_id] = struct.unpack_from("<I", p, 0)[0]
    return npcs, races, headparts, hair


def _parse_npc(data: bytes) -> dict:
    out: dict = {
        "editorId": "",
        "isFemale": False,
        "race": None,
        "skinTint": None,
        "hairColour": None,
        "bodyWeight": None,
        "headParts": [],
    }
    for sig, payload in iter_subrecords(data):
        if sig == b"EDID":
            out["editorId"] = _cstr(payload)
        elif sig == b"ACBS":
            out["isFemale"] = acbs_is_female(payload)
        elif sig == b"RNAM" and len(payload) >= 4:
            out["race"] = struct.unpack_from("<I", payload, 0)[0]
        elif sig == b"QNAM":
            rgb = _floats(payload, 3)
            if rgb:
                out["skinTint"] = list(rgb)
        elif sig == b"HCLF" and len(payload) >= 4:
            out["hairColour"] = struct.unpack_from("<I", payload, 0)[0]
        elif sig == b"NAM7" and len(payload) >= 4:
            # NAM6 is height, NAM7 the 0-100 weight slider; confirmed against
            # the seven exemplar NPCs already recorded in config/races/.
            out["bodyWeight"] = _floats(payload, 1)[0]
        elif sig == b"PNAM" and len(payload) >= 4:
            out["headParts"].append(struct.unpack_from("<I", payload, 0)[0])
    return out


def load_npcs(plugin: str = "Skyrim.esm", refresh: bool = False) -> dict[str, NpcRecord]:
    """Parse (or reuse a cached parse of) every NPC_ in ``plugin``."""
    if not refresh and CACHE.exists():
        cached = json.loads(CACHE.read_text())
        if cached.get("plugin") == plugin:
            return {
                k: NpcRecord(
                    **{
                        **v,
                        "skinTint": tuple(v["skinTint"]) if v["skinTint"] else None,
                        "hairTint": tuple(v["hairTint"]) if v["hairTint"] else None,
                        "headParts": tuple(v["headParts"]),
                    }
                )
                for k, v in cached["npcs"].items()
            }

    npcs, races, headparts, hair = parse_plugin(DATA / plugin)
    facegen = _facegen_names(plugin)
    out: dict[str, NpcRecord] = {}
    for form_id, n in npcs.items():
        key = f"{form_id:08x}"
        colour = hair.get(n["hairColour"]) if n["hairColour"] else None
        out[key] = NpcRecord(
            formId=key,
            editorId=n["editorId"],
            isFemale=n["isFemale"],
            raceEditorId=races.get(n["race"]) if n["race"] else None,
            skinTint=tuple(n["skinTint"]) if n["skinTint"] else None,
            hairTint=cnam_to_tint(colour) if colour is not None else None,
            bodyWeight=n["bodyWeight"],
            headParts=tuple(headparts.get(p, f"{p:08x}") for p in n["headParts"]),
            hasFaceGen=key in facegen,
        )

    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps({"plugin": plugin, "npcs": {k: asdict(v) for k, v in out.items()}}, indent=1))
    return out


# -- CLI --------------------------------------------------------------------


def _main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--plugin", default="Skyrim.esm")
    ap.add_argument("--race")
    sex = ap.add_mutually_exclusive_group()
    sex.add_argument("--female", action="store_true")
    sex.add_argument("--male", action="store_true")
    ap.add_argument("--with-facegen", action="store_true")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()

    rows = [n for n in load_npcs(args.plugin, refresh=args.refresh).values()]
    if args.race:
        rows = [n for n in rows if n.raceEditorId == args.race]
    if args.female:
        rows = [n for n in rows if n.isFemale]
    if args.male:
        rows = [n for n in rows if not n.isFemale]
    if args.with_facegen:
        rows = [n for n in rows if n.hasFaceGen]
    rows.sort(key=lambda n: n.editorId)

    if args.json:
        print(json.dumps([asdict(n) for n in rows], indent=1))
        return
    print(f"{'formId':8}  {'editorId':28} {'wt':>5}  {'skin':22} {'hair':22} head parts")
    for n in rows:
        skin = " ".join(f"{c:.3f}" for c in n.skinTint) if n.skinTint else "-"
        hairs = " ".join(f"{c:.3f}" for c in n.hairTint) if n.hairTint else "-"
        wt = f"{n.bodyWeight:.0f}" if n.bodyWeight is not None else "-"
        print(f"{n.formId}  {n.editorId:28} {wt:>5}  {skin:22} {hairs:22} {', '.join(n.headParts[:3])}")
    print(f"\n{len(rows)} NPC(s)")


if __name__ == "__main__":
    _main()
