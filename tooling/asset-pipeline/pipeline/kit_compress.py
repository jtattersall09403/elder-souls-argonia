"""Compress a built kit for shipping, and publish it: KTX2/Basis textures
and meshopt geometry, recorded in the manifest.

    python3 -m pipeline.kit_compress --kit flora-province-v1          # publish
    python3 -m pipeline.kit_compress --kit flora-province-v1 --check  # verify only

The raw build (`output/kits/<id>.glb`, git-ignored) is the MEASUREMENT
product: `trunk_solids`, `vet_kit`, `measure_footprints`, `interiors_index`
and trimesh all parse its plain accessors. What ships under
`apps/world-studio/public/kits/` is the same kit run through gltfpack:

* every image becomes a KTX2 container, UASTC-encoded (`KHR_texture_basisu`)
  — near-lossless (median 39–45 dB PSNR, indistinguishable on inspection)
  and transcoded on the device to BC7 / ASTC, so it STAYS compressed in VRAM
  (a 1024² RGBA8 texture is 5.3 MB with mips; BC7 is 1.3 MB). ETC1S was
  measured and rejected: 22–33 dB, 2–3x the alpha-cutoff flips on foliage
  cards, visibly blocky canopies (docs/research/rendering/
  gpu-texture-and-mesh-compression.md). A kit config may still choose it per
  class (`"compression": {"color": "etc1s"}`) with the numbers in hand;
* geometry keeps float positions and texture coordinates (see
  `gltfpack_args` for why), quantises normals/tangents/colours
  (KHR_mesh_quantization) and is meshopt-compressed
  (EXT_meshopt_compression); the runtime decodes it with
  the wasm decoder three.js bundles (packages/game-core/src/assets/kitLoader.ts);
* node names, material names and glTF extras survive (`-kn -km -ke`): the
  runtime finds assets by node name and reads `assetId`, `lod`, `billboard`
  and `cardSource` from extras.

Owner decision 2026-09-18: this work was pulled forward out of Phase 14
(streaming and deployment) and done in 16f, together with the duplicated
character assets, because the composed Pages site measured 1,041 MB against
the 1 GB limit and 70–91 % of every kit's bytes were PNG.

The manifest gains a `compression` record (tool, settings, bytes before and
after, image count) so the next agent can see what was done, and
`test_kit_compress.py` refuses a published kit without one.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
OUTPUT_KITS = REPO_ROOT / "tooling/asset-pipeline/output/kits"
# Input keys of the last gltfpack run per kit (git-ignored): an unchanged raw
# GLB under the same policy, args, gltfpack build and this file is not
# recompressed (tool-speed review S2a, 18 s a publish); --force re-runs it.
COMPRESS_CACHE = REPO_ROOT / "tooling/asset-pipeline/output/cache/kit-compress"
PUBLIC_KITS = REPO_ROOT / "apps/world-studio/public/kits"
PUBLIC_INTERIORS = REPO_ROOT / "apps/world-studio/public/province/interiors"
CONFIG = Path(__file__).parent / "config" / "kits"
TOOLCHAIN = json.loads((Path(__file__).parent / "config" / "toolchain.json").read_text())

SCHEMA_VERSION = 1
CLASSES = ("color", "normal", "attrib")
DEFAULT_POLICY = {"color": "uastc", "normal": "uastc", "attrib": "uastc", "quality": 8}
TEXTURE_EXTENSION = "KHR_texture_basisu"
MESH_EXTENSION = "EXT_meshopt_compression"

# The three measured sidecars ship beside every published kit pair: the
# settlement compile and the export read them from the SHIPPED build, so a
# kit published without them is a kit the studio cannot snap, foot or enter
# (16h item 6). They are small JSON and count against the site budget like
# everything else under kits/ (tooling/pages-site/compose.mjs walks the tree).
SIDECARS = ("connectors", "footprints", "interiors")
# Architecture measurements have nothing to say about a vegetation atlas:
# measure_connectors/footprints and interiors_index describe snap edges,
# ground contact hulls and interior claims of BUILDINGS. These two kits are
# instanced flora and groundcover, placed by the vegetation renderer, never
# snapped or entered; measuring them would add ~2 MB of meaningless rows to
# the startup payload. Exempt by name, with the reason, never by silence.
SIDECAR_EXEMPT = {
    "flora-province-v1": "vegetation atlas: no snap edges, no footprints, no interiors",
    "groundcover-province-v1": "groundcover atlas: no snap edges, no footprints, no interiors",
}


# The interior loader's per-asset parts (packages/game-core/src/interior/
# kitParts.ts): `kit_parts.mjs` cuts the PUBLISHED GLB into
# public/kits/<kit>/parts/ (one GLB per asset, LOD0 only, textures once per kit
# by URI). Written at the end of every publish, so a kit and its parts never
# disagree; `check` fails a stale or missing parts folder (16k walk 4).
PARTS_WRITER = Path(__file__).with_name("kit_parts.mjs")


def parts_scope() -> set[str]:
    """The kits a published interior cell bundle names in its `kits` table: the
    only kits that publish parts (kit_parts.mjs `scopedKits`, same rule). Parts
    are a second copy of a kit's LOD0 geometry and textures and ship to Pages,
    so an exterior-only kit carries none (16k walk 4, lane PARTS)."""
    if not PUBLIC_INTERIORS.exists():
        return set()
    return {kit for cell in sorted(PUBLIC_INTERIORS.glob("*.json"))
            for kit in json.loads(cell.read_text()).get("kits", {})}


def parts_drawn(kit_id: str) -> set[str]:
    """The assets of `kit_id` the published interior cells DRAW (placements,
    stand-ins, swing doors): the only assets that get a part (kit_parts.mjs
    `drawnAssets`, same rule; review 5536a1d9)."""
    drawn: set[str] = set()
    if not PUBLIC_INTERIORS.exists():
        return drawn
    for path in sorted(PUBLIC_INTERIORS.glob("*.json")):
        cell = json.loads(path.read_text())
        drawn |= {p["assetId"] for p in cell.get("placements", []) if p.get("kit") == kit_id}
        drawn |= {s["standInAsset"] for s in cell.get("substitutions", []) if s.get("kit") == kit_id}
        drawn |= {d["assetId"] for d in cell.get("doors", [])
                  if d.get("doorType") == "swing" and d.get("kit") == kit_id}
    return drawn


def publish_parts(kit_id: str) -> dict | None:
    """Run kit_parts.mjs for one scoped kit; returns the parts index's totals.
    An unscoped kit's parts folder is deleted and None returned."""
    if kit_id not in parts_scope():
        shutil.rmtree(PUBLIC_KITS / kit_id / "parts", ignore_errors=True)
        return None
    proc = subprocess.run(["node", str(PARTS_WRITER), "--kit", kit_id], cwd=REPO_ROOT,
                          capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"kit_parts failed on {kit_id}:\n{proc.stdout[-2000:]}{proc.stderr[-2000:]}")
    index = json.loads((PUBLIC_KITS / kit_id / "parts" / "index.json").read_text())
    return {**index["totals"], "sourceSha256": index["source"]["sha256"]}


