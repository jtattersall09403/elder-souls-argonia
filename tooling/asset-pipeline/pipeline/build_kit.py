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
from .build import (BUILD_DIR, TOOLCHAIN, TROPICAL_TEXTURES, _expand,
                    _referenced_textures, to_windows)
from .models import ROOT
from .placement_metadata import apply_placement_metadata

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


VANILLA_TEXTURES = "skyrim-source/Data/Skyrim - Textures.bsa"


def vanilla_texture_roots(vault: Path, tropical: bool = True) -> list[Path]:
    """The vanilla texture fallback, **tropicalised by default**.

    Owner ruling 2026-09-09: *if something ever calls for a vanilla asset, we
    use the tropicalised version everywhere by default, unless there is an
    explicit recorded reason not to.* Tropical Skyrim repaints the vanilla set
    under vanilla filenames, so putting its directory ahead of the BSA in the
    fallback makes every pool's vanilla-backed texture tropical — including
    mod pools, whose meshes routinely reference vanilla texture paths. A
    pool's OWN textures still sit ahead of both, so a sourced mod keeps its
    authored look, and a file Tropical does not repaint still resolves from
    the BSA. This is the pipeline default rather than a per-kit key precisely
    because a per-kit key is what let seven kits ship un-tropicalised.

    `tropical=False` is the opt-out, and it is reachable only through a kit
    config that states a reason (`untropicalisedReason`).
    """
    vanilla = vault / VANILLA_TEXTURES
    return [vault / TROPICAL_TEXTURES, vanilla] if tropical else [vanilla]


def _vanilla_texture_sources(vault: Path, tropical: bool = True) -> list[Source]:
    return [
        DirSource(root) if root.is_dir() else BsaSource(root)
        for root in vanilla_texture_roots(vault, tropical)
    ]


def pool_sources(pool: str, vault: Path, tropical: bool = True) -> PoolSources:
    fallback = _vanilla_texture_sources(vault, tropical)
    bmv = REPO_ROOT / "tooling/asset-pipeline/black-marsh-mod-source"
    tropical_dir = vault / TROPICAL_TEXTURES
    # Several pools bundle the same modder resources (both BM&V and Tropical
    # Skyrim ship Tamira's plants), and BM&V's texture archive is missing some
    # of the files its own meshes ask for. Searching the sibling pool before
    # vanilla recovers those rather than shipping untextured flora; both pools
    # are credited either way.
    if pool == "bmv":
        return PoolSources(
            meshes=RarSource(bmv / "Data1.rar", bmv / "manifest-data1.txt"),
            textures=[RarSource(bmv / "Data2.rar", bmv / "manifest.txt"),
                      *fallback],
        )
    if pool == "vanilla":
        return PoolSources(
            meshes=BsaSource(vault / "skyrim-source/Data/Skyrim - Meshes.bsa"),
            textures=fallback,
        )
    if pool == "tropical":
        return PoolSources(meshes=DirSource(tropical_dir),
                           textures=[DirSource(tropical_dir), *fallback])
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
        "ayleidkit": "ayleid-ruins-building-kit-90667",
        "histtree": "sleeping-hist-tree-overhaul-116792",
        "canoe": "script-free-ship-sailing-67727",
        "ferryraft": "solitude-ghost-ferry-89948",
        "sbot": "ships-and-boats-of-tamriel-41653",
        "depths": "depths-of-skyrim-26913",
        "sirenroot": "sirenroot-70917",
        "htbm": "here-there-be-monsters-cipactli-35933",
        "mwkeep": "morrowind-imperial-keep-133090",
        # King of the Murkmire: its BSA unpacked in place beside the kept
        # `Kotm BSA Test/` BSA and plugin (2026-09-24).
        "kotm": "king-of-the-murkmire-190459",
        "hlaalu": "morrowind-hlaalu-157997",
        "sailboats": "sailboats-expanded-40057",
        "impships": "cyrodiil-ship-boat-resource-59426",
        "boatsanim": "boats-operational-animated-110882",
        "drjacopo": "drjacopo-3d-grass-library-80687",
        "hoddminir": "hoddminir-plants-and-trees-38651",
        "jokerine": "seashells-jokerine-4492",
        "shores": "shores-of-skyrim-cc-140081",
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
        # Hlaalu Architecture is built ON the Imperial Keep set and reuses its
        # `tesak1243/mwimperialarchitecture` texture paths without shipping
        # them, so the keep pool is its sibling.
        siblings = {"sirenroot": ("ayleidkit", "ayleidcc"), "ayleidcc": ("ayleidkit",),
                    "depths": ("sbot",), "hlaalu": ("mwkeep",)}
        extra = [
            DirSource(vault / "skyrim-source/mod-sources" / dir_pools[s] / "extracted")
            for s in siblings.get(pool, ())
        ]
        return PoolSources(meshes=source, textures=[source, *extra, *fallback])
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


