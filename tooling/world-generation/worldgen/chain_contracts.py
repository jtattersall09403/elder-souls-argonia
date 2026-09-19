"""The chain's read contract: what every stage BELOW the freeze gate assumes
about the artefacts it opens, checked ONCE before any stage runs.

Why this exists. `scripts/terrain-chain.sh` stops at the first failing stage,
so a run that trips over an upstream/downstream mismatch shows exactly one
problem, is fixed, is re-run for ten minutes, and trips over the next one.
16e lost two full runs that way: `terrain_request_postconditions` bound the
compiled water to the wrong terrain array (after the natural/graded split the
water is compiled on `refined-height-natural-f32.npy`), and
`paint_route_overlays` assumed every station in `travel-services.json` carried
a `positionM`. Both are assumptions about a file, both are answerable in
milliseconds, and neither needs the stage to run.

So: every below-gate stage DECLARES the artefacts it reads and the fields it
indexes, `check()` validates them all and returns ONE list, and the chain runs
that list right after `verify_freeze`. The six rungs above the gate are exempt
— they are frozen and `verify_freeze` already checks them by hash.

THREE KINDS OF FINDING
  * a validator mismatch  — the artefact is missing, malformed, or missing the
    field a stage indexes. Fails the pass.
  * `declared read ... was not opened` — the declaration has gone stale
    against the stage's last stamped run. Fails the pass: a contract nobody
    exercises is a contract that stops being true.
  * `warn: ... opened ... but does not declare it` — the stamp saw a source or
    published JSON the declaration misses. Never fails; it is the prompt to
    extend the entry.

EXTENDING IT. Add one `READS[<stage>]` entry, a list of zero-argument
callables (build them with `functools.partial` over the validators below so
the declared paths can be read back off the partial). A stage that is enabled
and has no entry FAILS — silence is never a pass. A stage that opens a FAMILY
of files one at a time (`world/sources/blueprints/place.*.json`) declares it
with `glob_read(directory, pattern)`, which is satisfied when the pattern
matches and at least one match was opened on the last stamped run.

    python3 -m worldgen.chain_contracts --all
    python3 -m worldgen.chain_contracts --stages "compile_water reroute_lanes"
"""

from __future__ import annotations

import argparse
import functools
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Callable, Iterable

from .compile_chunks import HEIGHTFIELD_DIR, REPO_ROOT

VAULT = Path(HEIGHTFIELD_DIR)
VR = VAULT / "province-refined"
PROVINCE = Path(REPO_ROOT) / "apps" / "world-studio" / "public" / "province"
REFINED = PROVINCE / "refined"
WATER = PROVINCE / "water"
SOURCES = Path(REPO_ROOT) / "world" / "sources"
OUTPUT = Path(REPO_ROOT) / "tooling" / "world-generation" / "output"
KITS = Path(REPO_ROOT) / "tooling" / "asset-pipeline" / "output" / "kits"
PUBLIC_KITS = Path(REPO_ROOT) / "apps" / "world-studio" / "public" / "kits"

NATURAL = VR / "refined-height-natural-f32.npy"
CURRENT = VR / "refined-height-f32.npy"
FROZEN = VR / "refined-height-frozen-f32.npy"
FOOTPRINT = VR / "chain-footprint.json"

#: The six rungs `verify_freeze` checks by hash; they declare nothing here.
ABOVE_GATE = ("sculpt_province", "compile_hydrology", "compile_society",
              "shape_province", "hydrology_graph", "carve_province")

#: Below the gate, but never run by a routine chain: the water is compiled
#: ONCE (0057 §1, decision 0070), so `compile_water` is skipped like the
#: frozen rungs and the order gate does not judge its reads.
NEVER_RUN = ("compile_water",)

Check = Callable[[], list[str]]


def _short(path: Path) -> str:
    """The artefact as a reader recognises it: repo-relative, or vault/... ."""
    p = Path(path)
    try:
        return str(p.relative_to(REPO_ROOT))
    except ValueError:
        pass
    try:
        return "vault/" + str(p.relative_to(VAULT))
    except ValueError:
        return str(p)


def _msg(stage: str, path: Path, text: str) -> str:
    head = f"{stage}: " if stage else ""
    return f"{head}{_short(path)}: {text}"


# --------------------------------------------------------------- validators
# Each returns a list of mismatch strings and NEVER raises: a validator that
# blew up would hide every finding after it.

def exists(path: Path, *, stage: str = "") -> list[str]:
    """The artefact (file or whole directory family) is there at all."""
    p = Path(path)
    if not p.exists():
        kind = "directory" if p.suffix == "" else "file"
        return [_msg(stage, p, f"missing ({kind} does not exist)")]
    return []


def _load_json(path: Path, stage: str) -> tuple[dict | list | None, list[str]]:
    p = Path(path)
    if not p.exists():
        return None, [_msg(stage, p, "missing")]
    try:
        return json.loads(p.read_text(encoding="utf-8")), []
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        return None, [_msg(stage, p, f"unreadable JSON ({error.__class__.__name__}: {error})")]


def json_doc(path: Path, required: Iterable[str] = (), schema_version=None,
             *, stage: str = "") -> list[str]:
    """A JSON document has its top-level keys, and the schemaVersion the
    reader was written against."""
    doc, bad = _load_json(path, stage)
    if bad:
        return bad
    if not isinstance(doc, dict):
        return [_msg(stage, path, f"expected a JSON object, found {type(doc).__name__}")]
    out = []
    missing = [k for k in required if k not in doc]
    if missing:
        out.append(_msg(stage, path, f"missing top-level field(s): {', '.join(missing)}"))
    if schema_version is not None:
        have = doc.get("schemaVersion")
        if have != schema_version:
            out.append(_msg(stage, path,
                            f"schemaVersion is {have!r}, the stage reads {schema_version!r}"))
    return out