def parts_problems(kit_id: str) -> list[str]:
    """Why a kit's parts folder does not match its published GLB (empty = current):
    the index must name the GLB's sha256, list exactly the assets the cells
    draw (`parts_drawn`), and every file it lists must exist at its recorded size. Milliseconds; the writer is deterministic, so a current
    index means current parts."""
    fix = f"node tooling/asset-pipeline/pipeline/kit_parts.mjs --kit {kit_id}"
    folder = PUBLIC_KITS / kit_id / "parts"
    if kit_id not in parts_scope():
        return ([f"{kit_id}: parts folder but named by no interior cell "
                 "(node tooling/asset-pipeline/pipeline/kit_parts.mjs --all deletes it)"]
                if folder.exists() else [])
    index_path = folder / "index.json"
    if not index_path.exists():
        return [f"{kit_id}: no parts folder ({fix})"]
    index = json.loads(index_path.read_text())
    glb = PUBLIC_KITS / f"{kit_id}.glb"
    if index.get("source", {}).get("sha256") != hashlib.sha256(glb.read_bytes()).hexdigest():
        return [f"{kit_id}: parts were cut from another GLB ({fix})"]
    drawn, cut = parts_drawn(kit_id), set(index["assets"])
    if drawn != cut:
        return [f"{kit_id}: parts do not match the assets the cells draw: missing "
                f"{sorted(drawn - cut)[:5]}, undrawn {sorted(cut - drawn)[:5]} ({fix})"]
    missing = [row["file"] for row in index["assets"].values()
               if not (folder / row["file"]).exists() or (folder / row["file"]).stat().st_size != row["bytes"]]
    textures = {h for row in index["assets"].values() for h in row["textures"]}
    missing += [f"tex/{h}.ktx2" for h in sorted(textures) if not (folder / "tex" / f"{h}.ktx2").exists()]
    return [f"{kit_id}: parts files missing or resized: {', '.join(missing[:5])} ({fix})"] if missing else []