#: The shortest opt-out reason worth reading. A one-word "no" is the silent
#: omission this key exists to prevent.
OPT_OUT_REASON_MIN = 40


def tropicalised(kit: dict) -> bool:
    """Whether this kit resolves vanilla textures through Tropical Skyrim.

    True unless the config carries `untropicalisedReason` — a written reason,
    checked here so that a *reasonless* opt-out fails the build rather than
    warning (owner 2026-09-09). Kits never opt out by omission: the default is
    tropical and a new kit config inherits it without knowing it exists.
    """
    if "tropical" in (kit.get("textureOverlayPools") or []):
        raise ValueError(
            f"{kit['id']}: drop `textureOverlayPools: [\"tropical\"]` — tropical "
            "is the pipeline default for every pool's vanilla fallback now, so "
            "the key is redundant and reads as if the other kits opted out"
        )
    if "untropicalisedReason" not in kit:
        return True
    reason = kit["untropicalisedReason"]
    if not isinstance(reason, str) or len(reason.strip()) < OPT_OUT_REASON_MIN:
        raise ValueError(
            f"{kit['id']}: untropicalisedReason must be a written reason of at "
            f"least {OPT_OUT_REASON_MIN} characters saying WHY this kit keeps "
            "the un-tropicalised vanilla textures"
        )
    if kit.get("textureOverlayPools"):
        raise ValueError(
            f"{kit['id']}: cannot opt out of tropical and declare "
            "textureOverlayPools at the same time"
        )
    return False


def texture_pool_order(kit: dict, wanted: dict) -> list[str]:
    """The order pools fill contested texture paths in, most-wanted first.

    A path is extracted once and every later pool skips it because the file is
    already on disk, so pool order IS the answer to "whose copy of
    `textures/landscape/rocks01.dds` does this kit use?". The kit states it
    (`texturePoolPrecedence`); pools it does not name follow, sorted, so the
    result is deterministic either way."""
    precedence = list(kit.get("texturePoolPrecedence") or [])
    unknown = [pool for pool in precedence if pool not in wanted]
    if unknown:
        raise ValueError(
            f"{kit['id']}: texturePoolPrecedence names {unknown}, which this "
            f"kit sources nothing from (pools: {sorted(wanted)})")
    return precedence + [pool for pool in sorted(wanted) if pool not in precedence]


