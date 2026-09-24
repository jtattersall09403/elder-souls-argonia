"""Skyrim.esm's sound records: which files form a set, and how they play.

"What goes with what is read from the plugin data" (CLAUDE.md): a sound set
is a vanilla SNDR (sound descriptor) with its ANAM file list and its BNAM
variance values, never a guess from filenames. Footsteps follow Bethesda's
chain FSTS -> FSTP (action) -> IPDS (material pairs) -> IPCT -> SNDR.

Layouts (UESP ``Skyrim_Mod:Mod_File_Format/SNDR``, ``/IPDS``, ``/FSTP``,
``/FSTS``, ``/IPCT``, ``/MATT``, ``/WTHR``):

- SNDR: EDID, GNAM category (SNCT), ANAM* file paths, LNAM {uint16 flags:
  0x0800 loop, 0x1000 envelope fast, 0x2000 envelope slow}, BNAM {int8
  frequency shift %, uint8 frequency variance %, uint8 priority, uint8 dB
  variance, uint16 static attenuation x100 dB}.
- IPCT: SNAM sound 1, NAM1 sound 2 (SNDR formids).
- IPDS: PNAM* {MATT formid, IPCT formid}.
- FSTP: DATA IPDS formid, ANAM action tag. FSTS: DATA formid list.
- WTHR: SNAM* {SNDR formid, uint32 type: 0 default, 1 precipitation,
  2 wind, 3 thunder}.
- REGN: RDSA* {formid sound (SNDR or SOUN), uint32 flags: 1 pleasant,
  2 cloudy, 4 rainy, 8 snowy; float32 chance} — Skyrim's region sound
  table, the shape module 57 §106 adopts.

The parse (~2 s) is cached in the vault as JSON; ``--refresh`` rebuilds it.
"""

from __future__ import annotations

import argparse
import json
import struct
from pathlib import Path

from . import paths
from pipeline.npc_records import iter_records, iter_subrecords, record_data  # reused reader

_WANT = {b"SNDR", b"SNCT", b"MATT", b"IPCT", b"IPDS", b"FSTP", b"FSTS", b"WTHR", b"SOUN", b"REGN"}
CACHE = paths.VAULT_OUT / "skyrim-sound-records.json"
#: Bump when ``parse`` changes what it records; a cache from another version is re-parsed.
PARSER_VERSION = 2
LOOP_FLAGS = {0x0800: "loop", 0x1000: "envelope-fast", 0x2000: "envelope-slow"}
#: Every LNAM looping mode plays the file as a loop (the envelopes shape its attack/release).
LOOPING_MODES = frozenset(LOOP_FLAGS.values())
REGION_WEATHER_FLAGS = {1: "pleasant", 2: "cloudy", 4: "rainy", 8: "snowy"}
WTHR_SOUND_TYPES = {0: "default", 1: "precipitation", 2: "wind", 3: "thunder"}


def _cstr(p: bytes) -> str:
    return p.split(b"\x00", 1)[0].decode("cp1252")


def _fid(p: bytes, at: int = 0) -> str:
    return f"{struct.unpack_from('<I', p, at)[0]:08x}"


def normalise_track(anam: str) -> str:
    """ANAM ``Data\\Sound\\FX\\...\\x.wav`` -> archive path ``sound/fx/.../x.wav``.

    The engine resolves a ``.wav`` track to a ``.xwm`` of the same stem when
    only that exists; the caller does that lookup against the archive.
    """
    # Vanilla writes the same root four ways: "Data\Sound\fx\..", "sound\fx\..",
    # "fx\.." (relative to Data\Sound) and "\Data\Sound\fx\..".
    p = anam.replace("\\", "/").lower().lstrip("/")
    if p.startswith("data/"):
        p = p[5:]
    return p if p.startswith(("sound/", "music/")) else f"sound/{p}"