def gltfpack_path() -> Path:
    return Path(os.path.expanduser(TOOLCHAIN.get("gltfpack", "~/tools/gltfpack-1.2/gltfpack")))


def policy_for(kit: dict) -> dict:
    """The kit config's `compression` block over the defaults; `false`
    disables compression for that kit (recorded as such)."""
    block = kit.get("compression", {})
    if block is False:
        return {"enabled": False}
    policy = {**DEFAULT_POLICY, **(block or {})}
    for cls in CLASSES:
        if policy[cls] not in ("uastc", "etc1s"):
            raise ValueError(f"{kit.get('id')}: compression.{cls} must be uastc or etc1s")
    policy["enabled"] = True
    return policy


def gltfpack_args(policy: dict, threads: int = 4) -> list[str]:
    # -vpf: float positions. Quantised positions hang every mesh under an
    # extra unnamed node carrying the dequantisation transform, which moves
    # the mesh away from the node whose extras (`lod`, `billboard`,
    # `cardSource`) the runtime reads on the Mesh itself — every LOD level
    # would collapse to 0. Float positions keep the mesh on its named node
    # and cost nothing measurable (groundcover: 5.132 vs 5.136 MB).
    # -vtf: float texture coordinates (12-bit UVs lose 10 % on tiled flora).
    args = ["-cc", "-tc", "-tq", str(policy["quality"]), "-kn", "-km", "-ke", "-vtf", "-vpf",
            "-tj", str(threads)]
    uastc = [cls for cls in CLASSES if policy[cls] == "uastc"]
    if uastc:
        args += ["-tu", ",".join(uastc)]
    return args


def read_gltf_json(glb: Path) -> dict:
    data = glb.read_bytes()
    if data[:4] != b"glTF":
        raise ValueError(f"{glb} is not a GLB")
    length = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20:20 + length])


def describe(glb: Path) -> dict:
    """What a shipped GLB actually carries — the facts the gate checks."""
    gltf = read_gltf_json(glb)
    images = gltf.get("images", [])
    mimes = sorted({i.get("mimeType", "?") for i in images})
    used = set(gltf.get("extensionsUsed", []))
    return {
        "bytes": glb.stat().st_size,
        "images": len(images),
        "imageMimeTypes": mimes,
        "texturesCompressed": bool(images) and mimes == ["image/ktx2"] and TEXTURE_EXTENSION in used,
        "meshesCompressed": MESH_EXTENSION in used,
        "meshes": len(gltf.get("meshes", [])),
    }