def contested_textures(wanted: dict) -> set[str]:
    """Texture paths more than one pool wants — the ones precedence decides."""
    return {path for pool in wanted for path in wanted[pool]
            if sum(path in wanted[other] for other in wanted) > 1}


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
    sources = {pool: pool_sources(pool, vault, tropical=tropicalised(kit))
               for pool in pools}
    # Kit config `textureOverlayPools`: a *retexture* pool whose files sit at
    # the SAME relative paths as the pool being overlaid (Phase 11 vibe-sheet
    # audit, proposal T1). Tropical Skyrim ships no architecture meshes at
    # all — its tropicalisation of the farmhouse/dock/bridge sets is purely
    # textures under vanilla filenames — so a whole parallel kit family would
    # be waste. Inserting its texture sources AHEAD of every pool's own
    # sources makes the same kit build tropical, deterministically, with zero
    # catalogue edits; drop the key and the un-overlaid kit builds again.
    for overlay in kit.get("textureOverlayPools") or []:
        # Only the overlay pool's OWN texture directory, not its vanilla
        # fallback (which every pool already has at the end of its list).
        overlay_textures = pool_sources(overlay, vault).textures[:1]
        for pool, ps in sources.items():
            if pool == overlay:
                continue
            # A pool's OWN textures still win — the overlay only outranks the
            # vanilla fallback, which every `pool_sources` branch puts last.
            # So a sourced mod keeps its authored look and only the pieces
            # that fall back on vanilla art get tropicalised; for the vanilla
            # pool itself that is the whole kit.
            cut = 0 if pool == "vanilla" else max(len(ps.textures) - 1, 0)
            ps.textures = [*ps.textures[:cut], *overlay_textures, *ps.textures[cut:]]

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
    # renderer switches to beyond the decimated chain (module 65 §110) —
    # only for assets that do not bake their own (`bakes_own_card`).
    by_pool: dict[str, list[str]] = {}
    for entry, main_row in rows:
        baked = bakes_own_card(entry, kit, main_row.get("category", "misc"))
        for spec in _part_specs(entry):
            row = index[spec["asset"]]
            by_pool.setdefault(row["pool"], []).append(row["path"])
            if not baked and _flat_lod_of(row):
                by_pool[row["pool"]].append(_flat_lod_of(row))
        donor = None if baked else _flat_donor_row(entry, index)
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
            "lodRatios": resolve_lod_ratios(entry, kit, row.get("category", "misc")),
            "collision": entry.get("collision", _default_collision(row)),
            "doubleSided": entry.get(
                "doubleSided", row.get("category") in FOLIAGE_CATEGORIES
            ),
        }
        if entry.get("collisionRadiusM"):
            record["collisionRadiusM"] = entry["collisionRadiusM"]
        # Decided here, once, for both halves: the Blender half bakes when
        # this is true and imports the authored `_lod_flat` (if any) only
        # when it is false.
        record["bakeCard"] = bakes_own_card(entry, kit, record["category"])
        if entry.get("compose"):
            record["parts"] = parts
        if record["bakeCard"]:
            resolved.append(record)
            continue
        # A species may BORROW another species' authored card (`lodFlatFrom`):
        # composites that have none, in a kit that does not bake. Sourcing an
        # existing card is a sourcing decision, not new art; the Blender half
        # rescales it to this asset's height.
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
    # POOL PRECEDENCE for a texture path several pools want (backlog row,
    # found 2026-09-16 in the rock kit): a path is filled once, and from then
    # on every other pool skips it because the file exists on disk, so
    # whichever pool happened to run first owned that picture for the whole
    # kit — `textures/landscape/rocks01.dds` in flora-province-v1 came from
    # BM&V's texturepack instead of Tropical Skyrim's. Which copy wins is now
    # the kit's stated decision (`texturePoolPrecedence`, most-wanted first),
    # not dict order, and every contested path is printed with the pool that
    # won it.
    ordered_pools = texture_pool_order(kit, wanted)
    contested = contested_textures(wanted)
    for pool in ordered_pools:
        textures = wanted[pool]
        outstanding = {t for t in textures if not (data_root / t).exists()}
        for path in sorted(contested & outstanding):
            print(f"[kit]   contested texture {path} -> {pool} "
                  f"(precedence {' > '.join(ordered_pools)})")
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


DEFAULT_LOD_RATIOS = [0.35, 0.12]

# `plan_lod_levels` (below) is DUPLICATED verbatim in blender/build_kit.py,
# like the card arithmetic; a unit test asserts the two copies match.


def resolve_lod_ratios(entry, kit, category):
    """The decimation ladder for one asset: entry, then category, then kit.

    `lodRatiosByCategory` exists because decimation is wrong for some
    categories rather than merely coarse: an open-shell cliff piece multiplies
    its boundary edges 5-10x under the decimator (rockcliff03 level 2 carries
    354 boundary edges on 336 triangles), which is the holes-in-rocks-at-
    distance defect. An empty list means LOD0 only — plus a card, where one is
    authored or baked.
    """
    if "lodRatios" in entry:
        return list(entry["lodRatios"])
    by_category = kit.get("lodRatiosByCategory") or {}
    if category in by_category:
        return list(by_category[category])
    return list(kit.get("lodRatios", DEFAULT_LOD_RATIOS))


