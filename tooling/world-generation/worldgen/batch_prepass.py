"""The batch pre-pass (16k S16, method review round 3 findings A and I).

Run once per batch of places, before any of them is applied:

  1. the shells: every linked shell (a piece `exterior-interior-links.json`
     links to a furnished cell; a composite counts as its base shell) the
     batch's blueprints and layouts place;
  2. the interior kits those shells' cells need (each cell's bundle kits, and
     the kit config that lists a piece no published kit holds yet); a kit that
     is not published, whose config lists a piece its published manifest lacks,
     or that carries a `build_kit` input stamp is handed to `build_kit` (which
     skips on an unchanged stamp) and a first build is published with
     `kit_compress`;
  3. the claim table, shell -> cell per culture pool: every linked cell's
     measured profile (`blueprint_interiors.plugin_profile`) and asset check
     (`blueprint_interiors.bundle_sourcing`), the two plugin reads that made
     `blueprint_interiors --claim` a 111.5 s step. `--claim` then reads them
     from the table; the fit rule itself still runs live, so a changed layout
     (scale, services, preferCell) needs no rebuild;
  4. the kit size list (MB on disk of each needed kit as published, the
     compressed copy under apps/world-studio/public/kits/) and the site
     budget: the last composed site plus the batch's kits that site does not
     ship yet, against compose.mjs's warn and fail lines. Exit 1 over fail.

The table is derived and rebuildable (it depends on the local vault's
plugins), so it lives at tooling/world-generation/output/claim-table.json,
git-ignored. It carries the hash of every input it was measured from; a table
whose inputs moved is refused by `--claim` with the command that rebuilds it.

Run (from tooling/world-generation/, under job_guard when kits may build):
  python3 -m worldgen.batch_prepass --places place.imperial-fringe.claywater-station[,b,c]
  python3 -m worldgen.batch_prepass --places a,b --no-build   # list kits, build nothing
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
WORLDGEN = Path(__file__).resolve().parent
TABLE_PATH = REPO_ROOT / "tooling" / "world-generation" / "output" / "claim-table.json"
SCHEMA_VERSION = 1
BLUEPRINTS_DIR = REPO_ROOT / "world" / "sources" / "blueprints"
PUBLIC_KITS = REPO_ROOT / "apps" / "world-studio" / "public" / "kits"
ASSET_PIPELINE = REPO_ROOT / "tooling" / "asset-pipeline"
KIT_CONFIGS = ASSET_PIPELINE / "pipeline" / "config" / "kits"
RAW_KITS = ASSET_PIPELINE / "output" / "kits"
SITE_DIR = REPO_ROOT / "site"
COMPOSE = REPO_ROOT / "tooling" / "pages-site" / "compose.mjs"
KIT_INTERIORS = REPO_ROOT / "world" / "sources" / "placement" / "kit-interiors"
REGISTRY_DIR = REPO_ROOT / "world" / "sources" / "assets"
REBUILD = ("cd tooling/world-generation && bash ../repo-standards/job_guard.sh prepass -- "
           "python3 -m worldgen.batch_prepass --places {places}")

#: The code the two measurements run (a change can move a profile or a bundle).
CODE_FILES = tuple(WORLDGEN / f"{name}.py" for name in (
    "blueprint_interiors", "interior_cells", "export_interior_bundle", "esp_index", "esp",
    "asset_taxonomy", "mine_door_links", "asset_registry",
    # the plugin discovery path (interior_cells.plugin_paths ->
    # mine_door_links.discover_plugins -> mine_designed_sink.EXTRA_POOL_PLUGINS,
    # asset_registry -> vault.asset_pipeline_root)
    "mine_designed_sink", "vault"))
MB = 1_000_000


class TableError(SystemExit):
    """The table cannot answer: absent entry or moved inputs. Exit code 2."""

    def __init__(self, message: str):
        super().__init__(2)
        self.message = message


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def _label(path: Path) -> str:
    try:
        return path.resolve().relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def input_files(plugins: dict[str, str]) -> list[tuple[str, Path, str]]:
    """`(label, path, how)` for every input the measurements read; `how` is
    "content" (sha256) or "stamp" (size and mtime: the vault's third-party
    plugins and mesh manifest, read-only and hundreds of MB)."""
    from .asset_registry import DEFAULT_VAULT
    from .blueprint_interiors import LINKS_PATH
    rows = [(_label(p), p, "content") for p in CODE_FILES]
    rows.append((_label(LINKS_PATH), LINKS_PATH, "content"))
    rows += [(_label(p), p, "content") for p in sorted(PUBLIC_KITS.glob("*.kit.json"))]
    rows += [(_label(p), p, "content") for p in sorted(KIT_INTERIORS.glob("absent-master-classes.json"))]
    rows += [(_label(p), p, "content") for p in sorted((KIT_INTERIORS / "substitutions").glob("*.json"))]
    rows += [(_label(p), p, "content") for p in sorted(REGISTRY_DIR.glob("registry-*.jsonl"))]
    manifest = DEFAULT_VAULT / "skyrim-source" / "manifest-skyrim-meshes.txt"
    rows.append(("vault:manifest-skyrim-meshes.txt", manifest, "stamp"))
    rows += [(f"plugin:{name}", Path(path), "stamp") for name, path in sorted(plugins.items())]
    return rows


def hash_inputs(rows: list[tuple[str, Path, str]]) -> dict[str, str]:
    out = {}
    for label, path, how in rows:
        if not path.exists():
            out[label] = "absent"
        elif how == "stamp":
            st = path.stat()
            out[label] = f"size={st.st_size};mtime_ns={st.st_mtime_ns}"
        else:
            out[label] = _sha256(path)
    return dict(sorted(out.items()))


def digest_of(hashes: dict[str, str]) -> str:
    return hashlib.sha256("\n".join(f"{v} {k}" for k, v in sorted(hashes.items())).encode()).hexdigest()


def moved_inputs(old: dict[str, str], new: dict[str, str]) -> list[str]:
    return sorted(k for k in set(old) | set(new) if old.get(k) != new.get(k))


# --------------------------------------------------------------------------- #
# the table and its lookup
# --------------------------------------------------------------------------- #
class ClaimTable:
    """The lookups `blueprint_interiors.claim_doors` injects in place of the
    plugin reads: `profile(plugin, cell, shell)` and `sourcing(plugin, cell)`."""

    def __init__(self, doc: dict, path: Path = TABLE_PATH):
        self.doc = doc
        self.path = path
        self._profile: dict[tuple[str, str, str], dict | None] = {}
        self._sourcing: dict[tuple[str, str], dict] = {}
        for shells in doc.get("pools", {}).values():
            for shell, entry in shells.items():
                for row in entry.get("cells", []):
                    self._profile[(row["plugin"], row["cell"], shell)] = row["profile"]
                    self._sourcing[(row["plugin"], row["cell"])] = row["sourcing"]

    def _miss(self, what: str) -> TableError:
        places = ",".join(self.doc.get("places") or []) or "<this batch's place ids>"
        return TableError(f"claim table {_label(self.path)} has no entry for {what}: the pre-pass "
                          f"did not cover this place's shells. Rebuild it with this place in the "
                          f"batch: {REBUILD.format(places=places + ',<this place id>')}")

    def profile(self, plugin: str, cell: str, shell: str | None) -> dict | None:
        key = (plugin, cell, str(shell))
        if key not in self._profile:
            raise self._miss(f"cell {cell} ({plugin}) under shell {shell}")
        return self._profile[key]

    def sourcing(self, plugin: str, cell: str) -> dict:
        key = (plugin, cell)
        if key not in self._sourcing:
            raise self._miss(f"cell {cell} ({plugin})")
        return self._sourcing[key]


def load_table(path: Path = TABLE_PATH) -> dict | None:
    if not path.exists():
        return None
    doc = json.loads(path.read_text())
    if doc.get("schemaVersion") != SCHEMA_VERSION:
        raise TableError(f"claim table {_label(path)} is schemaVersion {doc.get('schemaVersion')}, "
                         f"this code reads {SCHEMA_VERSION}; rebuild: "
                         + REBUILD.format(places=",".join(doc.get("places") or [])))
    return doc


def discovered_plugins() -> dict[str, str]:
    """name -> path of every plugin the measurements can read NOW (the same
    discovery `interior_cells.plugin_paths` and `export_interior_bundle` run),
    so a plugin added to a pool or to EXTRA_POOL_PLUGINS moves the inputs."""
    from .interior_cells import plugin_paths
    return {name: str(path) for name, path in sorted(plugin_paths().items())}


def current_table(path: Path = TABLE_PATH, rows_of=input_files,
                  plugins_of=discovered_plugins) -> ClaimTable | None:
    """The table when present and current; None when absent; raises
    `TableError` (with the rebuild command) when any input moved, including
    the discovered plugin set."""
    doc = load_table(path)
    if doc is None:
        return None
    now = hash_inputs(rows_of(plugins_of()))
    moved = moved_inputs(doc.get("inputs") or {}, now)
    if moved:
        raise TableError(f"claim table {_label(path)} is stale, {len(moved)} input(s) moved since "
                         f"it was measured: {', '.join(moved[:6])}{' ...' if len(moved) > 6 else ''}. "
                         f"Rebuild: {REBUILD.format(places=','.join(doc.get('places') or []))}")
    return ClaimTable(doc, path)


# --------------------------------------------------------------------------- #
# the batch: places -> shells -> cells
# --------------------------------------------------------------------------- #
def place_sources(place_id: str, blueprints_dir: Path = BLUEPRINTS_DIR) -> tuple[dict | None, dict | None]:
    """`(blueprint, layout)` of a place, found by the ids they carry."""
    from .blueprint_files import blueprint_paths
    blueprint = layout = None
    for path in blueprint_paths(blueprints_dir):
        doc = json.loads(path.read_text()).get("blueprint") or {}
        if doc.get("id") == place_id:
            blueprint = doc
    for path in sorted(blueprints_dir.glob("*.layout.json")):
        doc = json.loads(path.read_text())
        if doc.get("placeId") == place_id:
            layout = doc
    return blueprint, layout


def _asset_refs(doc) -> list[str]:
    out = []
    if isinstance(doc, dict):
        for key, value in doc.items():
            if key in ("assetRef", "asset") and isinstance(value, str):
                out.append(value)
            else:
                out += _asset_refs(value)
    elif isinstance(doc, list):
        for value in doc:
            out += _asset_refs(value)
    return out


def batch_shells(places: list[str], links: dict, blueprints_dir: Path = BLUEPRINTS_DIR) -> list[str]:
    """Every linked shell the places' blueprints and layouts place (composites
    as their base shell), sorted. A place with neither file is an error."""
    from .blueprint_interiors import composite_base
    shells: set[str] = set()
    for place in places:
        blueprint, layout = place_sources(place, blueprints_dir)
        if blueprint is None and layout is None:
            raise SystemExit(f"batch_prepass: no blueprint or layout under "
                             f"{_label(blueprints_dir)} carries the id {place}")
        for ref in _asset_refs(blueprint) + _asset_refs(layout):
            shell = (composite_base(ref) or ref) if ref.startswith("composite:") else ref
            if shell in links:
                shells.add(shell)
    return sorted(shells)


def measure(shells: list[str], links: dict, profile, sourcing, kits_of) -> dict:
    """`{pool: {shell: {"cells": [...]}}}`, cells in link order, each with
    its profile, its sourcing and the kits its bundle needs."""
    from .blueprint_interiors import _pool_of
    pools: dict[str, dict] = {}
    for shell in shells:
        cells = []
        for row in links.get(shell) or []:
            plugin, cell = row["plugin"], row["interiorCell"]
            cells.append({"plugin": plugin, "cell": cell,
                          "profile": profile(plugin, cell, shell),
                          "sourcing": sourcing(plugin, cell),
                          **kits_of(plugin, cell)})
        pools.setdefault(_pool_of(shell), {})[shell] = {"cells": cells}
    return {pool: pools[pool] for pool in sorted(pools)}


# --------------------------------------------------------------------------- #
# the kits
# --------------------------------------------------------------------------- #
def config_kit_of(configs_dir: Path = KIT_CONFIGS) -> dict[str, str]:
    """asset id -> the kit config listing it (first by file name)."""
    out: dict[str, str] = {}
    for path in sorted(configs_dir.glob("*.json")):
        try:
            cfg = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        for entry in cfg.get("assets", []) or []:
            if isinstance(entry.get("asset"), str):
                out.setdefault(entry["asset"], cfg.get("id", path.stem))
    return out


def published_assets(kit: str, kits_dir: Path = PUBLIC_KITS) -> set[str] | None:
    path = kits_dir / f"{kit}.kit.json"
    if not path.exists():
        return None
    return {a.get("id") for a in json.loads(path.read_text()).get("assets", []) or []}


def kit_plan(pools: dict, configs_dir: Path = KIT_CONFIGS, kits_dir: Path = PUBLIC_KITS,
             raw_dir: Path = RAW_KITS) -> dict:
    """Which kits the batch's cells need and which go to build_kit, why."""
    kit_of = config_kit_of(configs_dir)
    needed: set[str] = set()
    wanted_assets: dict[str, set[str]] = {}
    unlisted: set[str] = set()
    for shells in pools.values():
        for entry in shells.values():
            for row in entry["cells"]:
                needed.update(row.get("kits") or [])
                for asset in row.get("missingAssets") or []:
                    kit = kit_of.get(asset)
                    if kit is None:
                        unlisted.add(asset)
                    else:
                        needed.add(kit)
                        wanted_assets.setdefault(kit, set()).add(asset)
    build, why, unstamped, code_moved = [], {}, [], []
    for kit in sorted(needed):
        have = published_assets(kit, kits_dir)
        if have is None:
            build.append(kit)
            why[kit] = "not published"
        elif wanted_assets.get(kit, set()) - have:
            build.append(kit)
            why[kit] = f"its config lists {len(wanted_assets[kit] - have)} piece(s) its published manifest lacks"
        elif (raw_dir / f"{kit}.inputs.sha256").exists():
            moved = stamp_moved(kit, raw_dir / f"{kit}.inputs.sha256")
            if moved:
                build.append(kit)
                why[kit] = f"{len(moved)} input(s) moved since its build_kit stamp: {', '.join(moved[:4])}"
            elif code_moved_without_bump(raw_dir / f"{kit}.inputs.sha256"):
                code_moved.append(kit)
        else:
            unstamped.append(kit)
    return {"needed": sorted(needed), "build": build, "why": why, "unstamped": unstamped,
            "codeMovedWithoutBump": code_moved,
            "unlistedAssets": sorted(unlisted)}


