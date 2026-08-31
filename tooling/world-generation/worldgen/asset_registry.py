"""Build and query the semantic asset registry (module 90 §72).

**Catalogue wide, kit-compile deep on demand** (module 95, Phase 10): this
sweep tags every mesh in the permitted pools so a compiler or an agent can ask
"what swamp trees do we have, and which have flat LOD billboards?" without
opening a multi-GB archive. Collision, snap points, sockets and LOD chains are
added later, per asset, by whatever kit actually places it.

Rows are one JSON object per line in `world/sources/assets/registry-<pool>.jsonl`
— diff-friendly and streamable. **Never read those files whole**; use the query
side of this module:

    python3 -m worldgen.asset_registry query --category tree --biome swamp --used
    python3 -m worldgen.asset_registry query --pool xanmeer --limit 100
    python3 -m worldgen.asset_registry build            # regenerate everything

Pools are declared in `POOLS`; adding a source means adding a row there.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from .asset_taxonomy import NON_CONTENT_CATEGORIES, classify, normalise
from .esp_index import UNITS_PER_METRE, Plugin

REPO_ROOT = Path(__file__).resolve().parents[3]
REGISTRY_DIR = REPO_ROOT / "world" / "sources" / "assets"

DEFAULT_VAULT = Path(
    os.environ.get(
        "ELDER_SOULS_ASSET_ROOT",
        Path.home() / "workspace/elder-souls-dev/elder-scrolls-asset-pipeline",
    )
)

_LOD_SUFFIX = re.compile(r"(_lod_flat|_lod|_distant)$", re.I)

#: Record types that settle an asset's role better than its file path can.
#: STAT/MSTT/SCOL are deliberately absent — they carry no role information.
#: `TREE`/`FLOR`/`INGR` are deliberately absent: Bethesda files lilypads,
#: reeds and chickweed as `TREE` records, so the record type would *lose*
#: information the path already carries correctly.
RECORD_TYPE_CATEGORY = {
    "CONT": "container",
    "FURN": "furniture",
    "DOOR": "door",
    "LIGH": "light",
    "NPC_": "creature",
    "WEAP": "weapon",
    "AMMO": "ammo",
    "ARMO": "armour",
}


@dataclass
class Pool:
    """One permitted asset source and how to enumerate its meshes."""

    id: str
    label: str
    source: str
    credit: str
    #: Either a manifest file listing paths, or a directory to walk.
    manifest: str | None = None
    directory: str | None = None
    #: Plugins that name and dimension this pool's assets.
    plugins: list[str] = field(default_factory=list)
    #: Path prefix stripped before the semantic id (case-insensitive).
    strip_prefix: str = "meshes/"


POOLS: tuple[Pool, ...] = (
    Pool(
        id="bmv",
        label="Black Marsh & Valenwood",
        source="https://www.moddb.com/mods/black-marsh-valenwood",
        credit="Black Marsh & Valenwood (ModDB), bundling many credited modder resources",
        manifest="{repo}/tooling/asset-pipeline/black-marsh-mod-source/manifest-data1.txt",
        plugins=[
            "{repo}/tooling/asset-pipeline/black-marsh-mod-source/plugins/Black Marsh.esm",
            "{repo}/tooling/asset-pipeline/black-marsh-mod-source/plugins/Black Marsh North.esp",
            "{repo}/tooling/asset-pipeline/black-marsh-mod-source/plugins/Valenwood.esp",
        ],
    ),
    Pool(
        id="vanilla",
        label="Vanilla Skyrim (Bethesda)",
        source="Skyrim - Meshes.bsa (owner's copy of the game)",
        credit="Skyrim vanilla assets (Bethesda)",
        manifest="{vault}/skyrim-source/manifest-skyrim-meshes.txt",
        plugins=[
            "{vault}/skyrim-source/Data/Skyrim.esm",
            "{vault}/skyrim-source/Data/Update.esm",
        ],
    ),
    Pool(
        id="tropical",
        label="Tropical Skyrim — A Climate Overhaul",
        source="https://www.nexusmods.com/skyrim/mods/33017",
        credit="Tropical Skyrim (Nexus classic 33017, Soolie)",
        directory="{vault}/skyrim-source/mod-sources/tropical-skyrim-33017/extracted",
        plugins=[
            "{vault}/skyrim-source/mod-sources/tropical-skyrim-33017/extracted/Tropical Skyrim.esp",
            "{vault}/skyrim-source/mod-sources/tropical-skyrim-33017/extracted/"
            "Tropical Skyrim -- Birds.esp",
        ],
    ),
    Pool(
        id="xanmeer",
        label="Argonian Xanmeer Tileset — Modder's Resource",
        source="https://www.nexusmods.com/skyrimspecialedition/mods/181193",
        credit="Argonian Xanmeer Tileset (Nexus SSE 181193, DarthVitrial)",
        directory="{vault}/skyrim-source/mod-sources/xanmeer-tileset-181193/extracted",
        plugins=[
            "{vault}/skyrim-source/mod-sources/xanmeer-tileset-181193/extracted/"
            "XanmeerResources.esp",
        ],
    ),
)


def _resolve(template: str, vault: Path) -> Path:
    return Path(template.format(repo=REPO_ROOT, vault=vault))


def _paths_for(pool: Pool, vault: Path) -> list[str]:
    if pool.manifest:
        manifest = _resolve(pool.manifest, vault)
        if not manifest.exists():
            return []
        return [
            line.strip() for line in manifest.read_text(errors="replace").splitlines()
            if line.strip().lower().endswith(".nif")
        ]
    directory = _resolve(pool.directory or "", vault)
    if not directory.exists():
        return []
    return [
        str(p.relative_to(directory)) for p in directory.rglob("*")
        if p.is_file() and p.suffix.lower() == ".nif"
    ]


def _semantic_id(pool: Pool, path: str) -> str:
    norm = normalise(path)
    prefix = pool.strip_prefix
    if prefix and norm.startswith(prefix):
        norm = norm[len(prefix):]
    return f"{pool.id}:{norm[:-4] if norm.endswith('.nif') else norm}"


def _plugin_facts(pool: Pool, vault: Path) -> dict[str, dict]:
    """Model path -> editor ids and metre dimensions, from this pool's plugins."""
    facts: dict[str, dict] = {}
    for template in pool.plugins:
        path = _resolve(template, vault)
        if not path.exists():
            continue
        plugin = Plugin(path)
        for base in plugin.base_objects().values():
            key = base.model_key
            if not key:
                continue
            entry = facts.setdefault(key, {"editorIds": [], "recordTypes": []})
            if base.editor_id and base.editor_id not in entry["editorIds"]:
                entry["editorIds"].append(base.editor_id)
            if base.type not in entry["recordTypes"]:
                entry["recordTypes"].append(base.type)
            if base.bounds and "sizeM" not in entry:
                x1, y1, z1, x2, y2, z2 = base.bounds
                entry["sizeM"] = [
                    round((x2 - x1) / UNITS_PER_METRE, 3),
                    round((y2 - y1) / UNITS_PER_METRE, 3),
                    round((z2 - z1) / UNITS_PER_METRE, 3),
                ]
                entry["originOffsetUnits"] = [x1, y1, z1]
    return facts


