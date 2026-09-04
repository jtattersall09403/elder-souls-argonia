"""Vault inventory — what meshes do we own, and how much of it is packaged?

Answers one recurring question cheaply: *before* going shopping on Nexus, what
authored sets are already sitting in the vault that nobody has put in a kit?
The BM&V tree-house and root pieces were found by hand; this finds the rest.

Method
------
1. Enumerate every ``.nif`` in every vault source. Archives are listed with a
   single ``bsdtar -tf`` call each (never per member — that is minutes vs
   hours); extracted mods are walked; vanilla and BM&V already ship manifests.
2. Group by the **author's folder**: the directory a mesh sits in *is* the
   authored set (``meshes/architecture/citebosmer/passerelles/troncons/`` is a
   walkway system, ``meshes/actors/<x>/`` is a creature). We never open a mesh.
3. Cross-reference kit configs, the asset registries and the placement
   inventory to get, per set, how many pieces are *known* (in a registry) and
   how many are *packaged* (referenced by a kit or a placement file).

Run::

    python3 -m pipeline.vault_inventory            # writes md + json sidecar
    python3 -m pipeline.vault_inventory --print    # md to stdout

Golden rules honoured: no downloads, no mesh opening, no keyword-searching of
asset files (we read whole directory listings and group them).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import time
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_VAULT = Path(
    os.environ.get(
        "ELDER_SOULS_ASSET_ROOT",
        Path.home() / "workspace/elder-souls-dev/elder-scrolls-asset-pipeline",
    )
)
REPORT = REPO_ROOT / "world/sources/assets/vault-inventory.md"
SIDECAR = REPO_ROOT / "tooling/asset-pipeline/output/vault-inventory.json"

#: Directories under ``mod-sources`` that are not mods.
NON_MOD_DIRS = {"api", "archives", "lore", "extracted", "community-maps",
                "cc0-ground-textures"}
ARCHIVE_SUFFIXES = (".7z", ".rar", ".zip", ".bsa", ".ba2")

#: Sets smaller than this are collapsed into a per-mod "…and N tiny sets" line.
TINY_SET = 8
#: A set is "worth a look" at or above this many pieces …
WORTH_A_LOOK = 8
#: … and at or below this packaged fraction.
UNPACKAGED_BELOW = 0.20

#: Folders that are never a candidate for placing in the world: generated
#: face geometry, LOD stand-ins, loading-screen props, sky domes, spell FX
#: bound to Papyrus we cannot run, and headparts. They would otherwise swamp
#: the report — vanilla alone ships 2,500 facegen meshes.
NOISE_FOLDERS = (
    "facegendata", "/lod/", "meshes/lod", "loadscreenart", "meshes/sky",
    "meshes/magic", "meshes/mps", "meshes/interface", "meshes/markers",
    "character assets", "actors/character/facegen", "/_1stperson",
    "meshes/debris", "meshes/previs", "meshes/cameras", "meshes/animobjects",
)


def is_noise(folder: str) -> bool:
    f = folder + "/"
    return any(n in f for n in NOISE_FOLDERS)


_LOD = re.compile(r"(_lod_flat|_lod_\d+|_lod\d*|_distant)$", re.I)
_ASSET_ID = re.compile(r"^[a-z0-9]+:[A-Za-z0-9_\-/.%°]+$")


# --- need families -----------------------------------------------------------
# Ordered: first match wins. Keyed on folder path fragments, which is the only
# signal we allow ourselves (we do not open meshes).
NEED_FAMILIES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("creatures", ("actors/", "character/", "creature")),
    ("docks/boats", ("boat", "ship", "dock", "pier", "raft", "canoe", "ferr",
                     "sail", "quai", "harbour", "harbor")),
    ("dungeon tileset", ("dungeon", "ruin", "cave", "crypt", "barrow", "mine",
                         "nordic", "dwemer", "ayleid", "xanmeer", "catacomb")),
    ("water", ("water", "marsh", "swamp", "river", "waterfall")),
    ("effects", ("effects/", "fx", "magic/", "sky/", "particle")),
    ("flora", ("tree", "plant", "flora", "grass", "fern", "bush", "mushroom",
               "vine", "root", "hist", "canopy", "leaf", "leaves", "flower")),
    ("terrain rocks", ("rock", "cliff", "landscape/", "mountain", "boulder",
                       "terrain")),
    ("settlement kit", ("architecture", "village", "house", "hut", "town",
                        "city", "farm", "shack", "settlement", "building",
                        "interior", "tent", "camp", "bridge", "wall", "roof")),
    ("armour/weapons", ("armor/", "armour/", "weapons/", "weapon/", "shield")),
    ("clutter", ("clutter", "furniture", "props", "food", "book", "container",
                 "misc", "light")),
)


def need_family(folder: str) -> str:
    low = folder.lower() + "/"
    for family, needles in NEED_FAMILIES:
        if any(n in low for n in needles):
            return family
    return "unclassified"


# --- normalisation -----------------------------------------------------------


def mesh_key(path: str) -> str | None:
    """Vault-relative path -> the canonical ``meshes/``-rooted key, or None.

    Every source lays its files down differently (BSA roots, ``Data/``
    wrappers, archive folders such as ``00 Core/meshes/…``), so we anchor on
    the ``meshes/`` segment itself rather than trusting any prefix.
    """
    p = path.replace("\\", "/").lower().lstrip("./")
    if not p.endswith(".nif"):
        return None
    parts = p.split("/")
    if "meshes" in parts:
        p = "/".join(parts[parts.index("meshes"):])
    elif not p.startswith("meshes/"):
        # Loose-mesh mods with no meshes/ folder (BM&V ships some at root).
        p = "meshes/" + p
    stem, _, _ = p.rpartition(".")
    return _LOD.sub("", stem) + ".nif"


def id_to_key(asset_id: str) -> str | None:
    """``bmv:architecture/stilthouse/stilthouseext`` -> ``meshes/…​.nif``."""
    _, _, rest = asset_id.partition(":")
    if not rest:
        return None
    return mesh_key(rest if rest.endswith(".nif") else rest + ".nif")


# --- enumeration -------------------------------------------------------------


def read_manifest(path: Path) -> list[str]:
    if not path.exists():
        return []
    return [ln.strip() for ln in path.read_text(errors="replace").splitlines()
            if ln.strip()]


def list_archive(path: Path) -> list[str]:
    """One ``bsdtar -tf`` per archive. Never per member."""
    try:
        out = subprocess.run(["bsdtar", "-tf", str(path)], capture_output=True,
                             text=True, timeout=600)
    except (OSError, subprocess.TimeoutExpired):
        return []
    if out.returncode != 0 and not out.stdout:
        return []
    return [ln.strip() for ln in out.stdout.splitlines() if ln.strip()]


def walk_dir(root: Path) -> list[str]:
    found: list[str] = []
    for base, _dirs, files in os.walk(root):
        rel = Path(base).relative_to(root)
        for f in files:
            found.append(str(rel / f))
    return found


@dataclass
class ModSource:
    """One mod (or vanilla) and every path it contains."""

    slug: str
    label: str
    paths: list[str] = field(default_factory=list)
    how: str = ""


def _archive_mod_id(name: str) -> str | None:
    m = re.search(r"-(\d{3,6})[-.]", name)
    return m.group(1) if m else None


def collect_sources(vault: Path, verbose: bool = False) -> list[ModSource]:
    sources: list[ModSource] = []
    mod_root = vault / "skyrim-source/mod-sources"

    vanilla = read_manifest(vault / "skyrim-source/manifest-skyrim-meshes.txt")
    if vanilla:
        sources.append(ModSource("vanilla", "Vanilla Skyrim (Bethesda)",
                                 vanilla, "manifest"))
    bmv_dir = REPO_ROOT / "tooling/asset-pipeline/black-marsh-mod-source"
    bmv = read_manifest(bmv_dir / "manifest-data1.txt")
    if bmv:
        sources.append(ModSource("bmv", "Black Marsh & Valenwood (ModDB)",
                                 bmv, "manifest"))

    seen_ids: set[str] = set()
    for d in sorted(p for p in mod_root.iterdir() if p.is_dir()):
        if d.name in NON_MOD_DIRS:
            continue
        mid = d.name.rsplit("-", 1)[-1]
        if mid.isdigit():
            seen_ids.add(mid)
        paths: list[str] = []
        hows: list[str] = []
        extracted = d / "extracted"
        if extracted.is_dir():
            walked = walk_dir(extracted)
            paths += walked
            hows.append("extracted")
            # Several mods were unpacked to `extracted/` but ship their content
            # inside a BSA that was never unpacked (Underwater Treasures is one
            # mesh on disk and hundreds inside its archive). List those too.
            for rel in walked:
                f = extracted / rel
                if f.suffix.lower() in ARCHIVE_SUFFIXES:
                    inner = list_archive(f)
                    if inner:
                        paths += inner
                        hows.append("bsa")
        for arch in sorted(d.iterdir()):
            if arch.is_file() and arch.suffix.lower() in ARCHIVE_SUFFIXES:
                if not extracted.is_dir():
                    paths += list_archive(arch)
                    hows.append("archive")
        if paths:
            if verbose:
                print(f"  {d.name}: {len(paths)} paths ({'+'.join(hows)})")
            sources.append(ModSource(d.name, d.name, paths, "+".join(sorted(set(hows)))))

    # Archives that belong to no mod folder (loose downloads) still count.
    arch_dir = mod_root / "archives"
    if arch_dir.is_dir():
        for arch in sorted(arch_dir.iterdir()):
            if arch.suffix.lower() not in ARCHIVE_SUFFIXES:
                continue
            mid = _archive_mod_id(arch.name)
            if mid and mid in seen_ids:
                continue
            paths = list_archive(arch)
            if paths:
                slug = f"archive:{arch.stem[:48]}"
                sources.append(ModSource(slug, slug, paths, "archive"))
    return sources


# --- coverage ----------------------------------------------------------------


def _strings(node) -> list[str]:
    if isinstance(node, str):
        return [node]
    if isinstance(node, dict):
        return [s for v in node.values() for s in _strings(v)]
    if isinstance(node, list):
        return [s for v in node for s in _strings(v)]
    return []


def referenced_keys(repo: Path = REPO_ROOT) -> tuple[set[str], set[str]]:
    """(known, packaged) mesh keys.

    *known* = present in an asset registry (we have catalogued it).
    *packaged* = referenced by a kit config or the placement inventory, i.e.
    something actually reaches for it when the world is built.
    """
    known: set[str] = set()
    packaged: set[str] = set()

    reg_dir = repo / "world/sources/assets"
    for reg in sorted(reg_dir.glob("registry-*.jsonl")):
        with reg.open(errors="replace") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                key = mesh_key(row.get("path", ""))
                if key:
                    known.add(key)

    for src in (sorted((repo / "tooling/asset-pipeline/pipeline/config/kits").glob("*.json"))
                + sorted((repo / "world/sources/placement").glob("*.json"))):
        try:
            data = json.loads(src.read_text(errors="replace"))
        except (json.JSONDecodeError, OSError):
            continue
        for s in _strings(data):
            key = id_to_key(s) if _ASSET_ID.match(s) else mesh_key(s)
            if key:
                packaged.add(key)
    return known, packaged


# --- grouping ----------------------------------------------------------------


@dataclass
class AssetSet:
    mod: str
    folder: str
    pieces: list[str] = field(default_factory=list)
    interiors: int = 0
    animated: bool = False
    rigged: bool = False
    actor_root: str = ""
    known: int = 0
    packaged: int = 0
    seen: set = field(default_factory=set)

    @property
    def total(self) -> int:
        return len(self.pieces)

    @property
    def packaged_pct(self) -> float:
        return self.packaged / self.total if self.total else 0.0

    @property
    def known_pct(self) -> float:
        return self.known / self.total if self.total else 0.0

    @property
    def family(self) -> str:
        return "creatures" if self.rigged else need_family(self.folder)

    def guess(self) -> str:
        """One line on what this set probably is, from folder + file names."""
        names = sorted({Path(p).stem for p in self.pieces})
        head = ", ".join(names[:6])
        if len(names) > 6:
            head += f", +{len(names) - 6} more"
        return head


def build_sets(sources: list[ModSource], known: set[str],
               packaged: set[str]) -> list[AssetSet]:
    sets: dict[tuple[str, str], AssetSet] = {}
    for src in sources:
        # Non-nif files still tell us about a set (skeletons, animations), so
        # we scan every path but only *count* meshes as pieces.
        folder_extras: dict[str, set[str]] = defaultdict(set)
        actor_roots: set[str] = set()
        for raw in src.paths:
            p = raw.replace("\\", "/").lower()
            parts = p.split("/")
            if "meshes" in parts:
                p = "/".join(parts[parts.index("meshes"):])
            elif not p.startswith("meshes/"):
                p = "meshes/" + p
            folder = p.rpartition("/")[0]
            if p.endswith((".hkx", ".kf")):
                folder_extras[folder].add("anim")
            if p.endswith("skeleton.nif"):
                folder_extras[folder].add("skeleton")
                # A creature's skeleton usually lives one or two folders below
                # the actor root (`actors/<x>/character assets/skeleton.nif`),
                # while its body meshes sit elsewhere under `actors/<x>/`, so
                # rig-ness is recorded against the ACTOR ROOT, not the folder
                # the skeleton happens to be in.
                seg = folder.split("/")
                if "actors" in seg:
                    i = seg.index("actors")
                    if len(seg) > i + 1:
                        actor_roots.add("/".join(seg[:i + 2]))
        for raw in src.paths:
            key = mesh_key(raw)
            if key is None:
                continue
            folder = key.rpartition("/")[0]
            s = sets.setdefault((src.slug, folder), AssetSet(src.slug, folder))
            if key in s.seen:
                continue
            s.seen.add(key)
            s.pieces.append(key)
            stem = Path(key).stem
            # Bethesda and every kit author that copies them marks interior
            # pieces with an `int` infix (`whintcastle`, `roofint01`), so the
            # substring is the convention — a few false positives are worth
            # not missing whole interior kits.
            if "int" in stem or "interior" in folder:
                s.interiors += 1
            if key in known:
                s.known += 1
            if key in packaged:
                s.packaged += 1
            marks = folder_extras.get(folder, set())
            if "anim" in marks:
                s.animated = True
            for r in actor_roots:
                if folder == r or folder.startswith(r + "/"):
                    s.rigged = True
                    s.actor_root = r
                    break
    return sorted(sets.values(), key=lambda s: (s.mod, -s.total, s.folder))


# --- report ------------------------------------------------------------------


def _pct(x: float) -> str:
    return f"{round(x * 100):d}%"


def render_md(sets: list[AssetSet], sources: list[ModSource],
              elapsed: float) -> str:
    by_mod: dict[str, list[AssetSet]] = defaultdict(list)
    for s in sets:
        by_mod[s.mod].append(s)

    total_nifs = sum(s.total for s in sets)
    L: list[str] = []
    L.append("# Vault inventory — what we own vs what we have packaged")
    L.append("")
    L.append("<!-- GENERATED by `python3 -m pipeline.vault_inventory` "
             "(tooling/asset-pipeline/pipeline/vault_inventory.py). Do not hand-edit. -->")
    L.append("")
    L.append(f"{len(sources)} sources · {total_nifs} unique meshes · "
             f"{len(sets)} authored sets · generated in {elapsed:.0f}s.")
    L.append("")
    L.append("**Read this before any sourcing search** (asset-strategy §71): the "
             "cheapest asset is one we already downloaded. A *set* is the "
             "author's own folder — that grouping is what makes an unpackaged "
             "walkway system or creature visible instead of drowning in a flat "
             "file list. *known* = catalogued in a `registry-*.jsonl`; "
             "*packaged* = actually referenced by a kit config or the placement "
             "inventory. High-known / zero-packaged is the interesting gap.")
    L.append("")

    # --- the answer to the owner's question, first ---
    candidates = [s for s in sets
                  if s.total >= WORTH_A_LOOK and s.packaged_pct < UNPACKAGED_BELOW
                  and not is_noise(s.folder)]
    candidates.sort(key=lambda s: -s.total)
    L.append("## Unpackaged authored sets worth a look")
    L.append("")
    L.append(f"Every set with ≥ {WORTH_A_LOOK} pieces and < "
             f"{_pct(UNPACKAGED_BELOW)} packaged ({len(candidates)} sets). "
             "Guesses come from folder and file names only — no mesh was opened.")
    L.append("")
    L.append("| Need family | Mod | Set | Pieces | Int | Known | Pkg | Looks like |")
    L.append("|---|---|---|---:|---:|---:|---:|---|")
    for s in candidates[:70]:
        L.append(f"| {s.family} | {s.mod} | `{s.folder}` | {s.total} | "
                 f"{s.interiors or ''} | {_pct(s.known_pct)} | "
                 f"{_pct(s.packaged_pct)} | {s.guess()} |")
    if len(candidates) > 70:
        L.append(f"| … | | _+{len(candidates) - 70} further sets over the bar_ | | | | | see the JSON sidecar |")
    L.append("")

    rigged = [s for s in sets if s.rigged and not is_noise(s.folder)]
    L.append("## Rigged creatures (Phase 13 gold)")
    L.append("")
    if rigged:
        L.append("Folders under `actors/` that ship a `skeleton.nif` — a rigged, "
                 "animatable creature, not a static prop. These are the hardest "
                 "thing to source and we should never buy one twice.")
        L.append("")
        # One row per creature, not per sub-folder: armour, beards and body
        # parts all belong to the same actor.
        agg: dict[tuple[str, str], list[int]] = {}
        for s in rigged:
            k = (s.mod, s.actor_root or s.folder)
            cur = agg.setdefault(k, [0, 0])
            cur[0] += s.total
            cur[1] += s.known
        L.append(f"{len(agg)} rigged actors across {len(rigged)} folders.")
        L.append("")
        L.append("| Mod | Actor | Meshes | Registered |")
        L.append("|---|---|---:|---|")
        for (mod, root), (tot, kn) in sorted(agg.items()):
            L.append(f"| {mod} | `{root.replace('meshes/actors/', '')}` | {tot} | "
                     f"{'yes' if kn else '**no**'} |")
    else:
        L.append("None found.")
    L.append("")

    # --- whole mods nobody has catalogued ---
    unreg = [(m, ss) for m, ss in sorted(by_mod.items())
             if sum(s.known for s in ss) == 0 and sum(s.total for s in ss) >= 5]
    L.append("## Mods with no registry row at all")
    L.append("")
    L.append("These sources are in the vault but have never been through "
             "`worldgen.asset_registry` — nothing in the world can reach them, "
             "and a sourcing search would not see them either. Adding a `Pool` "
             "row is the cheapest possible win. Matching is by mesh path, so a mod "
             "that ships vanilla-named replacers reads as catalogued even "
             "though its own pool row is missing — check `POOLS` too.")
    L.append("")
    if unreg:
        L.append("| Mod | Meshes | Largest sets |")
        L.append("|---|---:|---|")
        for mod, ss in sorted(unreg, key=lambda kv: -sum(s.total for s in kv[1])):
            top = ", ".join(f"`{s.folder}` ({s.total})"
                            for s in sorted(ss, key=lambda s: -s.total)[:3])
            L.append(f"| {mod} | {sum(s.total for s in ss)} | {top} |")
    else:
        L.append("None — every source is catalogued.")
    L.append("")

    # --- per-mod tables ---
    L.append("## Per-mod sets")
    L.append("")
    trivial = []
    for mod in sorted(by_mod):
        mod_sets = by_mod[mod]
        if sum(s.total for s in mod_sets) < 10:
            trivial.append(f"{mod} ({sum(s.total for s in mod_sets)})")
            continue
        big = [s for s in mod_sets if s.total >= TINY_SET]
        tiny = [s for s in mod_sets if s.total < TINY_SET]
        tot = sum(s.total for s in mod_sets)
        pkg = sum(s.packaged for s in mod_sets)
        L.append(f"### {mod} — {tot} meshes, {len(mod_sets)} sets, "
                 f"{_pct(pkg / tot if tot else 0)} packaged")
        L.append("")
        if big:
            L.append("| Set | Pieces | Known | Pkg | Family |")
            L.append("|---|---:|---:|---:|---|")
            for s in sorted(big, key=lambda s: -s.total)[:10]:
                L.append(f"| `{s.folder}` | {s.total} | {_pct(s.known_pct)} | "
                         f"{_pct(s.packaged_pct)} | {s.family} |")
            if len(big) > 10:
                rest = sum(s.total for s in sorted(big, key=lambda s: -s.total)[10:])
                L.append(f"| _+{len(big) - 10} further sets_ | {rest} | | | |")
        if tiny:
            L.append("")
            L.append(f"_+{len(tiny)} sets of under {TINY_SET} pieces "
                     f"({sum(s.total for s in tiny)} meshes)._")
        L.append("")
    if trivial:
        L.append(f"_Sources with under 10 meshes, not tabled: {', '.join(trivial)}._")
        L.append("")
    return "\n".join(L) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--vault", type=Path, default=DEFAULT_VAULT)
    ap.add_argument("--print", dest="to_stdout", action="store_true")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args(argv)

    t0 = time.time()
    sources = collect_sources(args.vault, verbose=args.verbose)
    known, packaged = referenced_keys()
    sets = build_sets(sources, known, packaged)
    elapsed = time.time() - t0
    md = render_md(sets, sources, elapsed)

    if args.to_stdout:
        print(md)
        return 0
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(md)
    SIDECAR.parent.mkdir(parents=True, exist_ok=True)
    SIDECAR.write_text(json.dumps({
        "schemaVersion": 1,
        "generatedSeconds": round(elapsed, 1),
        "sources": [{"slug": s.slug, "how": s.how, "paths": len(s.paths)}
                    for s in sources],
        "sets": [{"mod": s.mod, "folder": s.folder, "pieces": s.total,
                  "interiors": s.interiors, "animated": s.animated,
                  "rigged": s.rigged, "known": s.known, "packaged": s.packaged,
                  "family": s.family} for s in sets],
    }, indent=1) + "\n")
    print(f"{REPORT.relative_to(REPO_ROOT)}: {len(sets)} sets from "
          f"{len(sources)} sources in {elapsed:.0f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