def code_moved_without_bump(stamp: Path) -> bool:
    """The kit builder's code (``build_kit.KIT_CODE_FILES``) changed since
    this stamp while ``KIT_OUTPUT_FORMAT_VERSION`` did not: the stamp still
    vouches for the kit, so an edit that changes outputs without a bump would
    ship stale kits silently (L9 rec 5). A warning, never a rebuild."""
    bk = _build_kit()
    got = bk.stamped_code(stamp)
    if got is None:
        return False
    digest, version = got
    return version == str(bk.KIT_OUTPUT_FORMAT_VERSION) and digest != bk.kit_code_digest()


def stamp_moved(kit: str, stamp: Path) -> list[str]:
    """Labels of a build_kit input stamp whose input moved, checked without
    Blender or extraction: every repo file it lists (by content) and the
    kit's rows of the per-kit records (build_kit's own `kit_record_view`).
    The extracted vault sources (`data-root/...`) and the Blender plan
    (`(options)`) are checked by build_kit alone."""
    old = {}
    for line in stamp.read_text().splitlines()[1:]:
        if line.startswith("#") or " " not in line:
            continue
        digest, label = line.split(" ", 1)
        old[label] = digest
    moved = []
    rows = None
    for label, digest in sorted(old.items()):
        if label.startswith("data-root/") or label == "(options)":
            continue
        if label == "(output-format)":
            # the builder's output-format version, not a file (L9)
            if digest != str(_build_kit().KIT_OUTPUT_FORMAT_VERSION):
                moved.append(label)
            continue
        if label.endswith(" (kit rows)"):
            if rows is None:
                rows = _kit_row_hashes(kit)
            if rows.get(label) != digest:
                moved.append(label)
            continue
        path = REPO_ROOT / label
        if (_sha256(path) if path.is_file() else "absent") != digest:
            moved.append(label)
    return moved


