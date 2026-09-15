"""Standard gate (decision 0066): below the freeze gate, water is READ FROM THE
RECORD, never re-derived.

16c round 1 re-derived the sea by connectivity although the owner had signed
the hydrology graph. Every stage below the gate had the same shape: it read
the coarse Phase 3 classifications (`hydro-flood.png`, `hydro-salinity.png`,
`hydrology-pass1.npz`) or decoded a water raster itself and decided "sea",
"flood band", "tidal" or "navigable" on its own. This gate makes that a
failing build:

* a module below the gate that opens a pre-graph classification or decodes a
  water raster directly, or reads the survey's classification fields
  (`flood`, `tidal`, `salinity`, `wetlands`, `lakes`, `river_band`, or the
  `floodBand` / `riverBand` / `onLake` / `wetland` sample keys — all deleted
  in 16d), FAILS unless it is listed in
  `record-reads-allowlist.json` with the chunk that ports it;
* an allowlisted module that no longer has any such read FAILS too — the row
  is stale and must be deleted (the known-red pattern), so the allowlist can
  only shrink;
* the record reader itself (`site_fields.ProvinceSurvey.water_at / reach /
  body`, delegating to `water_report.ShippedWater`), the stages above the
  gate and the water compile, which realise the graph by design, are exempt
  by name below.

Ported modules read water through the record reader only: body or reach id,
kind, level, season from `hydrology-graph.json` / `water-meta.json`, depth
sampled from the compiled raster at that id's extent.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

PKG = Path(__file__).resolve().parent
ALLOWLIST = PKG / "record-reads-allowlist.json"

# Above the gate (they PRODUCE the record) and the water compile (it realises it).
EXEMPT = {
    "sculpt_province", "sculpt", "compile_hydrology", "hydrology", "compile_society",
    "society", "shape_province", "hydrology_graph", "approved_bodies", "carve_province",
    "carve", "carve_routes", "apply_terrain_patches", "patch_water", "compile_water",
    "standing_water", "water_fields", "water_profiles", "fluvial", "terrain_patches",
    "author_terrain_patches", "chain_stages", "ladder", "site_fields", "npz_io",
    "regions", "reclassify_regions", "report_regions", "terrain_preconditions",
    "water_correction_patches", "water_report",
    # samples compile_water's own `water-pass1.npz` for a MEASUREMENT of the
    # ground it just built (0066 permits sampling a compiled raster for a
    # measurement; every class it reports comes from the graph by id)
    "terrain_request_postconditions",
}

# What a re-derivation looks like in source. Kept deliberately literal.
PATTERNS = [
    re.compile(r"hydrology-pass1\.npz"),
    re.compile(r"water-pass1\.npz"),
    re.compile(r"hydro-flood\.png"),
    re.compile(r"hydro-salinity\.png"),
    re.compile(r"water-(surface|class|depth|shore)\.png"),
    # `water_salinity` / `waterSalinity` are NOT here: they are the compiled
    # class raster's B channel (site_fields.py, the compiled side), a
    # realisation of the graph, not a pre-graph classification.
    re.compile(r"\.(flood|tidal|salinity|wetlands|lakes|river_band)\b(?!\s*=\s*)"),
    re.compile(r"\[\s*[\"'](floodBand|tidal|salinity|riverBand|onLake|wetland)[\"']\s*\]"),
]


_DOCSTRING = re.compile(r'(\"\"\"|\'\'\')[\s\S]*?\1')


def _hits(path: Path) -> list[str]:
    """Code lines only: docstrings and comments may talk about the rasters."""
    out: list[str] = []
    text = path.read_text(encoding="utf-8")
    text = _DOCSTRING.sub(lambda m: "\n" * m.group(0).count("\n"), text)
    for n, line in enumerate(text.splitlines(), 1):
        s = line.strip()
        if s.startswith("#"):
            continue
        for pat in PATTERNS:
            if pat.search(line):
                out.append(f"{path.name}:{n}: {s[:90]}")
                break
    return out


def _modules() -> list[Path]:
    return sorted(p for p in PKG.glob("*.py")
                  if not p.name.startswith("test_") and p.stem not in EXEMPT
                  and p.stem != "__init__")


def test_below_the_gate_water_is_read_from_the_record():
    allow = json.loads(ALLOWLIST.read_text(encoding="utf-8"))["modules"]
    offenders: list[str] = []
    stale: list[str] = []
    for mod in _modules():
        hits = _hits(mod)
        listed = mod.stem in allow
        if hits and not listed:
            offenders.extend(hits)
        if listed and not hits:
            stale.append(mod.stem)
    assert not offenders, (
        "re-derivation below the gate (decision 0066): read water through the record "
        "reader, or list the module in record-reads-allowlist.json with its chunk:\n  "
        + "\n  ".join(offenders))
    assert not stale, (
        "record-reads-allowlist.json rows whose module is now clean — delete them: "
        + ", ".join(stale))


def test_allowlist_rows_name_a_chunk():
    doc = json.loads(ALLOWLIST.read_text(encoding="utf-8"))
    for name, row in doc["modules"].items():
        assert re.fullmatch(r"16[d-j]", row.get("portedBy", "")), f"{name}: portedBy must be a Phase 16 chunk"
        assert (PKG / f"{name}.py").exists(), f"{name}: no such module"