def _usage_from_mining() -> dict[str, dict]:
    """How often each mesh was actually placed in the mined worldspaces."""
    usage: dict[str, dict] = {}
    placement_dir = REPO_ROOT / "world" / "sources" / "placement"
    for report in sorted(placement_dir.glob("*-placement.json")):
        data = json.loads(report.read_text())
        label = report.stem.replace("-placement", "")
        for species, profile in data.get("species", {}).items():
            if "#" in species or species.startswith("edid:"):
                continue  # a reference into a master we do not hold
            entry = usage.setdefault(species, {"observedIn": [], "observedUses": 0})
            entry["observedIn"].append(label)
            entry["observedUses"] += profile["count"]
            entry.setdefault("observedScaleP50", profile.get("scale", {}).get("p50"))
    return usage


def build(vault: Path = DEFAULT_VAULT) -> dict:
    REGISTRY_DIR.mkdir(parents=True, exist_ok=True)
    usage = _usage_from_mining()
    summary: dict[str, dict] = {}

    for pool in POOLS:
        paths = _paths_for(pool, vault)
        facts = _plugin_facts(pool, vault)
        # LOD siblings: `x_lod_flat.nif` next to `x.nif` is a ready-made
        # impostor for the T4 tier (module 65 §110).
        stems = {normalise(p)[:-4] for p in paths}
        rows: list[dict] = []
        skipped: Counter = Counter()
        for path in sorted(set(paths)):
            norm = normalise(path)
            info = classify(norm)
            if info.category in NON_CONTENT_CATEGORIES:
                skipped[info.category] += 1
                continue
            row = {
                "id": _semantic_id(pool, norm),
                "pool": pool.id,
                "path": norm,
                "category": info.category,
                "confidence": info.confidence,
            }
            if info.cultures:
                row["cultures"] = list(info.cultures)
            if info.biomes:
                row["biomes"] = list(info.biomes)
            if info.tags:
                row["tags"] = list(info.tags)
            base_stem = norm[:-4]
            for suffix in ("_lod_flat", "_lod", "_distant"):
                if base_stem + suffix in stems:
                    row["lodVariant"] = base_stem + suffix + ".nif"
                    break
            # Plugin MODL paths and mined species keys are relative to the
            # data root's `meshes/`, so join on the stripped path.
            model_key = norm[len(pool.strip_prefix):] if norm.startswith(
                pool.strip_prefix) else norm
            row.update(facts.get(model_key, {}))
            # A plugin's record type is direct evidence and beats the path
            # guess: an urn filed under architecture/ is still a container.
            for record_type, refined in RECORD_TYPE_CATEGORY.items():
                if record_type in row.get("recordTypes", ()):
                    row["category"] = refined
                    row["confidence"] = 0.95
                    break
            observed = usage.get(model_key)
            if observed:
                row.update(observed)
            rows.append(row)

        out = REGISTRY_DIR / f"registry-{pool.id}.jsonl"
        with out.open("w") as fh:
            for row in rows:
                fh.write(json.dumps(row, separators=(",", ":")) + "\n")
        summary[pool.id] = {
            "label": pool.label,
            "source": pool.source,
            "credit": pool.credit,
            "meshesSeen": len(set(paths)),
            "registered": len(rows),
            "skippedNonContent": dict(skipped),
            "categories": dict(Counter(r["category"] for r in rows).most_common()),
            "withLodVariant": sum(1 for r in rows if "lodVariant" in r),
            "withDimensions": sum(1 for r in rows if "sizeM" in r),
            "observedPlaced": sum(1 for r in rows if "observedUses" in r),
        }
        print(f"{pool.id:9s} {len(rows):6d} rows  ({len(set(paths))} meshes seen)")

    summary_path = REGISTRY_DIR / "registry-summary.json"
    summary_path.write_text(json.dumps({"pools": summary}, indent=1) + "\n")
    return summary