def _build_kit():
    """``pipeline.build_kit`` (read-only import from the asset pipeline)."""
    sys.path.insert(0, str(ASSET_PIPELINE))
    try:
        from pipeline import build_kit
    finally:
        sys.path.remove(str(ASSET_PIPELINE))
    return build_kit


def _kit_row_hashes(kit: str) -> dict[str, str]:
    """build_kit's `<record> (kit rows)` hashes for one kit (read-only import)."""
    sys.path.insert(0, str(ASSET_PIPELINE))
    try:
        from pipeline.build_kit import KIT_ROW_RECORDS, kit_asset_ids, kit_record_view
    finally:
        sys.path.remove(str(ASSET_PIPELINE))
    ids = kit_asset_ids(kit)
    return {f"{p.name} (kit rows)": hashlib.sha256(kit_record_view(p, kit, ids)).hexdigest()
            for p in KIT_ROW_RECORDS}


def run_builds(kits: list[str]) -> None:
    """The kit-build path (kit-build skill steps 1 and 3): build_kit, which
    skips on an unchanged input stamp, then kit_compress for a first publish."""
    if not kits:
        return
    subprocess.run([sys.executable, "-m", "pipeline.build_kit", "--kits", ",".join(kits)],
                   cwd=ASSET_PIPELINE, check=True)
    for kit in kits:
        if not (PUBLIC_KITS / f"{kit}.glb").exists():
            subprocess.run([sys.executable, "-m", "pipeline.kit_compress", "--kit", kit],
                           cwd=ASSET_PIPELINE, check=True)


