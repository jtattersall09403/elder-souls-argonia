"""Report a plugin's landscape-texture painting: which LTEX ground textures
its LAND records actually use, with usage counts.

Written for mining the Black Marsh & Valenwood worldspace plugins (module 90
§74.1b — learn from their art direction, never lift-and-shift), but works on
any TES5 plugin. Resolves LTEX -> TXST -> diffuse path for records defined in
the plugin itself; references into masters (vanilla Skyrim) are reported by
form id.

Usage:
  python3 -m worldgen.esp_landtex <plugin.esp/esm>
"""

from __future__ import annotations

import struct
import sys
from collections import Counter
from pathlib import Path

from .esp import iter_records


def main() -> None:
    buf = Path(sys.argv[1]).read_bytes()
    ltex = {}   # formid -> (edid, txst formid)
    txst = {}   # formid -> (edid, diffuse path)
    usage = Counter()
    base_usage = Counter()
    for rec in iter_records(buf, 0, len(buf)):
        if rec.type == b"LTEX":
            edid, tnam = None, None
            for st, payload in rec.subrecords():
                if st == b"EDID":
                    edid = payload.rstrip(b"\0").decode("ascii", "replace")
                elif st == b"TNAM":
                    tnam = struct.unpack_from("<I", payload)[0]
            ltex[rec.form_id] = (edid, tnam)
        elif rec.type == b"TXST":
            edid, tx00 = None, None
            for st, payload in rec.subrecords():
                if st == b"EDID":
                    edid = payload.rstrip(b"\0").decode("ascii", "replace")
                elif st == b"TX00":
                    tx00 = payload.rstrip(b"\0").decode("ascii", "replace")
            txst[rec.form_id] = (edid, tx00)
        elif rec.type == b"LAND":
            for st, payload in rec.subrecords():
                if st in (b"BTXT", b"ATXT") and len(payload) >= 4:
                    fid = struct.unpack_from("<I", payload)[0]
                    usage[fid] += 1
                    if st == b"BTXT":
                        base_usage[fid] += 1

    print(f"{len(ltex)} LTEX, {len(txst)} TXST defined in plugin; "
          f"{len(usage)} distinct LTEX painted across LAND records\n")
    for fid, n in usage.most_common():
        name, tnam = ltex.get(fid, (None, None))
        tex = txst.get(tnam, (None, None))[1] if tnam else None
        label = name or f"(master formid {fid:08X})"
        print(f"{n:6d} uses ({base_usage[fid]:5d} base)  {label:38s} {tex or ''}")


if __name__ == "__main__":
    main()
