"""Host-side batch builder for the hand-held item arsenal.

Extracts every declared NIF (Meshes.bsa) and its referenced textures
(Textures.bsa) into one local data-root, then hands a single plan to headless
Wine/Blender, which builds every item and its inventory icon in one session.
Bethesda source bytes stay local; only the emitted GLBs and icons are copied
into the game under its explicit deployment authorization.

Adding an item is one entry in ``config/weapons/<set>.json`` — its class
supplies the size and the sheath socket, so no per-item tuning is needed.
An item may name a ``root`` (a vault-relative data root) instead of taking the
vanilla archives: its NIF is then resolved case-insensitively under that root,
and each texture the NIF references is looked for there first and in the
vanilla texture archive otherwise. A mod that ships no NIF may instead declare
``obj`` plus a ``textures`` map of loose diffuse/normal/specular files, all
relative to the same root; everything downstream of the GLB is identical.

Usage:
    python -m pipeline.build_weapons                 # the whole arsenal
    python -m pipeline.build_weapons --only steel-sword iron-shield
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from .bsa import BSAArchive
from .build import BUILD_DIR, TOOLCHAIN, _expand, _referenced_textures, to_windows
from .build_kit import DirSource
from .models import ROOT

WEAPON_SCRIPT = Path(__file__).resolve().parent / "blender" / "build_weapons.py"
CONFIG = Path(__file__).resolve().parent / "config" / "weapons"
#: Plan-item id suffix for the worn half of an item (an arrow set's quiver).
QUIVER_SUFFIX = "--quiver"


def resolve_set(set_id: str, only: list[str] | None) -> dict:
    """Resolve a declarative item set into flat, validated build entries."""
    config = json.loads((CONFIG / f"{set_id}.json").read_text())
    classes = config["classes"]
    wanted = set(only or [])
    items = []
    seen: set[str] = set()
    for entry in config["items"]:
        item_id = entry["id"]
        if item_id in seen:
            raise ValueError(f"duplicate item id: {item_id}")
        seen.add(item_id)
        if wanted and item_id not in wanted:
            continue
        item_class = entry["class"]
        if item_class not in classes:
            raise ValueError(f"{item_id}: unknown class {item_class}")
        profile = classes[item_class]
        if bool(entry.get("nif")) == bool(entry.get("obj")):
            raise ValueError(f"{item_id}: declare exactly one of nif / obj")
        items.append({
            "id": item_id,
            "itemClass": item_class,
            "material": entry["material"],
            "nif": entry.get("nif"),
            # An OBJ item is a mod that ships no NIF at all (Black Marsh Import):
            # the mesh is a Wavefront OBJ and its maps are loose TGAs named here,
            # because an OBJ carries no Skyrim shader to read them off.
            "obj": entry.get("obj"),
            "textures": dict(entry.get("textures", {})),
            # Optional vault-relative data root for a modded mesh (Animated
            # Armoury and friends ship loose files, not a BSA). Absent means the
            # vanilla archives, byte-for-byte as before.
            "root": entry.get("root"),
            "sheathSocket": entry.get("sheathSocket", profile["sheathSocket"]),
            "target_length": float(entry.get("lengthMeters", profile["lengthMeters"])),
            # A quiver is the *worn* half of the same item: Skyrim ships the
            # back-mounted quiver as `<material>arrow.nif` beside the single
            # projectile `...arrowflight.nif`, so an arrow set builds both from
            # one entry rather than needing a parallel set with its own ids.
            "quiver_nif": entry.get("quiverNif", profile.get("quiverNif")),
            "quiver_target_length": float(entry.get(
                "quiverLengthMeters", profile.get("quiverLengthMeters", 0.0))),
        })
    missing = wanted - seen
    if missing:
        raise ValueError(f"unknown item id(s): {sorted(missing)}")
    if not items:
        raise ValueError("no items selected")
    return {"config": config, "items": items}


#: Longest side of a converted mod texture. Loose TGAs from a mod are authored
#: at 2K-4K; every vanilla weapon in this arsenal textures off 512-1024, and a
#: hand-held prop renders at a few dozen pixels. 1024 keeps the GLBs the same
#: order of size as their neighbours (standard 16: the download is a budget).
MAX_MOD_TEXTURE = 1024


def convert_textures(textures: dict[str, Path], png_dir: Path) -> dict[str, Path]:
    """Re-encode a mod's loose TGA maps to PNG, capped at `MAX_MOD_TEXTURE`.

    glTF carries PNG and JPEG, not TGA (Blender's own TGA reader returns no
    image data for these files), so the conversion happens here, on the host,
    where it is deterministic and testable. The raw TGAs never leave the build.
    """
    from PIL import Image

    png_dir.mkdir(parents=True, exist_ok=True)
    out: dict[str, Path] = {}
    for role, source in textures.items():
        with Image.open(source) as image:
            image = image.convert("RGB")
            longest = max(image.size)
            if longest > MAX_MOD_TEXTURE:
                scale = MAX_MOD_TEXTURE / longest
                image = image.resize(
                    (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
                    Image.LANCZOS)
            dest = png_dir / (source.stem + ".png")
            image.save(dest, format="PNG", optimize=True)
        out[role] = dest
    return out


def _dir_source(cache: dict[str, DirSource], root: str) -> DirSource:
    """One case-insensitive index per mod data root, shared across the batch."""
    if root not in cache:
        path = (ROOT / root).resolve()
        if not path.is_dir():
            raise FileNotFoundError(f"data root not found: {path}")
        cache[root] = DirSource(path)
    return cache[root]


def assemble_data_root(set_id: str, items: list[dict]) -> Path:
    """One data-root for the whole batch; shared textures are extracted once."""
    work = BUILD_DIR / "weapons" / set_id
    data_root = work / "data-root"
    if data_root.exists():
        shutil.rmtree(data_root)
    data_root.mkdir(parents=True, exist_ok=True)

    mesh_bsa = BSAArchive(ROOT / TOOLCHAIN["bsaDir"] / "Skyrim - Meshes.bsa")
    texture_bsa = BSAArchive(ROOT / TOOLCHAIN["bsaDir"] / TOOLCHAIN["textureBsa"])
    roots: dict[str, DirSource] = {}

    def place(item: dict, rel: str, key: str) -> None:
        """Land one NIF in the batch data-root, from its mod root or the BSA."""
        if item["root"]:
            source = _dir_source(roots, item["root"])
            if not source.contains(rel):
                raise KeyError(f"{item['id']}: {rel} not under {item['root']}")
            source.extract_many([rel], data_root)
        else:
            if not mesh_bsa.contains(rel):
                raise KeyError(f"{item['id']}: {rel} not in the mesh archive")
            mesh_bsa.extract([rel], data_root)
        item[key] = data_root / rel

    wanted: set[str] = set()
    # A texture is looked up in the mod root of the item that referenced it
    # first, and in the vanilla archive otherwise.
    texture_roots: dict[str, str | None] = {}
    for item in items:
        if item["obj"]:
            if not item["root"]:
                raise ValueError(f"{item['id']}: an obj item needs a root")
            place(item, item["obj"], "obj_path")
            item["texture_paths"] = {}
            source = _dir_source(roots, item["root"])
            for role, rel in item["textures"].items():
                rel = rel.lower().replace("\\", "/")
                if not source.contains(rel):
                    raise KeyError(f"{item['id']}: {rel} not under {item['root']}")
                source.extract_many([rel], data_root)
                item["texture_paths"][role] = data_root / rel
            continue
        place(item, item["nif"], "nif_path")
        for texture in _referenced_textures(item["nif_path"]):
            wanted.add(texture)
            texture_roots.setdefault(texture, item["root"])
        if item["quiver_nif"]:
            place(item, item["quiver_nif"], "quiver_nif_path")
            for texture in _referenced_textures(item["quiver_nif_path"]):
                wanted.add(texture)
                texture_roots.setdefault(texture, item["root"])

    filled, absent = [], []
    for texture in sorted(wanted):
        root = texture_roots.get(texture)
        source = _dir_source(roots, root) if root else None
        if source is not None and source.contains(texture):
            source.extract_many([texture], data_root)
            filled.append(texture)
        elif texture_bsa.contains(texture):
            texture_bsa.extract([texture], data_root)
            filled.append(texture)
        else:
            absent.append(texture)
    print(f"[weapons] items={len(items)} textures referenced={len(wanted)} "
          f"filled={len(filled)} unresolved={len(absent)}")
    for texture in absent:
        print(f"[weapons]   UNRESOLVED texture: {texture}")
    return work


def build(set_id: str = "arsenal", only: list[str] | None = None) -> dict:
    resolved = resolve_set(set_id, only)
    config, items = resolved["config"], resolved["items"]
    work = assemble_data_root(set_id, items)

    output_dir = (ROOT / config["outputDir"]).resolve()
    quiver_dir = (ROOT / config["quiverDir"]).resolve() if config.get("quiverDir") else None
    if quiver_dir:
        quiver_dir.mkdir(parents=True, exist_ok=True)
    icon_dir = (ROOT / config["iconDir"]).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    icon_dir.mkdir(parents=True, exist_ok=True)

    summary_json = work / "summary.json"
    summary_json.unlink(missing_ok=True)
    plan_items = []
    png_dir = work / "png-textures"
    png_dir.mkdir(parents=True, exist_ok=True)
    for item in items:
        entry = {
            "id": item["id"],
            "target_length": item["target_length"],
            "output_glb": to_windows(output_dir / f"{item['id']}.glb"),
            "icon_png": to_windows(icon_dir / f"{item['id']}.png"),
        }
        if item["obj"]:
            entry["obj"] = to_windows(item["obj_path"])
            entry["textures"] = {
                role: to_windows(path) for role, path
                in convert_textures(item["texture_paths"], png_dir).items()
            }
        else:
            entry["nif"] = to_windows(item["nif_path"])
        plan_items.append(entry)
        if item.get("quiver_nif_path") and quiver_dir:
            # Built through the same session and the same class rules; the icon
            # goes to scratch because a quiver is never an inventory row of its
            # own — it is what wearing the arrows looks like.
            scratch = work / "quiver-icons"
            scratch.mkdir(parents=True, exist_ok=True)
            plan_items.append({
                "id": f"{item['id']}{QUIVER_SUFFIX}",
                "nif": to_windows(item["quiver_nif_path"]),
                "target_length": item["quiver_target_length"],
                "output_glb": to_windows(quiver_dir / f"{item['id']}.glb"),
                "icon_png": to_windows(scratch / f"{item['id']}.png"),
            })
    plan_path = work / "weapons-plan.json"
    plan_path.write_text(json.dumps({
        "addon": TOOLCHAIN["addon"],
        "drop": config.get("dropShapesContaining", []),
        "icon_size": config.get("iconSizePixels", 160),
        "items": plan_items,
        "summary_json": to_windows(summary_json),
    }, indent=2))

    env = dict(os.environ)
    env["WINEPREFIX"] = str(_expand(TOOLCHAIN["winePrefix"]))
    env["WINEDEBUG"] = "-all"
    env["BUILD_PLAN"] = to_windows(plan_path)
    print(f"[weapons] launching headless build for {len(items)} item(s)...")
    proc = subprocess.run(
        [str(_expand(TOOLCHAIN["wine"])), str(_expand(TOOLCHAIN["blender"])),
         "--background", "--python", to_windows(WEAPON_SCRIPT)],
        env=env, capture_output=True, text=True,
        # Every item adds a NIF import, a render and an export to one session.
        timeout=TOOLCHAIN.get("buildTimeoutSeconds", 900) + 30 * len(items),
    )
    completed = any(line.strip() == "SUMMARY_WRITTEN" for line in proc.stdout.splitlines())
    for line in proc.stdout.splitlines():
        if line.startswith("[weapons]"):
            print("   " + line)
    if not completed or not summary_json.exists():
        sys.stderr.write(proc.stdout[-4000:] + proc.stderr[-4000:])
        raise RuntimeError("weapon batch build failed")

    summary = json.loads(summary_json.read_text())
    built = summary.get("items", {})
    for warning in summary.get("warnings", []):
        print(f"[weapons] WARNING {warning}")
    missing = [entry["id"] for entry in plan_items if entry["id"] not in built]
    if missing:
        raise RuntimeError(f"items missing from the build: {missing}")

    # The item manifest is the game's contract: ids, classes, sheath sockets and
    # measured sizes, with no Bethesda filenames in it.
    manifest = {
        "set": set_id,
        "items": {
            item["id"]: {
                "class": item["itemClass"],
                "material": item["material"],
                "sheathSocket": item["sheathSocket"],
                "asset": f"{Path(config['outputDir']).name}/{item['id']}.glb",
                "icon": f"{Path(config['iconDir']).name}/{item['id']}.png",
                "lengthMeters": item["target_length"],
                "sizeMeters": built[item["id"]]["sizeMeters"],
                **({
                    "quiver": f"{Path(config['quiverDir']).name}/{item['id']}.glb",
                    "quiverSizeMeters": built[f"{item['id']}{QUIVER_SUFFIX}"]["sizeMeters"],
                } if item.get("quiver_nif_path") and quiver_dir else {}),
            }
            for item in items
        },
    }
    manifest_path = (ROOT / config.get(
        "manifestOutput", "output/weapon-arsenal.items.json")).resolve()
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    if only and manifest_path.exists():
        # A --only run rebuilds part of a set. Merging rather than replacing is
        # what keeps "rebuild one sword" from quietly deleting the other forty
        # items from the game's item manifest.
        previous = json.loads(manifest_path.read_text())
        merged = dict(previous.get("items", {}))
        merged.update(manifest["items"])
        manifest["items"] = merged
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"[weapons] manifest -> {manifest_path}")
    print(f"[weapons] GLBs -> {output_dir}")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the hand-held item arsenal.")
    parser.add_argument("--set", default="arsenal")
    parser.add_argument("--only", nargs="*", default=None)
    args = parser.parse_args()
    build(args.set, args.only)


if __name__ == "__main__":
    main()