def kit_bytes(kit: str, kits_dir: Path = PUBLIC_KITS) -> int:
    """Bytes on disk of a published kit: `<kit>.*` and its `<kit>-*/` folders."""
    total = 0
    for path in kits_dir.glob(f"{kit}.*"):
        if path.is_file():
            total += path.stat().st_size
    for folder in kits_dir.glob(f"{kit}-*"):
        if folder.is_dir():
            total += sum(p.stat().st_size for p in folder.rglob("*") if p.is_file())
    return total


AUDIO_ROOT = REPO_ROOT / "packages" / "audio" / "files"


def dir_bytes(path: Path) -> int:
    """compose.mjs `bytesOf` (:100): every file under `path`, sizes summed."""
    return sum(p.stat().st_size for p in path.rglob("*") if p.is_file())


def reserved_audio_bytes(site_dir: Path, audio_root: Path = AUDIO_ROOT) -> int:
    """The audio compose.mjs reserves in its gated total when no app ships a
    copy (`compose.mjs:209`, `bytesOf(OUT) + (audioCopies.length ? 0 : audioBytes)`;
    audioBytes `:181`, audioCopies `:182`: `<site>/audio` or `<site>/studio/audio`
    holding `audio-manifest.json`)."""
    copies = [d for d in (site_dir / "audio", site_dir / "studio" / "audio")
              if (d / "audio-manifest.json").exists()]
    return 0 if copies or not audio_root.exists() else dir_bytes(audio_root)