def json_items(path: Path, items_key: str, required: Iterable[str] = (),
               *, stage: str = "") -> list[str]:
    """Every element of a list (or every value of a dict) under `items_key`
    carries the fields the stage indexes. Names the first five offenders."""
    doc, bad = _load_json(path, stage)
    if bad:
        return bad
    if not isinstance(doc, dict) or items_key not in doc:
        return [_msg(stage, path, f"missing top-level field(s): {items_key}")]
    items = doc[items_key]
    if isinstance(items, dict):
        pairs = list(items.items())
    elif isinstance(items, list):
        pairs = [(str(i), v) for i, v in enumerate(items)]
    else:
        return [_msg(stage, path,
                     f"{items_key} is {type(items).__name__}, expected a list or an object")]
    out = []
    for field in required:
        bad_ids = [(row.get("id") or key) if isinstance(row, dict) else key
                   for key, row in pairs
                   if not isinstance(row, dict) or row.get(field) in (None, "")]
        if bad_ids:
            shown = ", ".join(str(b) for b in bad_ids[:5])
            more = f" (+{len(bad_ids) - 5} more)" if len(bad_ids) > 5 else ""
            out.append(_msg(stage, path,
                            f"{len(bad_ids)} of {len(pairs)} {items_key} have no {field!r}: "
                            f"{shown}{more}"))
    return out


def npy(path: Path, ndim: int = 2, dtype: str | None = None, square: bool = False,
        *, stage: str = "") -> list[str]:
    """A .npy array's shape and dtype, read from the header (mmap, no load)."""
    p = Path(path)
    if not p.exists():
        return [_msg(stage, p, "missing")]
    try:
        import numpy as np
        arr = np.load(p, mmap_mode="r")
    except Exception as error:                     # noqa: BLE001 — report, never raise
        return [_msg(stage, p, f"unreadable .npy ({error.__class__.__name__}: {error})")]
    out = []
    if arr.ndim != ndim:
        out.append(_msg(stage, p, f"ndim is {arr.ndim}, the stage reads {ndim}"))
    if dtype is not None and arr.dtype != dtype:
        out.append(_msg(stage, p, f"dtype is {arr.dtype}, the stage reads {dtype}"))
    if square and arr.ndim >= 2 and arr.shape[0] != arr.shape[1]:
        out.append(_msg(stage, p, f"shape {arr.shape} is not square"))
    return out


def npz(path: Path, keys: Iterable[str] = (), *, stage: str = "") -> list[str]:
    """A .npz archive carries the arrays the stage names."""
    p = Path(path)
    if not p.exists():
        return [_msg(stage, p, "missing")]
    try:
        import numpy as np
        with np.load(p) as archive:
            have = set(archive.files)
    except Exception as error:                     # noqa: BLE001
        return [_msg(stage, p, f"unreadable .npz ({error.__class__.__name__}: {error})")]
    missing = [k for k in keys if k not in have]
    if missing:
        return [_msg(stage, p, f"missing array(s): {', '.join(missing)}")]
    return []


def png(path: Path, size: tuple[int, int] | None = None, mode: str | None = None,
        *, stage: str = "") -> list[str]:
    """A PNG's size and mode, from the header (no decode)."""
    p = Path(path)
    if not p.exists():
        return [_msg(stage, p, "missing")]
    try:
        from PIL import Image
        with Image.open(p) as im:
            have_size, have_mode = im.size, im.mode
    except Exception as error:                     # noqa: BLE001
        return [_msg(stage, p, f"unreadable PNG ({error.__class__.__name__}: {error})")]
    out = []
    if size is not None and tuple(have_size) != tuple(size):
        out.append(_msg(stage, p, f"size is {have_size}, the stage reads {tuple(size)}"))
    if mode is not None and have_mode != mode:
        out.append(_msg(stage, p, f"mode is {have_mode}, the stage reads {mode}"))
    return out


def _dotted(doc, field: str):
    cur = doc
    for part in field.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur[part]
    return cur


def _array_digest(path: Path) -> str:
    import numpy as np
    arr = np.load(path).astype("float32")
    return hashlib.sha256(np.ascontiguousarray(arr).tobytes()).hexdigest()