# --- baked far-tier cards ----------------------------------------------------
#
# Only 44 of 159 flora species (and no ground cover at all) ship an authored
# `_lod_flat` card, so everything else runs its deepest decimated mesh to the
# draw distance. `bakeCards` renders a card FROM the source mesh instead — a
# derived LOD, the same thing DynDOLOD's tree-LOD billboard generator does,
# never new art. The two functions below are the whole arithmetic of it and
# are DUPLICATED verbatim in blender/build_kit.py, which runs in Wine
# Blender's interpreter and cannot import this package; a unit test asserts
# the two copies stay identical, so edit them together.

#: Tile edge in px for assets under 1.5 m, under 8 m, and taller.
CARD_RESOLUTION_PX = (128, 256, 512)
#: Cards pack into atlases no larger than this on either edge.
CARD_ATLAS_MAX_PX = 2048
#: Categories that never get a baked card (a rock reads wrong as a cutout).
CARD_SKIP_CATEGORIES = ("rock",)


def card_resolution_px(height_m, overrides=None):
    """Tile edge in px for an asset of this height (kit `cardResolutionPx`)."""
    small, medium, large = tuple(overrides or CARD_RESOLUTION_PX)
    if height_m < 1.5:
        return int(small)
    if height_m < 8.0:
        return int(medium)
    return int(large)