# --- query -------------------------------------------------------------------


def load(pools: list[str] | None = None):
    for path in sorted(REGISTRY_DIR.glob("registry-*.jsonl")):
        pool = path.stem.replace("registry-", "")
        if pools and pool not in pools:
            continue
        with path.open() as fh:
            for line in fh:
                yield json.loads(line)


def query(args) -> None:
    matches = []
    for row in load(args.pool):
        if args.category and row["category"] not in args.category:
            continue
        if args.biome and not set(args.biome) & set(row.get("biomes", ())):
            continue
        if args.culture and not set(args.culture) & set(row.get("cultures", ())):
            continue
        if args.used and "observedUses" not in row:
            continue
        if args.contains and args.contains.lower() not in row["path"]:
            continue
        matches.append(row)
    matches.sort(key=lambda r: (-r.get("observedUses", 0), r["id"]))
    print(f"{len(matches)} match(es)" + ("" if len(matches) <= args.limit else
                                         f", showing {args.limit}"))
    for row in matches[: args.limit]:
        uses = f"{row['observedUses']:6d} placed" if "observedUses" in row else " " * 12
        size = (
            "  ".join(f"{v:5.2f}" for v in row["sizeM"]) if "sizeM" in row else ""
        )
        tags = ",".join(row.get("biomes", []) + row.get("cultures", []))
        print(f"{row['id']:62s} {row['category']:14s} {uses}  {size:20s} {tags}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="command", required=True)

    build_cmd = sub.add_parser("build", help="regenerate every pool's registry")
    build_cmd.add_argument("--vault", default=str(DEFAULT_VAULT))

    q = sub.add_parser("query", help="search the registry")
    q.add_argument("--pool", action="append")
    q.add_argument("--category", action="append")
    q.add_argument("--biome", action="append")
    q.add_argument("--culture", action="append")
    q.add_argument("--contains")
    q.add_argument("--used", action="store_true",
                   help="only assets a shipped world actually placed")
    q.add_argument("--limit", type=int, default=40)

    args = ap.parse_args()
    if args.command == "build":
        build(Path(args.vault))
    else:
        query(args)


if __name__ == "__main__":
    main()