def compress(src: Path, dst: Path, policy: dict, threads: int = 4) -> dict:
    """Run gltfpack src -> dst and return the compression record."""
    tool = gltfpack_path()
    if not tool.exists():
        raise RuntimeError(
            f"gltfpack not found at {tool}: download the native build "
            "(https://github.com/zeux/meshoptimizer/releases, gltfpack-ubuntu.zip; the npm "
            "package is built without the Basis encoder) or set toolchain.json `gltfpack`")
    before = src.stat().st_size
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / dst.name
        report = Path(tmp) / "report.json"
        args = gltfpack_args(policy, threads)
        proc = subprocess.run([str(tool), "-i", str(src), "-o", str(out), *args, "-r", str(report)],
                              capture_output=True, text=True)
        if proc.returncode != 0 or not out.exists():
            raise RuntimeError(f"gltfpack failed on {src.name}:\n{proc.stdout[-2000:]}{proc.stderr[-2000:]}")
        warnings = [line for line in (proc.stdout + proc.stderr).splitlines() if line.startswith("Warning")]
        version = subprocess.run([str(tool), "-v"], capture_output=True, text=True).stdout.strip()
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(out), dst)
        facts = describe(dst)
        data = json.loads(report.read_text()) if report.exists() else {}
    if not facts["texturesCompressed"] and facts["images"]:
        raise RuntimeError(f"{dst.name}: gltfpack left {facts['imageMimeTypes']} images")
    return {
        "schemaVersion": SCHEMA_VERSION,
        "tool": version or "gltfpack",
        "args": args,
        "textures": {cls: policy[cls] for cls in CLASSES},
        "textureQuality": policy["quality"],
        "textureContainer": "ktx2",
        "geometry": MESH_EXTENSION,
        "bytesBefore": before,
        "bytesAfter": facts["bytes"],
        "images": facts["images"],
        "imageBytesAfter": data.get("data", {}).get("buffers", {}).get("image"),
        "warnings": warnings,
        "sha256": hashlib.sha256(dst.read_bytes()).hexdigest(),
    }


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def input_key(raw: Path, policy: dict, threads: int) -> str:
    """Everything the compressed GLB and its record are made from: the raw
    GLB's bytes, the policy, the gltfpack args and build, and this module."""
    version = subprocess.run([str(gltfpack_path()), "-v"], capture_output=True,
                             text=True).stdout.strip() if gltfpack_path().exists() else "missing"
    parts = {"raw": _sha256(raw), "policy": policy, "args": gltfpack_args(policy, threads),
             "gltfpack": version, "code": _sha256(Path(__file__))}
    return hashlib.sha256(json.dumps(parts, sort_keys=True).encode()).hexdigest()


def reusable_record(kit_id: str, key: str, dst: Path, published: Path,
                    cache_dir: Path | None = None) -> dict | None:
    """The previous compression record when the last run had this input key
    and the published GLB is still the bytes that run wrote; else None."""
    cache = (cache_dir or COMPRESS_CACHE) / f"{kit_id}.json"
    if not (cache.is_file() and dst.is_file() and published.is_file()):
        return None
    last = json.loads(cache.read_text())
    record = json.loads(published.read_text()).get("compression") or {}
    if last.get("inputKey") != key or record.get("sha256") != last.get("sha256"):
        return None
    if _sha256(dst) != last["sha256"]:
        return None
    return {k: v for k, v in record.items() if k not in ("sidecarBytes", "sidecarsExempt")}


def remember(kit_id: str, key: str, record: dict, cache_dir: Path | None = None) -> None:
    cache_dir = cache_dir or COMPRESS_CACHE
    cache_dir.mkdir(parents=True, exist_ok=True)
    (cache_dir / f"{kit_id}.json").write_text(
        json.dumps({"inputKey": key, "sha256": record["sha256"]}) + "\n")


def sidecar_problems(kit_id: str, public_dir: Path = PUBLIC_KITS) -> list[str]:
    """Why a published kit's sidecars are not acceptable (empty list = fine)."""
    if kit_id in SIDECAR_EXEMPT:
        return []
    missing = [name for name in SIDECARS
               if not (public_dir / f"{kit_id}.{name}.json").is_file()]
    if missing:
        return [f"{kit_id}: published without its {', '.join(missing)} sidecar(s); "
                f"run pipeline.measure_footprints / measure_connectors / interiors_index "
                f"on the raw build and republish"]
    return []