def _file_digest(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def sha_binding(json_path: Path, field: str, target: Path, digest: str = "array",
                *, stage: str = "") -> list[str]:
    """A JSON document's dotted `field` is the sha256 of `target` — the binding
    that says "this artefact was made from THAT ground".

    `digest="array"` hashes the .npy's float32 CONTENT (what the water
    compiler and `freeze.json` record, so that a re-written but identical
    array still matches); `digest="file"` hashes the bytes on disk.
    """
    doc, bad = _load_json(json_path, stage)
    if bad:
        return bad
    have = _dotted(doc, field)
    if have is None:
        return [_msg(stage, json_path, f"missing field {field!r} (the binding to {_short(target)})")]
    t = Path(target)
    if not t.exists():
        return [_msg(stage, t, f"missing (bound by {_short(json_path)}:{field})")]
    try:
        want = _array_digest(t) if digest == "array" else _file_digest(t)
    except Exception as error:                     # noqa: BLE001
        return [_msg(stage, t, f"unreadable ({error.__class__.__name__}: {error})")]
    if str(have) != want:
        return [_msg(stage, json_path,
                     f"{field} is {str(have)[:12]}… but {_short(t)} is {want[:12]}… — "
                     f"the artefact was made from a different array")]
    return []


# ------------------------------------------------------------------- READS
# One entry per stage below the freeze gate in scripts/terrain-chain.sh's
# STAGES. Derived from the stage's last stamped run (the files it was OBSERVED
# opening) plus the fields the module indexes. Per-chunk families (chunk PNG /
# .npy/.bin) and kit GLBs are declared as `exists` on their directory.

P = functools.partial


def declared_paths(entry: Check) -> list[Path]:
    """The artefacts a declaration names — read back off the partial, so a
    declaration cannot say one thing and check another."""
    out: list[Path] = []
    args = list(getattr(entry, "args", ())) + list(getattr(entry, "keywords", {}).values())
    for value in args:
        if isinstance(value, Path):
            out.append(value)
    return out


class stale_ok:
    """The ONE escape hatch from the order gate: this read is knowingly of the
    previous publication, with the reason written down. It demotes the order
    finding to a `warn:` line and changes nothing else."""

    def __init__(self, check: Check, *, reason: str) -> None:
        self.check = check
        self.reason = reason

    @property
    def args(self):
        return getattr(self.check, "args", ())

    @property
    def keywords(self):
        return getattr(self.check, "keywords", {})

    def __call__(self, **kwargs) -> list[str]:
        return self.check(**kwargs)


class glob_read:
    """A read of a FAMILY of files by pattern, not one document.

    Some stages open `world/sources/blueprints/place.*.json` — one file per
    place — and never open the published `province/blueprints.json` at all. A
    declaration must say what the stage actually opens, so it names the
    directory and the pattern. The declaration is satisfied when the pattern
    matches at least one file AND at least one matching file was opened on the
    stage's last stamped run; each match is validated by `check` where one is
    given. It contributes no single path to the order gate — the directory
    `exists` declaration beside it carries that.
    """

    def __init__(self, directory: Path, pattern: str, check: Check | None = None) -> None:
        self.directory = Path(directory)
        self.pattern = pattern
        self.check = check

    @property
    def args(self):
        return ()

    @property
    def keywords(self):
        return {}

    def matches(self) -> list[Path]:
        return sorted(self.directory.glob(self.pattern))

    def __call__(self, *, stage: str = "") -> list[str]:
        hits = self.matches()
        if not hits:
            return [_msg(stage, self.directory / self.pattern, "matches no file")]
        out: list[str] = []
        if self.check is not None:
            for p in hits:
                out.extend(self.check(p, stage=stage))
        return out


def _survey(exclude: tuple[Path, ...] = ()) -> list[Check]:
    """`site_fields.ProvinceSurvey` — the shared reader every siting and
    routing stage builds first. It reads the NATURAL snapshots where they
    exist (so siting cannot feed grading back into the plot)."""
    entries = [
        P(json_doc, PROVINCE / "hydrology-meta.json", ("metresPerPixel", "imageWidth")),
        P(json_doc, PROVINCE / "society-meta.json", ("waterRoutes",)),
        P(json_doc, REFINED / "meta.json", ("imageWidth", "metresPerPixel", "extentKm")),
        P(json_doc, WATER / "water-meta.json", ("klass", "season", "surface"), 3),
        P(png, PROVINCE / "hydro-soil.png"),
        P(png, PROVINCE / "soc-danger.png"),
        P(png, PROVINCE / "soc-cultures.png"),
        P(png, PROVINCE / "climate-air.png"),
        P(png, PROVINCE / "climate-weather.png"),
        P(png, PROVINCE / "climate-vis.png"),
        P(png, WATER / "water-surface.png"),
        P(png, WATER / "water-class.png"),
        P(png, WATER / "water-shore.png"),
        P(json_doc, SOURCES / "anchors" / "settlement-anchors.json", ("anchors",)),
        P(json_items, PROVINCE / "routes-natural.json", "routes", ("px", "from", "to")),
        P(json_doc, PROVINCE / "waterways-natural.json", ("lanes",)),
    ]
    if not exclude:
        return entries
    drop = {str(Path(p).resolve()) for p in exclude}
    return [e for e in entries
            if not any(str(Path(d).resolve()) in drop for d in declared_paths(e))]


def _graph_arrays() -> list[Check]:
    return [
        P(json_doc, SOURCES / "hydrology" / "hydrology-graph.json",
          ("reaches", "bodies", "rivers", "grid", "contentSha256"), 1),
        P(npz, VAULT / "hydrology-graph-solution.npz"),
        P(npz, VAULT / "hydrology-graph-bodies.npz"),
    ]


READS: dict[str, list[Check]] = {
    "apply_terrain_patches": [
        P(npy, FROZEN, 2, "float32", True),
        P(json_doc, SOURCES / "terrain" / "freeze.json", ("frozen",), 1),
        P(json_items, SOURCES / "terrain" / "terrain-patches.json", "patches", ("id", "kind")),
        P(npz, VAULT / "hydrology-pass1.npz", ("sink", "flow_to", "sea")),
        P(json_doc, VAULT / "shape-meta.json"),
        P(json_doc, VR / "carve-meta.json"),
        stale_ok(P(json_doc, PROVINCE / "route-structures.json"),
                 reason="16b/16e feedback edge: the structure windows of the previous run; "
                        "16h turns pads and windows into patches"),
        *_graph_arrays(),
    ],
    "patch_water": [
        P(npy, FROZEN, 2, "float32", True),
        P(npy, NATURAL, 2, "float32", True),
        P(json_doc, VR / "terrain-patches-applied.json"),
        *_graph_arrays(),
    ],
    "compile_water": [
        P(npy, CURRENT, 2, "float32", True),
        P(npz, VAULT / "hydrology-pass1.npz", ("sink", "flow_to", "accum_km2")),
        P(npz, VR / "channels-pass1.npz", ("x", "y", "reach")),
        P(json_items, PROVINCE / "routes.json", "routes", ("px",)),
        P(json_doc, PROVINCE / "routes-minor.json", ("tracks",), 1),
    ],
    "reroute_lanes": [
        P(npy, CURRENT, 2, "float32", True),
        P(json_doc, PROVINCE / "waterways.json", ("lanes",)),
        P(json_doc, WATER / "water-meta.json", ("klass", "surface", "season"), 3),
        P(png, WATER / "water-surface.png"),
        P(png, WATER / "water-class.png"),
        P(png, WATER / "water-id.png"),
        P(png, WATER / "water-owner.png"),
        P(png, WATER / "water-flow.png"),
        P(png, WATER / "water-shore.png"),
    ],
    "solve_major_routes": [
        *_survey(exclude=(REFINED / "meta.json",)),
        stale_ok(P(json_doc, REFINED / "meta.json", ("imageWidth", "metresPerPixel", "extentKm")),
                 reason="16e feedback edge: grade_routes rewrites the refined meta later in the "
                        "same run; the solve reads the previous run's accepted grid"),
        stale_ok(P(json_items, SOURCES / "routes" / "registry.json", "routes",
                   ("id", "from", "to")),
                 reason="16e feedback edge: compile_minor_waterways back-fills the water routes' "
                        "geometryId later in the same run; the road solve reads the previous "
                        "run's accepted registry"),
        P(json_doc, SOURCES / "routes" / "junctions.json", ("junctions",), 2),
        P(json_doc, SOURCES / "anchors" / "settlement-anchors.json", ("anchors",)),
    ],
    "grade_routes": [
        P(npy, NATURAL, 2, "float32", True),
        P(json_items, PROVINCE / "routes.json", "routes", ("px", "id")),
        stale_ok(P(json_doc, PROVINCE / "routes-minor.json", ("tracks",), 1),
                 reason="16e feedback edge: the minor tracks of the previous run (they are never "
                        "graded); compile_minor_routes re-solves them later in the same run"),
        stale_ok(P(json_doc, SOURCES / "routes" / "route-structures.json", ("structures",), 1),
                 reason="16e feedback edge: author_route_structures re-authors the structures "
                        "later in the same run; the grading reads the previous run's accepted set"),
    ],
    "apply_route_patches": [
        P(npy, NATURAL, 2, "float32", True),
        P(json_doc, VR / "terrain-patches-applied.json"),
        P(json_items, SOURCES / "terrain" / "route-grade-patches.json", "patches", ("id", "kind")),
    ],
    "patch_water_graded": [
        P(npy, NATURAL, 2, "float32", True),
        P(npy, CURRENT, 2, "float32", True),
        P(json_doc, VR / "route-grade-applied.json"),
        *_graph_arrays(),
    ],
    "derive_crossings": [
        P(npy, CURRENT, 2, "float32", True),
        P(json_items, PROVINCE / "routes.json", "routes", ("px", "id")),
        P(json_doc, WATER / "water-meta.json", ("klass", "surface"), 3),
        P(png, WATER / "water-surface.png"),
        P(png, WATER / "water-class.png"),
        P(png, WATER / "water-id.png"),
        P(png, WATER / "water-owner.png"),
        P(png, WATER / "water-flow.png"),
        P(png, WATER / "water-shore.png"),
        stale_ok(P(exists, SOURCES / "catalogue"),
                 reason="16e reads place ids only; the positions it uses come from the same "
                        "run's routes, not from the plot 16g re-solves later"),
        P(json_doc, SOURCES / "hydrology" / "hydrology-graph.json", ("reaches", "bodies"), 1),
    ],
    "author_route_structures": [
        P(npy, CURRENT, 2, "float32", True),
        P(json_items, PROVINCE / "routes.json", "routes", ("px", "id")),
        P(json_doc, OUTPUT / "route-grading-stretches.json"),
        P(json_doc, SOURCES / "routes" / "water-crossings.json", ("crossings",), 2),
        stale_ok(P(json_items, SOURCES / "routes" / "travel-services.json", "stations",
                   ("id", "kind")),
                 reason="16e feedback edge: the landings of the previous run; travel_services "
                        "re-solves the stations later in the same run"),
    ],
    "compile_route_structures": [
        P(npy, CURRENT, 2, "float32", True),
        P(json_items, PROVINCE / "routes.json", "routes", ("px", "id")),
        P(json_doc, SOURCES / "routes" / "route-structures.json", ("structures",), 1),
        P(json_doc, OUTPUT / "route-grading-stretches.json"),
        P(json_doc, KITS / "route-structures-v1.kit.json"),
        P(json_doc, KITS / "route-spans-v1.kit.json"),
    ],
    # `travel_services.py` reads the registry, the crossings, the catalogue, the
    # compiled water and — since 16g deliverable 6 — the published waterways:
    # a station-run hop is pathed over the major lanes PLUS the minor channels
    # `compile_minor_waterways` solves earlier on the same chain row. The code
    # treats the minor file as optional (a run before that stage paths over the
    # majors alone); there is no optional validator here, so it is declared as
    # the chain actually produces it.
    "travel_services": [
        P(json_items, PROVINCE / "waterways.json", "lanes", ("id",)),
        P(json_doc, PROVINCE / "waterways-minor.json", ("channels",), 3),
        P(npy, CURRENT, 2, "float32", True),
        P(json_doc, SOURCES / "hydrology" / "hydrology-graph.json", ("reaches", "bodies"), 1),
        P(json_doc, SOURCES / "routes" / "water-crossings.json", ("crossings",), 2),
        P(json_items, SOURCES / "routes" / "registry.json", "routes", ("id",)),
        P(exists, SOURCES / "catalogue"),
        P(json_doc, WATER / "water-meta.json", ("klass", "surface"), 3),
        P(png, WATER / "water-surface.png"),
        P(png, WATER / "water-class.png"),
        P(png, WATER / "water-id.png"),
        P(png, WATER / "water-owner.png"),
        P(png, WATER / "water-flow.png"),
        P(png, WATER / "water-shore.png"),
    ],
    # 16g: the plot is re-solved on the frozen world BELOW everything that
    # dresses it. `apply_sitings --stage` does the write-back only; macro_plot
    # re-solves; the minor networks, the services and the exports follow.
    "apply_sitings": [
        P(exists, SOURCES / "blueprints"),
        P(json_doc, PROVINCE / "blueprints.json", ("blueprints",), 2),
        P(exists, SOURCES / "catalogue"),
        P(exists, SOURCES / "sites" / "macro-plot-overrides.json"),
    ],
    "macro_plot": [
        *_survey(),
        P(exists, SOURCES / "catalogue"),
        P(json_doc, SOURCES / "catalogue" / "type-recipes.json"),
        P(json_doc, SOURCES / "sites" / "candidate-sites.json"),
        P(exists, SOURCES / "sites" / "macro-plot-overrides.json"),
        P(json_items, PROVINCE / "routes.json", "routes", ("px",)),
    ],
    "export_places": [
        P(exists, SOURCES / "catalogue"),
        P(json_doc, SOURCES / "registries" / "quests.json"),
        P(json_doc, SOURCES / "quests" / "lines.json"),
    ],
    "compile_minor_routes": [
        *_survey(),
        P(json_items, PROVINCE / "routes.json", "routes", ("px",)),
        P(json_doc, PROVINCE / "waterways.json", ("lanes",)),
        # The stage reads the AUTHORED blueprints, one file per place, never
        # the published `province/blueprints.json`.
        glob_read(SOURCES / "blueprints", "place.*.json"),
        P(exists, SOURCES / "blueprints"),
        P(exists, SOURCES / "catalogue"),
        P(json_items, SOURCES / "routes" / "authored-routes.json", "routes", ("id",)),
    ],
    "compile_minor_waterways": [
        *_survey(),
        P(json_items, SOURCES / "routes" / "registry.json", "routes", ("id",)),
        # `blueprint_docks()` opens the authored blueprint of each place it
        # solves a dock for, not the published bundle.
        glob_read(SOURCES / "blueprints", "place.*.json"),
        P(exists, SOURCES / "blueprints"),
        P(exists, SOURCES / "catalogue"),
    ],
    "grade_settlement_pads": [
        P(npy, CURRENT, 2, "float32", True),
        P(exists, SOURCES / "blueprints"),
    ],
    "compile_chunks": [
        P(npy, CURRENT, 2, "float32", True),
        P(json_doc, REFINED / "meta.json", ("imageWidth", "metresPerPixel")),
        P(json_doc, FOOTPRINT, ("gridShape",)),
        P(exists, VR / "chunks"),
    ],
    "export_web_chunks": [
        P(npy, CURRENT, 2, "float32", True),
        P(json_doc, VR / "chunks" / "chunks-manifest.json"),
        P(exists, VR / "chunks"),
    ],
    # The 16e trap: the compiled water is bound to the ground it was compiled
    # on, and after the natural/graded split that is the NATURAL array.
    "terrain_request_postconditions": [
        P(sha_binding, WATER / "water-meta.json", "sourceHeightSha256", NATURAL, "array"),
        P(npy, NATURAL, 2, "float32", True),
        P(npy, CURRENT, 2, "float32", True),
        P(npz, VAULT / "water-pass1.npz", ("w_full", "wet_full", "body_levels")),
        P(json_items, REFINED / "terrain-request-plan.json", "requests", ("id",)),
        P(json_doc, REFINED / "terrain-request-fulfillments.json"),
        P(json_doc, SOURCES / "terrain" / "terrain-request-known-red.json"),
    ],
    "rebake_landcover": [
        P(npy, CURRENT, 2, "float32", True),
        # 16f ported the bake to the signed record (0070): it reads the graph
        # and the route registry's condition, never the pass-1 rasters.
        P(json_doc, SOURCES / "hydrology" / "hydrology-graph.json", ("reaches", "bodies"), 1),
        stale_ok(P(json_items, SOURCES / "routes" / "registry.json", "routes", ("id",)),
                 reason="the bake and the scatter read the major roads 16e published; the minor "
                        "tracks are applied afterwards as a clearance patch, decision 0070"),
        stale_ok(P(json_items, PROVINCE / "routes.json", "routes", ("px",)),
                 reason="the bake and the scatter read the major roads 16e published; the minor "
                        "tracks are applied afterwards as a clearance patch, decision 0070"),
        P(json_doc, SOURCES / "routes" / "route-structures.json", ("structures",), 1),
    ],
    "export_routes": [
        P(json_items, SOURCES / "routes" / "registry.json", "routes", ("id", "from", "to")),
        P(json_doc, PROVINCE / "routes-minor.json", ("tracks",), 1),
        P(json_doc, VR / "route-grade-applied.json"),
        P(json_doc, SOURCES / "terrain" / "route-grade-patches.json", ("patches",), 1),
        P(json_doc, SOURCES / "routes" / "water-crossings.json", ("crossings",), 2),
        P(json_items, SOURCES / "routes" / "travel-services.json", "stations", ("id", "kind")),
    ],
    # The other 16e trap: the overlay painter indexes every station's
    # `positionM`. A station sited by a later chunk has none yet.
    "paint_route_overlays": [
        P(json_items, PROVINCE / "routes.json", "routes", ("px",)),
        P(json_doc, PROVINCE / "waterways.json", ("lanes",)),
        # `paint_route_overlays` reads the SOURCE register, not the published
        # copy. It draws every station that HAS a `positionM` and skips the
        # ones a later chunk sites (16g's deferred stations carry null), so
        # the contract is the id and the kind; a null siting is not a defect
        # of the file, and requiring it here stopped every run (2026-09-16).
        P(json_items, SOURCES / "routes" / "travel-services.json", "stations",
          ("id", "kind")),
    ],
    "build_border_apron": [
        P(npy, CURRENT, 2, "float32", True),
        P(npy, VR / "apron-source-near.npy"),
        P(npz, VR / "apron-source-far.npz"),
        P(json_doc, VR / "apron-source.json"),
        P(png, PROVINCE / "hydro-regions.png"),
        P(png, REFINED / "ground-control.png"),
        P(png, REFINED / "ground-tint.png"),
        P(exists, PROVINCE / "chunks"),
    ],
    "rederive_blueprints": [
        P(exists, SOURCES / "blueprints"),
        stale_ok(P(json_doc, PROVINCE / "places.json", ("places",), 2),
                 reason="16h owns the settlement stages and their reads; export_places "
                        "republishes the plot later in the same run"),
    ],
    "compile_settlement": [
        P(exists, SOURCES / "blueprints"),
        P(exists, KITS),
        P(json_doc, SOURCES / "flora" / "palettes.json", ("byRegionClass",), 3),
        P(npy, CURRENT, 2, "float32", True),
    ],
    "export_settlement_bundle": [
        P(exists, SOURCES / "blueprints"),
        P(exists, KITS),
        P(exists, PUBLIC_KITS),
        P(json_doc, SOURCES / "routes" / "route-structures.json", ("structures",), 1),
        P(npy, CURRENT, 2, "float32", True),
    ],
    "settlement_ground_control": [
        P(json_doc, PROVINCE / "settlements.json", ("compiledObjects", "groundTreatments"), 1),
        P(png, REFINED / "ground-control.png"),
        P(png, WATER / "water-surface.png"),
        P(json_doc, WATER / "water-meta.json", ("surface",), 3),
    ],
    "compile_scatter": [
        P(json_doc, REFINED / "meta.json", ("imageWidth", "metresPerPixel")),
        P(json_doc, WATER / "water-meta.json", ("surface",), 3),
        P(json_doc, PROVINCE / "hydrology-meta.json", ("metresPerPixel", "imageWidth")),
        P(png, REFINED / "height-rg.png"),
        P(png, REFINED / "ground-control.png"),
        P(png, WATER / "water-surface.png"),
        P(png, PROVINCE / "hydro-regions.png"),
        P(json_doc, PUBLIC_KITS / "flora-province-v1.kit.json"),
        P(json_doc, SOURCES / "flora" / "palettes.json", ("byRegionClass",), 3),
        P(json_doc, SOURCES / "placement" / "composition-rules.json", ("species",)),
        stale_ok(P(json_items, PROVINCE / "routes.json", "routes", ("px",)),
                 reason="the bake and the scatter read the major roads 16e published; the minor "
                        "tracks are applied afterwards as a clearance patch, decision 0070"),
        P(json_doc, FOOTPRINT, ("gridShape",)),
        # 16f: the scatter reads the record and the mined rules, never the
        # settlements or the minor tracks (those clear through patches)
        P(json_doc, SOURCES / "flora" / "dressing-zones.json", ("zones",), 1),
        P(json_doc, SOURCES / "hydrology" / "hydrology-graph.json", ("reaches", "bodies", "vocabulary")),
        P(json_doc, SOURCES / "placement" / "vanilla-tamriel-placement.json"),
        stale_ok(P(json_doc, SOURCES / "routes" / "registry.json", ("routes",)),
                 reason="the scatter reads the major roads 16e published; what 16g re-publishes on "
                        "the registry reaches the scatter as a clearance patch, decision 0070"),
    ],
    "apply_vegetation_patches": [
        P(json_items, SOURCES / "flora" / "vegetation-patches.json", "patches", ("id", "kind")),
        P(exists, PROVINCE / "vegetation"),
    ],
    # 16f: the water dressing reads the record (ids, kinds, seasons) and the
    # scatter output; it writes sidecars only, never a water compile output.
    "compile_water_dressing": [
        P(json_doc, WATER / "water-meta.json", ("schemaVersion", "entities", "surface", "season"), 3),
        P(png, WATER / "water-id.png"),
        P(json_doc, PROVINCE / "vegetation" / "vegetation-index.json", ("speciesOrder", "chunks")),
        P(json_doc, SOURCES / "flora" / "palettes.json", ("byRegionClass",)),
        P(exists, PROVINCE.parent / "kits" / "flora-province-v1.kit.json"),
    ],
}


# ------------------------------------------------------------------ WRITES
# What each below-gate stage PUBLISHES: the source and province JSON a later
# reader binds to (rasters, vault scratch and per-chunk/per-region raster
# families are out of scope). This is what THE ORDER GATE below reads: a stage
# that reads an artefact a LATER stage rewrites is reading the previous run's
# world, and the chain cannot fix it by re-running one stage.

WRITES: dict[str, list[Path]] = {
    "apply_terrain_patches": [PROVINCE / "meta.json", REFINED / "meta.json",
                              REFINED / "flood-states.json"],
    "patch_water": [],
    "compile_water": [WATER / "water-meta.json"],
    "reroute_lanes": [PROVINCE / "waterways.json", PROVINCE / "waterways-repaired-lanes.json"],
    "solve_major_routes": [PROVINCE / "routes.json", PROVINCE / "routes-natural.json"],
    "grade_routes": [SOURCES / "routes" / "route-structures.json",
                     SOURCES / "terrain" / "route-grade-patches.json", REFINED / "meta.json"],
    "apply_route_patches": [],
    "patch_water_graded": [],
    "derive_crossings": [SOURCES / "routes" / "water-crossings.json"],
    "author_route_structures": [SOURCES / "routes" / "route-structures.json"],
    "compile_route_structures": [PROVINCE / "route-structures.json"],
    "grade_settlement_pads": [],
    "compile_chunks": [],
    "export_web_chunks": [],
    "rebake_landcover": [REFINED / "ground-paint-provenance.json"],
    "build_border_apron": [],
    "rederive_blueprints": [],
    "compile_settlement": [],
    "export_settlement_bundle": [PROVINCE / "settlements.json"],
    "settlement_ground_control": [],
    "compile_scatter": [PROVINCE / "vegetation" / "vegetation-index.json",
                        WATER / "bed-rocks.json"],
    "compile_water_dressing": [],
    # 16g
    "apply_sitings": [SOURCES / "sites" / "macro-plot-overrides.json", SOURCES / "catalogue"],
    "macro_plot": [SOURCES / "sites" / "macro-plot.json", SOURCES / "catalogue"],
    # --registry attaches geometryId / solved:true to the registry rows, and
    # the stage authors the minor tracks' clearance patches.
    "compile_minor_routes": [PROVINCE / "routes-minor.json",
                             SOURCES / "flora" / "vegetation-patches.json",
                             SOURCES / "routes" / "registry.json"],
    "compile_minor_waterways": [PROVINCE / "waterways-minor.json",
                                PROVINCE / "waterways-minor-natural.json",
                                PROVINCE / "waterways-minor-repaired-by.json",
                                SOURCES / "routes" / "registry.json"],
    "travel_services": [SOURCES / "routes" / "travel-services.json"],
    "export_places": [PROVINCE / "places.json"],
    "export_routes": [PROVINCE / "routes-index.json", PROVINCE / "route-grades.json",
                      PROVINCE / "crossings.json", PROVINCE / "travel-services.json"],
    "paint_route_overlays": [],
    "apply_vegetation_patches": [],
    "terrain_request_postconditions": [],
}


def order_findings(stages: list[str]) -> list[str]:
    """Every read of an artefact a LATER stage in the same run rewrites.

    Two stages of the rule never fire, because neither is a stale read:
      * a stage that reads a path it also declares in its own WRITES is doing
        read-modify-write (apply_sitings edits the catalogue it reads);
      * a stage a routine run never executes (the frozen rungs, and
        `compile_water`, which is compiled once — 0057 §1) cannot read this
        run's anything.
    """
    order = {s: i for i, s in enumerate(script_stages())}
    out: list[str] = []
    stages = [s for s in stages if s not in ABOVE_GATE and s not in NEVER_RUN]
    writers: dict[str, list[str]] = {}
    for stage in stages:
        for path in WRITES.get(stage, []):
            writers.setdefault(str(Path(path).resolve()), []).append(stage)
    for stage in stages:
        here = order.get(stage, 10_000)
        own = {str(Path(p).resolve()) for p in WRITES.get(stage, [])}
        for entry in READS.get(stage) or []:
            for path in declared_paths(entry):
                key = str(Path(path).resolve())
                if key in own:
                    continue                       # read-modify-write
                for writer in writers.get(key, []):
                    if order.get(writer, 10_000) <= here:
                        continue
                    line = f"order: {stage} reads {_short(Path(path))} which {writer} writes later"
                    if isinstance(entry, stale_ok):
                        out.append(f"warn: {line} — {entry.reason}")
                    else:
                        out.append(line)
    return out


# ------------------------------------------------------------------- check

def _stage_names_from_script(text: str) -> list[str]:
    block = re.search(r"\nSTAGES=\(\n(.*?)\n\)\n", text, re.S)
    if not block:
        return []
    return re.findall(r'^\s*"([a-z_]+)"\s*$', block.group(1), re.M)


def script_stages(path: Path | None = None) -> list[str]:
    path = path or Path(__file__).resolve().parents[1] / "scripts" / "terrain-chain.sh"
    return _stage_names_from_script(path.read_text(encoding="utf-8"))


def ladder_rows(path: Path | None = None) -> dict[str, str]:
    """{stage: the chunk whose LADDER row owns it}, read from the script."""
    path = path or Path(__file__).resolve().parents[1] / "scripts" / "terrain-chain.sh"
    text = path.read_text(encoding="utf-8")
    block = re.search(r"\ndeclare -A LADDER=\(\n(.*?)\n\)\n", text, re.S)
    out: dict[str, str] = {}
    if not block:
        return out
    for chunk, names in re.findall(r'^\s*\[([0-9a-z]+)\]="([^"]*)"', block.group(1), re.M):
        for stage in names.split():
            out[stage] = chunk
    return out


def delivered_through(path: Path | None = None) -> str:
    """`DELIVERED_THROUGH` — the highest chunk a plain run builds."""
    path = path or Path(__file__).resolve().parents[1] / "scripts" / "terrain-chain.sh"
    found = re.search(r'^DELIVERED_THROUGH="([^"]+)"', path.read_text(encoding="utf-8"), re.M)
    return found.group(1) if found else ""


def delivered_stages(stages: list[str] | None = None, *, rows: dict[str, str] | None = None,
                     delivered: str | None = None) -> list[str]:
    """The stages a plain run may execute: below the gate, never-run excluded,
    and owned by a ladder row at or before DELIVERED_THROUGH."""
    from .ladder import LADDER_ORDER
    stages = list(stages if stages is not None else script_stages())
    rows = ladder_rows() if rows is None else rows
    delivered = delivered_through() if delivered is None else delivered
    limit = LADDER_ORDER.index(delivered) if delivered in LADDER_ORDER else len(LADDER_ORDER) - 1
    out = []
    for stage in stages:
        if stage in ABOVE_GATE or stage in NEVER_RUN:
            continue
        chunk = rows.get(stage)
        if chunk in LADDER_ORDER and LADDER_ORDER.index(chunk) <= limit:
            out.append(stage)
    return out


def _keys(paths: Iterable[Path]) -> set[str]:
    return {str(Path(p).resolve()) for p in paths}


def cascade_from(ran: Iterable[str], *, stages: list[str] | None = None,
                 reads: dict[str, list[Check]] | None = None,
                 writes: dict[str, list[Path]] | None = None,
                 rows: dict[str, str] | None = None,
                 delivered: str | None = None) -> list[str]:
    """STALENESS, not position: the stages that must run because something
    that ran rewrote an artefact they read.

    The transitive closure over READS x WRITES, restricted to stages a plain
    run may execute (below the gate, delivered chunk, not `compile_water`) and
    minus the ones already run, returned in STAGES order. This is what replaces
    hand-moving a consumer below its producer's row.
    """
    stages = list(stages if stages is not None else script_stages())
    reads = READS if reads is None else reads
    writes = WRITES if writes is None else writes
    eligible = set(delivered_stages(stages, rows=rows, delivered=delivered))
    ran = list(ran)
    done = set(ran)
    picked: list[str] = []
    frontier: set[str] = set()
    for stage in ran:
        frontier |= _keys(writes.get(stage, []))
    while frontier:
        added = []
        for stage in stages:
            if stage in done or stage not in eligible:
                continue
            # A `stale_ok` read is DECLARED to be of the previous
            # publication, with the reason written down: it is the chain's
            # admitted feedback edge and following it would cascade the whole
            # chain off any stage at all.
            got = _keys(p for entry in (reads.get(stage) or [])
                        if not isinstance(entry, stale_ok)
                        for p in declared_paths(entry))
            got -= _keys(writes.get(stage, []))     # read-modify-write, as the order gate has it
            if got & frontier:
                added.append(stage)
        if not added:
            break
        picked.extend(added)
        done |= set(added)
        frontier = set()
        for stage in added:
            frontier |= _keys(writes.get(stage, []))
    chosen = set(picked)
    return [s for s in stages if s in chosen]


def _stamps() -> dict:
    from . import chain_stages
    try:
        return json.loads(Path(chain_stages.STAMPS).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _stamp_for(book: dict, stage: str, stages: list[str] | None = None) -> dict | None:
    """The stage's stamp AT ITS CURRENT POSITION in the script — the key the
    next run will use. A stage that has moved (or has never run there) has no
    stamp, and the declared-not-opened check simply does not apply to it: the
    book records a run of a different chain.
    """
    order = stages if stages is not None else script_stages()
    try:
        index = order.index(stage) + 1
    except ValueError:
        return None
    return book.get(f"{index:02d}-{stage}")


def _is_watched(path: Path) -> bool:
    """A source or published province JSON — the artefacts a declaration is
    expected to cover. Rasters and per-chunk families are not warned about."""
    s = str(path)
    if str(SOURCES) in s:
        return True
    return path.parent == PROVINCE and path.suffix == ".json"


def check(stages: Iterable[str]) -> list[str]:
    """Every declared read of every named stage, as ONE list. Strings starting
    `warn: ` never fail the pass."""
    book = _stamps()
    order = script_stages()
    findings: list[str] = []
    for stage in stages:
        if stage in ABOVE_GATE:
            continue
        entries = READS.get(stage)
        if entries is None:
            findings.append(f"{stage}: declares no reads "
                            f"(add a READS entry in worldgen/chain_contracts.py)")
            continue
        declared: set[str] = set()
        for entry in entries:
            for path in declared_paths(entry):
                declared.add(str(Path(path).resolve()))
            try:
                findings.extend(entry(stage=stage))
            except Exception as error:             # noqa: BLE001 — a broken
                # declaration is itself a mismatch, never a crashed pass.
                findings.append(f"{stage}: declaration raised "
                                f"{error.__class__.__name__}: {error}")
        stamp = _stamp_for(book, stage, order)
        if not stamp:
            continue
        touched = {str(Path(p).resolve())
                   for p in list(stamp.get("inputs", {})) + list(stamp.get("outputs", {}))}
        for path in sorted(declared):
            p = Path(path)
            if p.is_dir() or not p.exists():
                continue                            # a directory is never opened;
                                                    # a missing file is already reported
            if path not in touched:
                findings.append(f"{stage}: declared read {_short(p)} was not opened "
                                f"on its last stamped run")
        for entry in entries:
            if not isinstance(entry, glob_read):
                continue
            if not any(str(p.resolve()) in touched for p in entry.matches()):
                findings.append(
                    f"{stage}: declared glob {_short(entry.directory / entry.pattern)} "
                    f"matched no file that was opened on its last stamped run")
        dirs = [Path(d) for d in declared if Path(d).is_dir()]
        for path in sorted(stamp.get("inputs", {})):
            p = Path(path).resolve()
            if str(p) in declared or not _is_watched(p):
                continue
            if any(d in p.parents for d in dirs):
                continue            # declared as a family by its directory
            findings.append(f"warn: {stage}: opened {_short(p)} but does not declare it")
    findings.extend(order_findings([s for s in order if s in set(stages)] or list(stages)))
    return findings


def artefact_count(stages: Iterable[str]) -> int:
    seen: set[str] = set()
    for stage in stages:
        for entry in READS.get(stage, []):
            for path in declared_paths(entry):
                seen.add(str(Path(path).resolve()))
    return len(seen)


# --------------------------------------------------------------------- CLI

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Check every below-gate chain stage's read contract before the chain runs.")
    parser.add_argument("--stages", default=None,
                        help="space-separated stage names (default: $CHAIN_ENABLED)")
    parser.add_argument("--all", action="store_true",
                        help="every below-gate stage in scripts/terrain-chain.sh")
    args = parser.parse_args(argv)

    if args.all:
        names = [s for s in script_stages() if s not in ABOVE_GATE] or sorted(READS)
    else:
        raw = args.stages if args.stages is not None else os.environ.get("CHAIN_ENABLED", "")
        if raw.strip() in ("", "all"):
            names = [s for s in script_stages() if s not in ABOVE_GATE] or sorted(READS)
        else:
            names = [s for s in raw.split() if s not in ABOVE_GATE]

    order = {s: i for i, s in enumerate(script_stages())}
    names = sorted(dict.fromkeys(names), key=lambda s: order.get(s, 10_000))

    findings = check(names)
    hard = [f for f in findings if not f.startswith("warn: ")]
    for i, line in enumerate(findings, 1):
        print(f"{i:3d}. {line}")
    if hard:
        print(f"contracts: {len(hard)} mismatch(es) across {len(names)} stages — "
              f"fix these before the chain runs (nothing has run yet).")
        return 1
    print(f"contracts: OK ({len(names)} stages, {artefact_count(names)} artefacts)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
