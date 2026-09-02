"""Host-side builder for a **world static kit** — flora, rocks, clutter, kit
pieces — from any permitted asset pool into one runtime GLB.

The character/weapon builders each solve one asset at a time and normalise it
to a target size. World statics are the opposite problem: dozens of meshes per
kit, from four different archives, and their *native* proportions are the
whole point (a 32 m cypress must stay 32 m). This builder:

1. resolves each asset id against the semantic registry
   (`world/sources/assets/registry-<pool>.jsonl`);
2. extracts the NIF from whichever archive its pool lives in — BSA, RAR or a
   plain directory — plus every texture the NIF references, searching the
   pool's own textures first and falling back to vanilla;
3. hands one plan for the whole kit to a single headless Blender run, because
   Wine + Blender startup costs more than the conversion does;
4. gets back one GLB holding every asset as its own root node with a
   decimated LOD chain, and a manifest of dimensions, LOD ratios and the
   collision proxy each asset should use.

Usage:
    python -m pipeline.build_kit --kit flora-marsh-probe
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import struct
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from .bsa import BSAArchive
from .build import BUILD_DIR, TOOLCHAIN, _expand, _referenced_textures, to_windows
from .models import ROOT

KIT_SCRIPT = Path(__file__).resolve().parent / "blender" / "build_kit.py"
CONFIG = Path(__file__).resolve().parent / "config" / "kits"
REPO_ROOT = Path(__file__).resolve().parents[3]
REGISTRY_DIR = REPO_ROOT / "world" / "sources" / "assets"

#: The vault holds the archives every pool reads from (decision 0001). `ROOT`
#: falls back to the pipeline directory when the variable is unset, which is
#: right for the character build and wrong for ours, so resolve it explicitly.
DEFAULT_VAULT = Path(
    os.environ.get(
        "ELDER_SOULS_ASSET_ROOT",
        Path.home() / "workspace/elder-souls-dev/elder-scrolls-asset-pipeline",
    )
).expanduser()

#: Bethesda's nominal unit. Statics keep their source proportions, so this is
#: the one conversion that matters for the whole world (module 90 §72).
METRES_PER_UNIT = 0.0142240


# --- asset sources -----------------------------------------------------------


class Source:
    """Somewhere meshes or textures can be pulled from, by relative path.

    Extraction is **batched** by contract: the BM&V texture archive is 7.6 GB
    and bsdtar streams it, so one call per file turns a kit build into minutes
    of re-scanning. Callers collect everything they need, then extract once.
    """

    def contains(self, rel: str) -> bool:  # pragma: no cover - interface
        raise NotImplementedError

    def extract_many(self, rels: list[str], dest: Path) -> None:  # pragma: no cover
        raise NotImplementedError

    def names_available(self) -> Iterable[str]:  # pragma: no cover - interface
        return ()

    def find_by_basename(self, rel: str) -> str | None:
        """Same filename, different folder.

        Mods routinely reference a texture at the path some *other* mod used
        (BM&V's meshes ask for `textures/plants/tamira/newplants/bamboo.dds`
        while shipping it at `textures/landscape/Tamira/NewPlants/Bamboo.dds`),
        and the result is untextured flora. Where the exact path misses, match
        on filename and prefer the candidate sharing the most trailing folders,
        so a same-named texture in an unrelated tree loses.
        """
        target = rel.rsplit("/", 1)[-1].lower()
        wanted = rel.lower().split("/")
        best, best_score = None, -1
        for candidate in self.names_available():
            lower = candidate.lower()
            if lower.rsplit("/", 1)[-1] != target:
                continue
            parts = lower.split("/")
            score = 0
            for a, b in zip(reversed(parts), reversed(wanted)):
                if a != b:
                    break
                score += 1
            if score > best_score:
                best, best_score = candidate, score
        return best

    def find_by_stem(self, rel: str) -> str | None:
        """Last resort: a longer-named sibling of the same texture family.

        BM&V's shroom NIFs reference `vurt_shroomstem.dds`, which no archive
        anywhere ships — only `vurt_shroomstemmoss.dds` exists. Untextured,
        the giant mushroom's stem exported as a flat grey material and read
        as a solid slab in the world (owner Phase 10 round 3). Prefer the
        SHORTEST same-diffuse candidate whose stem extends the wanted one,
        skipping map-suffix variants (`_n`, `_s`, ...).
        """
        stem = rel.rsplit("/", 1)[-1].rsplit(".", 1)[0].lower()
        if len(stem) < 6:
            return None
        suffixes = ("_n", "_msn", "_s", "_sk", "_g", "_m", "_em", "_e", "_p", "_b")
        best, best_len = None, 10 ** 9
        for candidate in self.names_available():
            base = candidate.rsplit("/", 1)[-1].lower()
            if not base.endswith(".dds"):
                continue
            cstem = base.rsplit(".", 1)[0]
            if not cstem.startswith(stem) or cstem == stem:
                continue
            if cstem.endswith(suffixes):
                continue
            if len(cstem) < best_len:
                best, best_len = candidate, len(cstem)
        return best


class BsaSource(Source):
    def __init__(self, path: Path):
        self.archive = BSAArchive(path)

    def contains(self, rel: str) -> bool:
        return self.archive.contains(rel)

    def extract_many(self, rels: list[str], dest: Path) -> None:
        if rels:
            self.archive.extract(rels, dest)

    def names_available(self) -> Iterable[str]:
        return self.archive.namelist()


class DirSource(Source):
    """A directory tree, matched case-insensitively (mod archives are mixed)."""

    def __init__(self, root: Path):
        self.root = root
        self.index = {
            str(p.relative_to(root)).replace("\\", "/").lower(): p
            for p in root.rglob("*") if p.is_file()
        } if root.exists() else {}

    def contains(self, rel: str) -> bool:
        return rel.lower() in self.index

    def extract_many(self, rels: list[str], dest: Path) -> None:
        for rel in rels:
            target = dest / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(self.index[rel.lower()], target)

    def names_available(self) -> Iterable[str]:
        return self.index.keys()


class RarSource(Source):
    """A RAR archive read through bsdtar.

    BM&V ships 1.3 GB of meshes and 7.6 GB of textures as two RARs. They are
    not solid, so pulling single members is ~0.1 s — which is what makes
    "kit-compile deep on demand" affordable instead of a 9 GB extraction.
    """

    def __init__(self, path: Path, listing: Path):
        self.path = path
        # bsdtar matches member names exactly, and these archives are full of
        # mixed case (`architecture/Phitt/ashlands/...`), so the listing is
        # what maps our lower-cased registry paths back to real member names.
        self.names: dict[str, str] = {}
        if listing.exists():
            for line in listing.read_text(errors="replace").splitlines():
                name = line.strip().replace("\\", "/")
                if name:
                    self.names.setdefault(name.lower(), name)

    def contains(self, rel: str) -> bool:
        return rel.lower() in self.names

    def names_available(self) -> Iterable[str]:
        return self.names.keys()

    def extract_many(self, rels: list[str], dest: Path) -> None:
        members = [self.names[rel.lower()] for rel in rels if rel.lower() in self.names]
        if not members:
            return
        dest.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["bsdtar", "-xf", str(self.path), "-C", str(dest)] + members,
            capture_output=True, text=True,
        )
        # Members whose real name differs in case land at that name; give the
        # lower-cased path callers asked for a copy so downstream lookups hit.
        for rel in rels:
            member = self.names.get(rel.lower())
            if member and member != rel and (dest / member).exists():
                target = dest / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                if not target.exists():
                    shutil.copyfile(dest / member, target)


@dataclass
class PoolSources:
    meshes: Source
    textures: list[Source]


def pool_sources(pool: str, vault: Path) -> PoolSources:
    vanilla_tex = BsaSource(vault / "skyrim-source/Data/Skyrim - Textures.bsa")
    bmv = REPO_ROOT / "tooling/asset-pipeline/black-marsh-mod-source"
    tropical = vault / "skyrim-source/mod-sources/tropical-skyrim-33017/extracted"
    # Several pools bundle the same modder resources (both BM&V and Tropical
    # Skyrim ship Tamira's plants), and BM&V's texture archive is missing some
    # of the files its own meshes ask for. Searching the sibling pool before
    # vanilla recovers those rather than shipping untextured flora; both pools
    # are credited either way.
    if pool == "bmv":
        return PoolSources(
            meshes=RarSource(bmv / "Data1.rar", bmv / "manifest-data1.txt"),
            textures=[RarSource(bmv / "Data2.rar", bmv / "manifest.txt"),
                      DirSource(tropical), vanilla_tex],
        )
    if pool == "vanilla":
        return PoolSources(
            meshes=BsaSource(vault / "skyrim-source/Data/Skyrim - Meshes.bsa"),
            textures=[vanilla_tex],
        )
    if pool == "tropical":
        return PoolSources(meshes=DirSource(tropical),
                           textures=[DirSource(tropical), vanilla_tex])
    # Plain extracted-directory pools: one line each, because every mod sourced
    # from Nexus lands the same way (archive -> `<slug>-<id>/extracted`, BSAs
    # unpacked in place). Keep this table in step with `POOLS` in
    # `worldgen/asset_registry.py` — that module is the naming authority.
    dir_pools = {
        "xanmeer": "xanmeer-tileset-181193",
        "mudmother": "mud-mother-grove-146557",
        "ferries": "skyrim-ferries-109843",
        "rowboats": "rowboats-of-skyrim-35341",
        "ayleidcc": "cc-ayleid-ruin-resources-83999",
        "xalfek": "xalfek-55595",
        "darkwater": "darkwater-den-52630",
        "ayleidkit": "ayleid-ruins-building-kit-90667",
        "histtree": "sleeping-hist-tree-overhaul-116792",
        "canoe": "script-free-ship-sailing-67727",
        "ferryraft": "solitude-ghost-ferry-89948",
        "sbot": "ships-and-boats-of-tamriel-41653",
        "depths": "depths-of-skyrim-26913",
        "sirenroot": "sirenroot-70917",
        "htbm": "here-there-be-monsters-cipactli-35933",
    }
    if pool in dir_pools:
        root = vault / "skyrim-source/mod-sources" / dir_pools[pool] / "extracted"
        # Every pool's extracted root must be a Bethesda `Data` root — i.e.
        # `meshes/` and `textures/` as SIBLINGS. Mud Mother Grove ships its
        # own `Data/` wrapper; that wrapper is flattened at unpack time rather
        # than special-cased here, because the Blender importer resolves a
        # NIF's texture paths relative to the folder above `meshes/`, so a
        # nested layout silently produced untextured slabs.
        source = DirSource(root)
        # Some pools' meshes reference another pool's texture paths — SIRENROOT
        # is a Creation Club *Ayleid* resource, so its ruin blocks ask for
        # `textures/creationclub/.../arwall01.dds`, which the two Ayleid pools
        # ship and it does not. Declaring the sibling pool here is the same
        # trick BM&V uses with Tropical Skyrim above, and it is the difference
        # between a textured ruin block and a grey slab. Both pools are credited.
        siblings = {"sirenroot": ("ayleidkit", "ayleidcc"), "ayleidcc": ("ayleidkit",),
                    "depths": ("sbot",)}
        extra = [
            DirSource(vault / "skyrim-source/mod-sources" / dir_pools[s] / "extracted")
            for s in siblings.get(pool, ())
        ]
        return PoolSources(meshes=source, textures=[source, *extra, vanilla_tex])
    raise KeyError(f"unknown asset pool: {pool}")


# --- registry ----------------------------------------------------------------


def registry_index(pools: set[str]) -> dict[str, dict]:
    index: dict[str, dict] = {}
    for pool in sorted(pools):
        path = REGISTRY_DIR / f"registry-{pool}.jsonl"
        if not path.exists():
            raise FileNotFoundError(
                f"{path} missing — run `python3 -m worldgen.asset_registry build`"
            )
        with path.open() as fh:
            for line in fh:
                row = json.loads(line)
                index[row["id"]] = row
    return index


# --- build -------------------------------------------------------------------


def assemble(kit: dict, vault: Path) -> tuple[Path, list[dict], dict]:
    """Extract every asset and texture the kit needs into one data root."""
    work = BUILD_DIR / "kits" / kit["id"]
    data_root = work / "data-root"
    if data_root.exists():
        shutil.rmtree(data_root)
    data_root.mkdir(parents=True, exist_ok=True)

    entries = kit["assets"]
    # A COMPOSITE entry has no registry row of its own — its `compose.parts`
    # name the real assets. Its own id is free-form (`composite:...`) and only
    # ever appears in our own palettes.
    pools = {
        source["asset"].split(":", 1)[0]
        for e in entries
        for source in _part_specs(e)
    }
    index = registry_index(pools)
    sources = {pool: pool_sources(pool, vault) for pool in pools}

    rows = []
    for entry in entries:
        for spec in _part_specs(entry):
            row = index.get(spec["asset"])
            if row is None:
                raise KeyError(f"{spec['asset']} is not in the asset registry")
        rows.append((entry, index[_part_specs(entry)[0]["asset"]]))

    # Pass 1: every mesh, one extraction per archive. Species whose source
    # pool ships a ready-made `x_lod_flat.nif` billboard (registry field
    # `lodVariant`) bring it along as the T4 far tier — flat cutout cards the
    # renderer switches to beyond the decimated chain (module 65 §110).
    by_pool: dict[str, list[str]] = {}
    for entry, _row in rows:
        for spec in _part_specs(entry):
            row = index[spec["asset"]]
            by_pool.setdefault(row["pool"], []).append(row["path"])
            if _flat_lod_of(row):
                by_pool[row["pool"]].append(_flat_lod_of(row))
        donor = _flat_donor_row(entry, index)
        if donor is not None and _flat_lod_of(donor):
            by_pool.setdefault(donor["pool"], []).append(_flat_lod_of(donor))
    for pool, paths in by_pool.items():
        sources[pool].meshes.extract_many(sorted(set(paths)), data_root)

    resolved: list[dict] = []
    wanted: dict[str, set[str]] = {}
    for entry, row in rows:
        parts = []
        for spec in _part_specs(entry):
            part_row = index[spec["asset"]]
            part_nif = data_root / part_row["path"]
            if not part_nif.exists():
                raise FileNotFoundError(
                    f"{entry['asset']}: {part_row['path']} not extracted")
            wanted.setdefault(part_row["pool"], set()).update(
                _referenced_textures(part_nif))
            parts.append({**{k: v for k, v in spec.items() if k != "asset"},
                          "nif": to_windows(part_nif)})
        nif = data_root / row["path"]
        record = {
            "id": entry["asset"],
            "nif": to_windows(nif),
            "category": row.get("category", "misc"),
            "lodRatios": entry.get("lodRatios", kit.get("lodRatios", [0.35, 0.12])),
            "collision": entry.get("collision", _default_collision(row)),
            "doubleSided": entry.get(
                "doubleSided", row.get("category") in FOLIAGE_CATEGORIES
            ),
        }
        if entry.get("collisionRadiusM"):
            record["collisionRadiusM"] = entry["collisionRadiusM"]
        if entry.get("compose"):
            record["parts"] = parts
        # A species may BORROW another species' authored card (`lodFlatFrom`):
        # willows whose own cards UV a crown chunk, composites that have none.
        # Sourcing an existing card is a sourcing decision, not new art; the
        # Blender half rescales it to this asset's height.
        donor = _flat_donor_row(entry, index)
        if donor is not None:
            row = donor
        elif entry.get("compose"):
            resolved.append(record)
            continue
        flat = _flat_lod_of(row)
        if flat and (data_root / flat).exists():
            wanted.setdefault(row["pool"], set()).update(
                _referenced_textures(data_root / flat))
            record["lodFlatNif"] = to_windows(data_root / flat)
            if entry.get("lodFlatTexture"):
                # Per-species card atlas override; make sure the file lands.
                record["lodFlatTexture"] = entry["lodFlatTexture"]
                wanted.setdefault(row["pool"], set()).add(entry["lodFlatTexture"])
        elif flat:
            print(f"[kit]   billboard NIF missing from archive: {flat}")
        resolved.append(record)

    # Pass 2: textures, pool by pool, each archive visited once. A pool's own
    # textures win; vanilla is the fallback because mod meshes routinely reuse
    # vanilla texture paths.
    filled: set[str] = set()
    missing: set[str] = set()
    substituted: dict[str, str] = {}
    # Explicit aliases first (kit config `textureAliases`: wanted path ->
    # path to extract instead). The flora kit's reason to exist: every tree
    # card UVs the vanilla `tamrieltreelod.dds` PATH, but BM&V ships TWO
    # replacement atlases — its palm/mangrove card rects only hold palms in
    # `tamrieltreelodtropical.dds` (the plain one holds vanilla's pines there,
    # which is why every palm billboard rendered as a conifer). The temperate
    # rects are identical in both, so the tropical atlas serves the whole kit.
    for target, source_path in (kit.get("textureAliases") or {}).items():
        for pool in wanted:
            if (data_root / target).exists():
                break
            for source in sources[pool].textures:
                if not source.contains(source_path):
                    continue
                source.extract_many([source_path], data_root)
                origin = data_root / source_path
                if origin.exists():
                    destination = data_root / target
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(origin, destination)
                    substituted[target] = source_path
                    filled.add(target)
                    break
    for pool, textures in wanted.items():
        outstanding = {t for t in textures if not (data_root / t).exists()}
        # Each source is tried FULLY (exact path, then trailing-component
        # match) before the next source is consulted. The old two-phase order
        # (all sources exact, then all sources fuzzy) let VANILLA's exact-path
        # copy of a file beat the mod's own relocated one — the flora kit's
        # `_lod_flat` cards UV against BM&V's 4096² tamrieltreelod atlas
        # (shipped at textures/landscape/trees/), but vanilla ships a
        # different 1024² atlas at the exact path the NIFs name, so every gkb
        # tree card sampled the wrong picture and rendered as a grey slab
        # (owner Phase 10 round 3). A pool's own textures win, full stop.
        for source in sources[pool].textures:
            if not outstanding:
                break
            available = sorted(t for t in outstanding if source.contains(t))
            source.extract_many(available, data_root)
            landed = {t for t in available if (data_root / t).exists()}
            filled |= landed
            outstanding -= landed
            for rel in sorted(outstanding):
                alternative = source.find_by_basename(rel) or source.find_by_stem(rel)
                if not alternative:
                    continue
                source.extract_many([alternative], data_root)
                origin = data_root / alternative
                if not origin.exists():
                    continue
                target = data_root / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(origin, target)
                substituted[rel] = alternative
                filled.add(rel)
            outstanding -= set(substituted)
        missing |= outstanding

    for rel, alternative in sorted(substituted.items()):
        print(f"[kit]   texture path fixed up: {rel} <- {alternative}")

    print(f"[kit] {len(resolved)} assets, textures filled={len(filled)} "
          f"missing={len(missing)}")
    for texture in sorted(missing)[:10]:
        print(f"[kit]   missing texture: {texture}")
    return work, resolved, {"texturesMissing": sorted(missing),
                            "texturesSubstituted": substituted}


def _part_specs(entry: dict) -> list[dict]:
    """The registry-backed source assets behind one kit entry.

    An ordinary entry IS its own single part; a composite entry lists several
    (see `import_composite` in the Blender half for why composites exist).
    """
    compose = entry.get("compose")
    if not compose:
        return [{"asset": entry["asset"]}]
    parts = compose["parts"]
    if not parts:
        raise ValueError(f"{entry['asset']}: compose.parts is empty")
    return parts


FOLIAGE_CATEGORIES = {"tree", "shrub", "plant", "grass", "aquatic-plant", "fungus"}


def _flat_donor_row(entry: dict, index: dict[str, dict]) -> dict | None:
    """The registry row whose authored card this entry borrows, if any."""
    donor_id = entry.get("lodFlatFrom")
    if not donor_id:
        return None
    row = index.get(donor_id)
    if row is None:
        raise KeyError(f"{entry['asset']}: lodFlatFrom {donor_id} not in registry")
    if not _flat_lod_of(row):
        raise ValueError(f"{entry['asset']}: {donor_id} has no _lod_flat card")
    return row


def _flat_lod_of(row: dict) -> str | None:
    """The registry's `lodVariant` where it is a `_lod_flat` billboard.

    Only the flat variants are wanted this round: `_lod` and `_distant`
    siblings are decimated full meshes, which our own LOD chain already
    covers, while `_lod_flat` is authored cutout cards — the T4 tier.
    """
    variant = row.get("lodVariant")
    return variant if variant and variant.endswith("_lod_flat.nif") else None

#: Collision proxy per category (module 65 §111: tiered collision — hero
#: assets get compiled colliders, trees a trunk capsule, groundcover none).
_COLLISION_BY_CATEGORY = {
    "tree": "trunk-capsule",
    "root": "convex",
    "rock": "convex",
    "deadfall": "convex",
    "terrain-feature": "convex",
    "architecture": "mesh",
    "ruin": "mesh",
    "dungeon-kit": "mesh",
    "bridge": "mesh",
    "dock": "mesh",
    "furniture": "convex",
    "container": "convex",
    "boat": "mesh",
}


def _default_collision(row: dict) -> str:
    return _COLLISION_BY_CATEGORY.get(row.get("category", ""), "none")


def set_alpha_modes(glb: Path, summary: dict) -> dict:
    """Rewrite the exported glTF's alpha modes: **foliage is masked, never
    blended** (module 65 §111 — alpha-test overdraw is the #1 mobile killer,
    and blended foliage also sorts wrongly).

    Blender 4.2 dropped the `CLIP` blend method its glTF exporter used to map
    to `MASK`, so the exporter can only emit OPAQUE or BLEND. Patching the
    container afterwards is version-proof and, unlike a runtime override,
    means anything that opens the file sees the truth.
    """
    masked = {
        name for asset in summary["assets"] if asset.get("alphaTest")
        for name in asset.get("materials", [])
    }
    # Billboard cards are cutouts whatever the base asset's mode.
    masked |= {
        name for asset in summary["assets"]
        for name in asset.get("billboardMaterials", [])
    }
    data = bytearray(glb.read_bytes())
    header = struct.unpack_from("<4sII", data, 0)
    chunk_length, chunk_type = struct.unpack_from("<I4s", data, 12)
    if header[0] != b"glTF" or chunk_type != b"JSON":
        raise ValueError(f"{glb} is not a GLB with a leading JSON chunk")
    start = 20
    gltf = json.loads(bytes(data[start:start + chunk_length]))

    counts = {"MASK": 0, "OPAQUE": 0}
    for material in gltf.get("materials", []):
        if material.get("name") in masked:
            material["alphaMode"] = "MASK"
            material["alphaCutoff"] = 0.5
            counts["MASK"] += 1
        else:
            material.pop("alphaMode", None)
            material.pop("alphaCutoff", None)
            counts["OPAQUE"] += 1

    encoded = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    encoded += b" " * (-len(encoded) % 4)
    rebuilt = bytearray(data[:12])
    rebuilt += struct.pack("<I4s", len(encoded), b"JSON") + encoded
    rebuilt += data[start + chunk_length:]
    struct.pack_into("<I", rebuilt, 8, len(rebuilt))
    glb.write_bytes(bytes(rebuilt))
    print(f"[kit] alpha modes: {counts['MASK']} masked, {counts['OPAQUE']} opaque")
    return counts


def build(kit_id: str, vault: Path) -> dict:
    kit = json.loads((CONFIG / f"{kit_id}.json").read_text())
    work, assets, notes = assemble(kit, vault)
    output_glb = (REPO_ROOT / kit["output"]).resolve()
    output_glb.parent.mkdir(parents=True, exist_ok=True)
    summary_json = work / "summary.json"

    plan = {
        "kit": kit["id"],
        "assets": assets,
        "metresPerUnit": METRES_PER_UNIT,
        "inspect": bool(kit.get("inspect")),
        "textureMaxSize": kit.get("textureMaxSize", 1024),
        # Billboard `_lod_flat` cards UV tiny per-species rects out of ONE
        # shared tree-LOD atlas; shrinking that atlas to textureMaxSize left
        # each species ~10 texels and cards rendered as solid slabs (owner
        # Phase 10 round 3). The atlas keeps its own, larger cap.
        "billboardTextureMaxSize": kit.get("billboardTextureMaxSize", 1024),
        "output_glb": to_windows(output_glb),
        "summary_json": to_windows(summary_json),
    }
    plan_path = work / "kit-plan.json"
    plan_path.write_text(json.dumps(plan, indent=2))

    env = dict(os.environ)
    env["WINEPREFIX"] = str(_expand(TOOLCHAIN["winePrefix"]))
    env["WINEDEBUG"] = "-all"
    env["BUILD_PLAN"] = to_windows(plan_path)
    cmd = [
        str(_expand(TOOLCHAIN["wine"])),
        str(_expand(TOOLCHAIN["blender"])),
        "--background",
        "--python", to_windows(KIT_SCRIPT),
    ]
    proc = subprocess.run(cmd, env=env, capture_output=True, text=True,
                          timeout=TOOLCHAIN.get("buildTimeoutSeconds", 900))
    for line in proc.stdout.splitlines():
        if line.startswith("[kit]"):
            print("   " + line)
    if proc.returncode != 0 or not summary_json.exists():
        sys.stderr.write(proc.stdout[-4000:] + proc.stderr[-4000:])
        raise RuntimeError(f"kit build failed: {kit_id}")

    summary = json.loads(summary_json.read_text())
    summary["texturesMissing"] = notes["texturesMissing"]
    summary["texturesSubstituted"] = notes["texturesSubstituted"]
    summary["alphaModes"] = set_alpha_modes(output_glb, summary)
    manifest_path = output_glb.with_suffix(".kit.json")
    manifest_path.write_text(json.dumps(summary, indent=1) + "\n")
    # Post-pass: mould tree collision to the real wood geometry (oriented
    # capsule sets, collisionFrame pivot-yup-v3). Runs on the finished GLB, so
    # it lives outside Blender; see pipeline/trunk_solids.py.
    from . import trunk_solids
    trunk_solids.rewrite(manifest_path)
    summary = json.loads(manifest_path.read_text())
    total_mb = output_glb.stat().st_size / 1e6
    print(f"[kit] {kit_id}: {len(summary['assets'])} assets -> {output_glb.name} "
          f"({total_mb:.1f} MB), manifest {manifest_path.name}")
    return summary


def main() -> None:
    ap = argparse.ArgumentParser(description="Build a world static kit GLB.")
    ap.add_argument("--kit", required=True)
    ap.add_argument("--vault", default=str(DEFAULT_VAULT))
    args = ap.parse_args()
    build(args.kit, Path(args.vault))


if __name__ == "__main__":
    main()