def publish_sidecars(kit_id: str, raw_dir: Path = OUTPUT_KITS,
                     public_dir: Path = PUBLIC_KITS) -> dict:
    """Copy <kit>.connectors/footprints/interiors.json from the raw build to
    the published kits, and return {name: bytes}. A kit the measurements do
    not apply to (SIDECAR_EXEMPT) ships none; any other kit missing one is a
    hard error here rather than a silent gap the export discovers later."""
    written: dict[str, int] = {}
    if kit_id in SIDECAR_EXEMPT:
        return written
    missing = []
    for name in SIDECARS:
        source = raw_dir / f"{kit_id}.{name}.json"
        if not source.is_file():
            missing.append(name)
            continue
        target = public_dir / f"{kit_id}.{name}.json"
        public_dir.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        os.chmod(target, 0o644)
        written[name] = target.stat().st_size
    if missing:
        raise FileNotFoundError(
            f"{kit_id}: raw build has no {', '.join(missing)} sidecar. Measure it "
            f"(pipeline.measure_footprints / measure_connectors / interiors_index "
            f"--kit {kit_id}) or record the kit in kit_compress.SIDECAR_EXEMPT with "
            f"the reason it has none.")
    return written


def publish(kit_id: str, threads: int = 4, force: bool = False) -> dict:
    """``_publish`` holding the kit-list lock EXCLUSIVE (16k r8 rule 4)."""
    from .kit_lock import kit_list_lock
    with kit_list_lock("exclusive", f"kit_compress {kit_id}"):
        return _publish(kit_id, threads, force)


def _publish(kit_id: str, threads: int = 4, force: bool = False) -> dict:
    """Compress output/kits/<id>.glb into public/kits/<id>.glb and copy the
    manifest across with the compression record added. Kits whose config
    `output` already sits under public/ are compressed in place. gltfpack is
    skipped when the input key matches the last run's and the published GLB
    is untouched (`reusable_record`); `force` always re-runs it."""
    kit = json.loads((CONFIG / f"{kit_id}.json").read_text())
    raw = (REPO_ROOT / kit["output"]).resolve()
    manifest_path = raw.with_suffix(".kit.json")
    if not raw.exists() or not manifest_path.exists():
        raise FileNotFoundError(f"{kit_id}: build the kit first ({raw})")
    dst = PUBLIC_KITS / f"{kit_id}.glb"
    policy = policy_for(kit)
    manifest = json.loads(manifest_path.read_text())
    if raw.resolve() == dst.resolve():
        # The kit builds straight into public/: keep the raw build under
        # output/kits/ for the measuring tools, and take it from there when
        # the public copy is already a compressed one.
        keep = OUTPUT_KITS / f"{kit_id}.glb"
        facts = describe(raw)
        if facts["texturesCompressed"] or facts["meshesCompressed"]:
            if not keep.exists():
                raise FileNotFoundError(f"{kit_id}: {dst} is already compressed and no raw build "
                                        f"exists at {keep}; rebuild the kit")
        else:
            OUTPUT_KITS.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(raw, keep)
        raw = keep
    if not policy["enabled"]:
        record = {"schemaVersion": SCHEMA_VERSION, "enabled": False,
                  "bytes": raw.stat().st_size,
                  "reason": kit.get("compressionReason", "disabled in kit config")}
        shutil.copyfile(raw, dst)
    else:
        key = input_key(raw, policy, threads)
        record = None if force else reusable_record(kit_id, key, dst,
                                                    PUBLIC_KITS / f"{kit_id}.kit.json")
        if record is not None:
            print(f"[kit] {kit_id}: gltfpack skipped (raw GLB, policy and tool unchanged; --force re-runs)")
        else:
            record = compress(raw, dst, policy, threads)
            remember(kit_id, key, record)
    published = PUBLIC_KITS / f"{kit_id}.kit.json"
    parts = publish_parts(kit_id)
    if parts is None:
        record.pop("parts", None)
    else:
        record["parts"] = parts
    sidecars = publish_sidecars(kit_id)
    record["sidecarBytes"] = sidecars
    # The single list of kits the three architecture measurements do not apply
    # to travels with the manifest, so the export reads the exemption rather
    # than keeping a second copy of it (export_settlement_bundle.kit_sidecar_errors).
    if kit_id in SIDECAR_EXEMPT:
        record["sidecarsExempt"] = SIDECAR_EXEMPT[kit_id]
    manifest["compression"] = record
    manifest_path.write_text(json.dumps(manifest, indent=1) + "\n")
    if published.resolve() != manifest_path.resolve():
        published.write_text(json.dumps(manifest, indent=1) + "\n")
    if sidecars:
        print(f"[kit] {kit_id}: sidecars " + ", ".join(
            f"{n} {b / 1e3:.1f} kB" for n, b in sorted(sidecars.items())))
    elif kit_id in SIDECAR_EXEMPT:
        print(f"[kit] {kit_id}: no sidecars ({SIDECAR_EXEMPT[kit_id]})")
    parts = record.get("parts")
    if parts is None:
        print(f"[kit] {kit_id}: no parts (named by no interior cell)")
    else:
        print(f"[kit] {kit_id}: parts {parts['parts']} GLBs {parts['partBytes'] / 1e6:.1f} MB + "
              f"{parts['textureFiles']} textures {parts['textureBytes'] / 1e6:.1f} MB -> "
              f"{(PUBLIC_KITS / kit_id / 'parts').relative_to(REPO_ROOT)}")
    if record.get("enabled", True):
        print(f"[kit] {kit_id}: compressed {record['bytesBefore'] / 1e6:.1f} MB -> "
              f"{record['bytesAfter'] / 1e6:.1f} MB ({record['images']} images KTX2, "
              f"{'/'.join(f'{c} {policy[c].upper()}' for c in CLASSES)}, meshopt) "
              f"-> {dst.relative_to(REPO_ROOT)}")
    return record