def site_budget_mb(compose: Path = COMPOSE) -> tuple[float, float]:
    """compose.mjs's own warn and fail lines (the one source of the numbers)."""
    text = compose.read_text()
    warn = re.search(r'opt\("--warn-mb",\s*([0-9.]+)\)', text)
    fail = re.search(r'opt\("--fail-mb",\s*([0-9.]+)\)', text)
    if not (warn and fail):
        raise SystemExit(f"batch_prepass: cannot read the site budget from {_label(compose)}")
    return float(warn.group(1)), float(fail.group(1))


def budget_check(kits: list[str], site_dir: Path = SITE_DIR, kits_dir: Path = PUBLIC_KITS,
                 compose: Path = COMPOSE, audio_root: Path = AUDIO_ROOT) -> tuple[bool, list[str]]:
    """`(ok, lines)`: each kit's MB, then the last composed site plus the kits
    it does not ship yet, against warn and fail."""
    warn_mb, fail_mb = site_budget_mb(compose)
    lines = ["kits the batch's cells need (MB on disk, published compressed copy):"]
    new_bytes = 0
    shipped_dir = site_dir / "studio" / "kits"
    for kit in kits:
        n = kit_bytes(kit, kits_dir)
        shipped = (shipped_dir / f"{kit}.glb").exists()
        if not shipped:
            new_bytes += n
        lines.append(f"  {kit:32s} {n / MB:7.1f} MB  {'in the composed site' if shipped else 'NEW to the site'}")
    if not site_dir.exists():
        return False, lines + [f"no composed site at {_label(site_dir)}: run "
                               f"`node tooling/pages-site/compose.mjs` first (the budget is measured on it)"]
    site = dir_bytes(site_dir)
    audio = reserved_audio_bytes(site_dir, audio_root)
    when = time.strftime("%Y-%m-%dT%H:%M", time.gmtime(site_dir.stat().st_mtime))
    total = site + audio + new_bytes
    verdict = "FAIL" if total > fail_mb * MB else ("WARN" if total > warn_mb * MB else "ok")
    lines.append(f"site: composed {site / MB:.1f} MB ({_label(site_dir)}, {when}Z) + reserved audio "
                 f"{audio / MB:.1f} MB + new kits {new_bytes / MB:.1f} MB = {total / MB:.1f} MB "
                 f"(warn > {warn_mb:g}, fail > {fail_mb:g}): {verdict}")
    return verdict != "FAIL", lines