def pack_card_tiles(count, tile_px, atlas_max_px=CARD_ATLAS_MAX_PX):
    """Grid-pack `count` square tiles of one resolution class into atlases.

    Returns `(tiles, sizes)`: one `(atlas_index, [u0, v0, u1, v1])` per tile in
    order, and one `(width_px, height_px)` per atlas. Tiles fill row-major from
    the TOP-left; an atlas is trimmed to the rows and columns it actually uses,
    so a four-card probe does not ship a 2048 x 2048 image that is 99% empty.
    """
    if count <= 0:
        return [], []
    cols = max(1, atlas_max_px // tile_px)
    per_atlas = cols * cols
    tiles, sizes = [], []
    for atlas in range((count + per_atlas - 1) // per_atlas):
        here = min(per_atlas, count - atlas * per_atlas)
        rows_used = (here + cols - 1) // cols
        cols_used = min(cols, here)
        width, height = tile_px * cols_used, tile_px * rows_used
        sizes.append((width, height))
        for i in range(here):
            col, row = i % cols, i // cols
            u0 = col * tile_px / width
            u1 = (col + 1) * tile_px / width
            # glTF/Blender UV v runs bottom-up; row 0 is the TOP row.
            v1 = 1.0 - row * tile_px / height
            v0 = 1.0 - (row + 1) * tile_px / height
            tiles.append((atlas, [u0, v0, u1, v1]))
    return tiles, sizes


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

def plan_lod_levels(source_tris, ratios, floor):
    """The decimated LOD levels for one asset, one row per configured ratio.

    `source_tris` holds each part's triangle count. Ratios are proportional
    and `floor` is absolute, so a small part keeps its geometry rather than
    collapsing to a plane. Every configured level is emitted, because the
    settlement runtime refuses a chain shorter than its tier count (16h part
    1 round 4). A level whose effective ratios equal an earlier level's is
    not new geometry: `sharesLevel` names that earlier level (0 is the base
    mesh) and the builder reuses its mesh, so the GLB carries one primitive
    for both (the 16f round 5 concern: no duplicated palms). A newly
    decimated level has `sharesLevel` None.
    """
    levels = []
    previous, previous_level = [1.0] * len(source_tris), 0
    for level, ratio in enumerate(ratios, start=1):
        effectives = [
            min(1.0, max(ratio, floor / tris)) if tris > 0 else ratio
            for tris in source_tris
        ]
        if effectives == previous:
            levels.append({"level": level, "ratio": ratio,
                           "effectives": effectives, "sharesLevel": previous_level})
            continue
        levels.append({"level": level, "ratio": ratio,
                       "effectives": effectives, "sharesLevel": None})
        previous, previous_level = effectives, level
    return levels


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


def resolve_bake_card(entry):
    """Per-asset `bakeCard`, coerced to bool. Only `false` means anything: it
    opts the asset out of baking (a silhouette a card cannot carry). The old
    `"force"` value reads as `true` — it is what every asset does now."""
    value = entry.get("bakeCard", True)
    if isinstance(value, str):
        return value.lower() != "false"
    return bool(value)


def bakes_own_card(entry, kit, category):
    """True when this asset's far card is BAKED FROM ITS OWN MESH.

    Under `bakeCards` every asset outside `bakeCardSkipCategories` bakes its
    own card unless it carries `bakeCard: false`; an authored `_lod_flat`
    from the source pool is never used in that case. Authored cards UV a rect
    of a shared atlas indexed by the VANILLA tree slot, so they can only be
    matched to a mesh by name and nothing can prove the picture is this tree
    (16f round 4: `hodalder01gkb` wore `gkbjungletreenew17v2`'s card,
    `scottish-pine22` wore vanilla `TreePineForest05`'s, and
    `gkbjungletreenew30v3`'s was a single 27 m plane on an 11 m tree). A
    kit without `bakeCards` keeps the authored card path as before.
    """
    if not kit.get("bakeCards"):
        return False
    skip = kit.get("bakeCardSkipCategories", CARD_SKIP_CATEGORIES)
    if category in skip:
        return False
    return resolve_bake_card(entry)


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
        name: 0.5 for asset in summary["assets"] if asset.get("alphaTest")
        for name in asset.get("materials", [])
    }
    # Billboard cards are cutouts whatever the base asset's mode.
    masked.update({
        name: 0.5 for asset in summary["assets"]
        for name in asset.get("billboardMaterials", [])
    })
    # A non-foliage piece whose NIF tests or blends alpha (an NiAlphaProperty,
    # blender/build_kit.py ALPHA_MASK_MATERIALS) is a cutout at the NIF's own
    # threshold, never opaque (16h check-in 2 item 8).
    for asset in summary["assets"]:
        for name, cutoff in asset.get("alphaMaskMaterials", {}).items():
            masked.setdefault(name, cutoff)
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
            material["alphaCutoff"] = masked[material["name"]]
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
    card_dir = output_glb.parent / f"{kit['id']}-cards"
    if kit.get("bakeCards"):
        card_dir.mkdir(parents=True, exist_ok=True)

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
        # Derived far-tier cards for species with no authored `_lod_flat`
        # (see card_resolution_px / pack_card_tiles above).
        "bakeCards": bool(kit.get("bakeCards", False)),
        "bakeCardSkipCategories": list(
            kit.get("bakeCardSkipCategories", CARD_SKIP_CATEGORIES)),
        "cardResolutionPx": list(
            kit.get("cardResolutionPx", CARD_RESOLUTION_PX)),
        "cardAtlasMaxPx": int(kit.get("cardAtlasMaxPx", CARD_ATLAS_MAX_PX)),
        "cardDir": to_windows(card_dir),
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
    apply_placement_metadata(summary, kit["id"])
    manifest_path = output_glb.with_suffix(".kit.json")
    manifest_path.write_text(json.dumps(summary, indent=1) + "\n")
    # Post-pass: mould tree collision to the real wood geometry (oriented
    # capsule sets, collisionFrame pivot-yup-v3). Runs on the finished GLB, so
    # it lives outside Blender; see pipeline/trunk_solids.py.
    from . import trunk_solids
    trunk_solids.rewrite(manifest_path)
    # Post-pass: the shape facts the placer needs (closed underside, open
    # back, pivot above base). Same reason as trunk_solids — it reads the
    # finished GLB, so it lives outside Blender; see pipeline/vet_kit.py.
    from . import vet_kit
    vet_kit.record_geometry(manifest_path)
    summary = json.loads(manifest_path.read_text())
    # Post-pass (16h K10 ruling D): the three sidecars the placer and the
    # publish read are measured from THIS build, never left from an older one
    # (kit_compress copies whatever sits beside the GLB).
    summary["sidecars"] = measure_sidecars(kit_id, output_glb.parent)
    total_mb = output_glb.stat().st_size / 1e6
    print(f"[kit] {kit_id}: {len(summary['assets'])} assets -> {output_glb.name} "
          f"({total_mb:.1f} MB), manifest {manifest_path.name}")
    # Publish: the raw build above is the measurement product; what ships
    # under apps/world-studio/public/kits/ is its KTX2/meshopt compression
    # (pipeline/kit_compress.py). A kit already published there is
    # refreshed; a first publish is `python3 -m pipeline.kit_compress --kit`.
    from . import kit_compress
    if kit.get("publish", (kit_compress.PUBLIC_KITS / f"{kit_id}.glb").exists()):
        summary["compression"] = kit_compress.publish(kit_id)
    return summary


def measure_sidecars(kit_id: str, kits_dir: Path) -> list[str]:
    """Run `measure_footprints`, `interiors_index` and `measure_connectors`
    (in that order: connectors read the footprints) on one freshly built kit;
    the sidecar file names written. Kits those tools skip (probe, flora and
    groundcover atlases: `measure_footprints.SKIP_PREFIXES`) write none."""
    from . import interiors_index, measure_connectors, measure_footprints
    if kit_id.startswith(measure_footprints.SKIP_PREFIXES):
        return []
    written = [measure_footprints.write_kit(kit_id, kits_dir),
               interiors_index.write_kit(kit_id, kits_dir),
               measure_connectors.write_kit(kit_id, kits_dir,
                                            measure_connectors.load_templates())]
    for path in written:
        print(f"   [kit] sidecar {path.name}")
    return [path.name for path in written]


# Whole kits built side by side: one Wine+Blender per kit, in its own process
# (each kit's work dir is BUILD_DIR/kits/<id>, so two different kits never
# share one; the same kit twice would, so the list is deduplicated). The
# default is floor(7 GiB / one build's peak) capped at 3: settlement-mud-v1
# peaked at 1.2 GiB (process tree RSS) on 2026-09-23, floor(7 / 1.2) = 5, so
# 3; two Blenders in the one WINEPREFIX built byte-identical manifests to a
# serial run (16h ledger §6, lane B2). A big kit (flora-province-v1) was not
# measured: give it --jobs 1 or pair it only with small kits.
DEFAULT_KIT_JOBS = 3


def build_many(kit_ids: list[str], vault: Path, jobs: int = DEFAULT_KIT_JOBS,
               builder=None) -> list[dict]:
    """Build every kit in `kit_ids`, up to `jobs` at once; summaries in order."""
    builder = builder or build
    kit_ids = list(dict.fromkeys(kit_ids))
    if jobs <= 1 or len(kit_ids) <= 1:
        return [builder(kit_id, vault) for kit_id in kit_ids]
    import multiprocessing
    from concurrent.futures import ProcessPoolExecutor
    with ProcessPoolExecutor(max_workers=min(jobs, len(kit_ids)),
                             mp_context=multiprocessing.get_context("fork")) as pool:
        futures = [pool.submit(builder, kit_id, vault) for kit_id in kit_ids]
        return [f.result() for f in futures]


def main() -> None:
    ap = argparse.ArgumentParser(description="Build a world static kit GLB.")
    kits = ap.add_mutually_exclusive_group(required=True)
    kits.add_argument("--kit", help="one kit id")
    kits.add_argument("--kits", help="comma-separated kit ids, built concurrently")
    ap.add_argument("--jobs", type=int, default=DEFAULT_KIT_JOBS,
                    help=f"kits built at once with --kits (default {DEFAULT_KIT_JOBS})")
    ap.add_argument("--vault", default=str(DEFAULT_VAULT))
    args = ap.parse_args()
    if args.kit:
        build(args.kit, Path(args.vault))
        return
    build_many([k for k in args.kits.split(",") if k], Path(args.vault), args.jobs)


if __name__ == "__main__":
    main()