def check(kit_id: str) -> list[str]:
    """Why a published kit is not acceptable (empty list = fine)."""
    glb = PUBLIC_KITS / f"{kit_id}.glb"
    if not glb.exists():
        return [f"{kit_id}: no published GLB"]
    return (glb_problems(kit_id, glb, PUBLIC_KITS / f"{kit_id}.kit.json") + sidecar_problems(kit_id)
            + parts_problems(kit_id))


def glb_problems(kit_id: str, glb: Path, manifest_path: Path) -> list[str]:
    """Why a GLB and its manifest may not ship (empty list = fine): the
    `--check` rule minus the sidecars, for any pair about to be published.
    16h M19 ruling 5: `export_settlement_bundle --copy-assets` copied the raw
    `output/kits` builds over the compressed ones (K12 B found 15 kits at raw
    size); every writer into public/kits runs this first."""
    problems = []
    try:
        facts = describe(glb)
    except ValueError as exc:
        return [f"{kit_id}: {exc}"]
    record = json.loads(manifest_path.read_text()).get("compression") if manifest_path.exists() else None
    if record is None:
        problems.append(f"{kit_id}: manifest has no `compression` record (published without pipeline.kit_compress)")
    elif record.get("enabled", True):
        if facts["images"] and not facts["texturesCompressed"]:
            problems.append(f"{kit_id}: images are {facts['imageMimeTypes']}, not KTX2")
        if facts["meshes"] and not facts["meshesCompressed"]:
            problems.append(f"{kit_id}: meshes are not meshopt-compressed")
        if record.get("bytesAfter") != facts["bytes"]:
            problems.append(f"{kit_id}: manifest records {record.get('bytesAfter')} B, GLB is {facts['bytes']} B")
    return problems


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--kit", required=True)
    ap.add_argument("--check", action="store_true", help="verify the published kit, do not rebuild")
    ap.add_argument("--sidecars-only", action="store_true",
                    help="republish the measured sidecars beside an already-compressed "
                         "kit, without re-running gltfpack")
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--force", action="store_true",
                    help="re-run gltfpack even when the raw GLB and policy are unchanged")
    args = ap.parse_args()
    if args.check:
        problems = check(args.kit)
        for p in problems:
            print(p)
        sys.exit(1 if problems else 0)
    if args.sidecars_only:
        written = publish_sidecars(args.kit)
        print(f"[kit] {args.kit}: sidecars " + (", ".join(
            f"{n} {b / 1e3:.1f} kB" for n, b in sorted(written.items()))
            or f"none ({SIDECAR_EXEMPT.get(args.kit, 'none measured')})"))
        return
    publish(args.kit, args.threads, force=args.force)


if __name__ == "__main__":
    main()