# --------------------------------------------------------------------------- #
def write_table(doc: dict, path: Path = TABLE_PATH) -> None:
    from .atomic_write import atomic_write_bytes
    # insertion order kept (never sort_keys): the profiles go back into the
    # blueprint verbatim, and a reordered key would show up in its diff
    atomic_write_bytes(path, (json.dumps(doc, indent=1, ensure_ascii=False) + "\n").encode("utf-8"))


def build_table(places: list[str], links: dict, plugins: dict[str, str], profile, sourcing, kits_of,
                previous: dict | None, rows_of=input_files, blueprints_dir: Path = BLUEPRINTS_DIR,
                shells: list[str] | None = None) -> dict:
    """The table for `places`, merged with a previous table whose inputs are
    unchanged (its shells kept, its places listed)."""
    inputs = hash_inputs(rows_of(plugins))
    if shells is None:
        shells = batch_shells(places, links, blueprints_dir)
    pools = measure(shells, links, profile, sourcing, kits_of)
    all_places = set(places)
    if previous and previous.get("inputs") == inputs:
        all_places |= set(previous.get("places") or [])
        for pool, old in (previous.get("pools") or {}).items():
            for shell, entry in old.items():
                pools.setdefault(pool, {}).setdefault(shell, entry)
        pools = {pool: {s: pools[pool][s] for s in sorted(pools[pool])} for pool in sorted(pools)}
    return {"schemaVersion": SCHEMA_VERSION, "writtenBy": "worldgen.batch_prepass",
            "places": sorted(all_places), "inputsDigest": digest_of(inputs),
            "plugins": dict(sorted(plugins.items())), "inputs": inputs, "pools": pools}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--places", required=True, help="comma-separated place ids")
    ap.add_argument("--no-build", action="store_true",
                    help="list the kits the batch needs and would build; build nothing")
    ap.add_argument("--site-dir", default=str(SITE_DIR))
    ap.add_argument("--table", default=str(TABLE_PATH))
    args = ap.parse_args(argv)
    t0 = time.monotonic()
    from . import blueprint_interiors as bi
    places = sorted({p for p in args.places.split(",") if p})
    links = bi.linked_shells()
    plugins = discovered_plugins()
    table_path = Path(args.table)
    try:
        previous = load_table(table_path)
    except TableError:
        previous = None

    def measure_now() -> dict:
        return build_table(places, links, plugins, bi.plugin_profile, bi.bundle_sourcing,
                           bi.bundle_kits, previous, shells=shells)

    # a current table already covering the batch's shells is reused as is
    shells = batch_shells(places, links)
    doc = None
    try:
        table = current_table(table_path, plugins_of=lambda: plugins)
    except TableError:
        table = None
    if table is not None and all(s in {sh for p in table.doc["pools"].values() for sh in p}
                                 for s in shells):
        doc = dict(table.doc, places=sorted(set(table.doc.get("places") or []) | set(places)))
        print(f"batch_prepass: table current, covers {len(shells)} shell(s); no plugin read")
    if doc is None:
        doc = measure_now()
    plan = kit_plan(doc["pools"])
    print(f"batch_prepass: {len(places)} place(s), {len(shells)} linked shell(s), "
          f"{sum(len(e['cells']) for p in doc['pools'].values() for e in p.values())} cell(s) in the table")
    for kit in plan["build"]:
        print(f"  build {kit}: {plan['why'][kit]}")
    if plan.get("codeMovedWithoutBump"):
        print(f"  ! kit builder code changed since the build of {', '.join(plan['codeMovedWithoutBump'])} "
              f"with no KIT_OUTPUT_FORMAT_VERSION bump (build_kit.py): bump it if the change alters "
              f"a GLB, manifest or sidecar, else restamp with build_kit --stamp-only")
    if plan["unstamped"]:
        print(f"  published, no build_kit stamp (not rebuilt here; build_kit would rebuild in full): "
              f"{', '.join(plan['unstamped'])}")
    if plan["unlistedAssets"]:
        head = ", ".join(plan["unlistedAssets"][:8])
        print(f"  ! {len(plan['unlistedAssets'])} piece(s) of the candidate cells no kit config lists "
              f"(stand-ins or a kit config/sourcing job; the full list is the table's "
              f"`unlistedAssets`): {head}{' ...' if len(plan['unlistedAssets']) > 8 else ''}")
    if plan["build"] and not args.no_build:
        run_builds(plan["build"])
        bi._SOURCING_ENV.clear()    # the published kits moved: measure again
        # `previous` is still merged when the build left every input as it
        # was (build_table compares them), so other places' shells survive
        doc = measure_now()
        plan = kit_plan(doc["pools"])
    doc["unlistedAssets"] = plan["unlistedAssets"]
    write_table(doc, table_path)
    print(f"batch_prepass: wrote {_label(table_path)} (inputs {doc['inputsDigest'][:8]})")
    ok, lines = budget_check(plan["needed"], Path(args.site_dir))
    print("\n".join(lines))
    print(f"batch_prepass: {time.monotonic() - t0:.1f} s")
    if plan["build"] and args.no_build:
        return 1
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