def parse(esm: Path = paths.SKYRIM_ESM) -> dict:
    buf = esm.read_bytes()
    out: dict[str, dict] = {k.decode().lower(): {} for k in _WANT}
    for sig, form_id, body, flags in iter_records(buf):
        if sig not in _WANT:
            continue
        fid = f"{form_id:08x}"
        subs = list(iter_subrecords(record_data(body, flags)))
        edid = next((_cstr(p) for s, p in subs if s == b"EDID"), "")
        rec: dict = {"edid": edid}
        if sig == b"SNDR":
            rec["tracks"] = [normalise_track(_cstr(p)) for s, p in subs if s == b"ANAM"]
            for s, p in subs:
                if s == b"GNAM" and len(p) >= 4:
                    rec["category"] = _fid(p)
                elif s == b"SNAM" and len(p) >= 4:
                    rec["alias"] = _fid(p)
                elif s == b"LNAM" and len(p) >= 2:
                    f = struct.unpack_from("<H", p)[0]
                    rec["looping"] = next((v for k, v in LOOP_FLAGS.items() if f & k), "none")
                elif s == b"BNAM" and len(p) >= 6:
                    shift, fvar, prio, dbvar, att = struct.unpack_from("<bBBBH", p)
                    rec.update(freqShiftPct=shift, freqVariancePct=fvar, priority=prio,
                               dbVariance=dbvar, staticAttenuationDb=att / 100)
                elif s == b"CTDA":
                    rec["conditions"] = rec.get("conditions", 0) + 1
        elif sig == b"SNCT":
            rec["parent"] = next((_fid(p) for s, p in subs if s == b"PNAM" and len(p) >= 4), None)
        elif sig == b"MATT":
            rec["name"] = next((_cstr(p) for s, p in subs if s == b"MNAM"), "")
        elif sig == b"IPCT":
            rec["sound1"] = next((_fid(p) for s, p in subs if s == b"SNAM" and len(p) >= 4), None)
            rec["sound2"] = next((_fid(p) for s, p in subs if s == b"NAM1" and len(p) >= 4), None)
        elif sig == b"IPDS":
            rec["pairs"] = [[_fid(p, 0), _fid(p, 4)] for s, p in subs if s == b"PNAM" and len(p) >= 8]
        elif sig == b"FSTP":
            rec["impactSet"] = next((_fid(p) for s, p in subs if s == b"DATA" and len(p) >= 4), None)
            rec["action"] = next((_cstr(p) for s, p in subs if s == b"ANAM"), "")
        elif sig == b"FSTS":
            data = next((p for s, p in subs if s == b"DATA"), b"")
            rec["footsteps"] = [_fid(data, i) for i in range(0, len(data) - 3, 4)]
        elif sig == b"WTHR":
            rec["sounds"] = [[_fid(p, 0), WTHR_SOUND_TYPES.get(struct.unpack_from("<I", p, 4)[0], "?")]
                             for s, p in subs if s == b"SNAM" and len(p) >= 8]
        elif sig == b"REGN":
            rec["sounds"] = [[_fid(p, i), struct.unpack_from("<I", p, i + 4)[0],
                              round(struct.unpack_from("<f", p, i + 8)[0], 4)]
                             for s, p in subs if s == b"RDSA" for i in range(0, len(p) - 11, 12)]
        elif sig == b"SOUN":
            rec["descriptor"] = next((_fid(p) for s, p in subs if s == b"SDSC" and len(p) >= 4), None)
        out[sig.decode().lower()][fid] = rec
    return out


def _stamp(esm: Path) -> dict:
    st = esm.stat()
    return {"parser": PARSER_VERSION, "esm": esm.name, "bytes": st.st_size, "mtimeNs": st.st_mtime_ns}


def load(refresh: bool = False, esm: Path = paths.SKYRIM_ESM) -> dict:
    """The parsed records, from the vault cache when it matches this parser and this plugin file."""
    stamp = _stamp(esm)
    if CACHE.exists() and not refresh:
        cached = json.loads(CACHE.read_text())
        if cached.get("stamp") == stamp:
            return cached["records"]
    data = parse(esm)
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps({"stamp": stamp, "records": data}, sort_keys=True))
    return data


def by_edid(records: dict, kind: str) -> dict[str, dict]:
    """``{edid: {**record, "formId": fid}}`` for one record type."""
    return {r["edid"]: {**r, "formId": fid} for fid, r in records[kind].items() if r.get("edid")}


def footstep_sounds(records: dict, footstep_edid: str) -> dict[str, str]:
    """``{MATT edid: SNDR edid}`` for one FSTP action, through its IPDS."""
    fstp = by_edid(records, "fstp")[footstep_edid]
    ipds = records["ipds"][fstp["impactSet"]]
    out = {}
    for matt, ipct in ipds["pairs"]:
        snd = records["ipct"].get(ipct, {}).get("sound1")
        if snd and snd in records["sndr"] and matt in records["matt"]:
            out[records["matt"][matt]["edid"]] = records["sndr"][snd]["edid"]
    return out


def region_sounds(records: dict, region_edid: str) -> list[dict]:
    """A REGN's sound table: ``[{sndr, weather: [..], chance}]`` (SOUN entries resolved to their SNDR)."""
    reg = next(r for r in records["regn"].values() if r["edid"] == region_edid)
    out = []
    for fid, flags, chance in reg["sounds"]:
        if fid in records["soun"]:
            fid = records["soun"][fid].get("descriptor") or fid
        snd = records["sndr"].get(fid)
        if snd:
            out.append({"sndr": snd["edid"], "chance": chance,
                        "weather": [v for k, v in REGION_WEATHER_FLAGS.items() if flags & k]})
    return out


def footstep_set(records: dict, fsts_edid: str) -> list[dict]:
    """The FSTP actions of one footstep set: ``[{fstp, action}]``, first occurrence order."""
    fsts = by_edid(records, "fsts")[fsts_edid]
    seen, out = set(), []
    for fid in fsts["footsteps"]:
        if fid in seen or fid not in records["fstp"]:
            continue
        seen.add(fid)
        out.append({"fstp": records["fstp"][fid]["edid"], "action": records["fstp"][fid]["action"]})
    return out


def _main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--prefix", help="list SNDR edids starting with this")
    ap.add_argument("--footstep", help="print the material -> SNDR map of one FSTP edid")
    a = ap.parse_args()
    recs = load(a.refresh)
    print({k: len(v) for k, v in recs.items()})
    if a.prefix:
        for e, r in sorted(by_edid(recs, "sndr").items()):
            if e.lower().startswith(a.prefix.lower()):
                print(e, r.get("looping"), len(r["tracks"]), r["tracks"][:1])
    if a.footstep:
        for m, s in sorted(footstep_sounds(recs, a.footstep).items()):
            print(m, "->", s)


if __name__ == "__main__":
    _main()
