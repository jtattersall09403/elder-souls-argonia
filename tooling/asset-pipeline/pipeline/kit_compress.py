"""Compress a built kit for shipping, and publish it: KTX2/Basis textures
and meshopt geometry, recorded in the manifest.

    python3 -m pipeline.kit_compress --kit flora-province-v1          # publish
    python3 -m pipeline.kit_compress --kit flora-province-v1 --check  # verify only

The raw build (`output/kits/<id>.glb`, git-ignored) is the MEASUREMENT
product: `trunk_solids`, `vet_kit`, `measure_footprints`, `interiors_index`
and trimesh all parse its plain accessors. What ships under
`apps/world-studio/public/kits/` is the same kit run through gltfpack and
cut into per-asset parts (decision 0120; no whole GLB ships):

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
CONFIG = Path(__file__).parent / "config" / "kits"
TOOLCHAIN = json.loads((Path(__file__).parent / "config" / "toolchain.json").read_text())

SCHEMA_VERSION = 1
# The published `<kit>.kit.json` (standard 6). Readers: packages/game-core
# settlement/kit.ts kitAssetMetaFromManifest and kit_parts.mjs (assets list).
KIT_MANIFEST_SCHEMA_VERSION = 1
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


# Parts (decision 0120, schema 4): a kit ships ONLY as parts. gltfpack packs
# the raw build into a temporary GLB beside public/kits/, `kit_parts.mjs` cuts
# it into public/kits/<kit>/parts/ (one GLB per manifest asset, every LOD) with
# its KTX2 textures in the province pool public/kits/tex/, and the temporary
# GLB is deleted. The parts index records the raw build's sha256 (`source`),
# which `check` compares, and the packed GLB's (`packed`), which the manifest's
# compression record names.
PARTS_WRITER = Path(__file__).with_name("kit_parts.mjs")
PARTS_SCHEMA_VERSION = 4


def parts_index_path(kit_id: str, public_dir: Path | None = None) -> Path:
    return (public_dir or PUBLIC_KITS) / kit_id / "parts" / "index.json"


def published_gltf(kit_id: str, public_dir: Path | None = None) -> dict:
    """The glTF JSON of a published kit as ONE document: every part's JSON
    chunk concatenated, its index references offset so the result reads like
    the whole packed kit (scene roots = the asset roots, in index order). For
    checks on names, extras, materials and accessor bounds of what ships;
    binary chunks are not read (a buffer keeps its part's byteLength)."""
    index_path = parts_index_path(kit_id, public_dir)
    rows = json.loads(index_path.read_text())["assets"]
    keys = ("nodes", "meshes", "materials", "accessors", "bufferViews", "buffers",
            "textures", "images", "samplers")
    out: dict = {k: [] for k in keys}
    out.update(scene=0, scenes=[{"nodes": []}])

    def texture_refs(value, off: int, key: str = ""):
        """kit_parts.mjs `remapTextureRefs`: a `*Texture` object's `index`."""
        if isinstance(value, list):
            return [texture_refs(v, off) for v in value]
        if not isinstance(value, dict):
            return value
        copy = {k: texture_refs(v, off, k) for k, v in value.items()}
        if key.endswith("Texture") and isinstance(value.get("index"), int):
            copy["index"] = value["index"] + off
        return copy

    for asset_id in rows:
        doc = read_gltf_json(index_path.parent / rows[asset_id]["file"])
        off = {k: len(out[k]) for k in keys}
        for n in doc.get("nodes", []):
            n = dict(n)
            if "mesh" in n:
                n["mesh"] += off["meshes"]
            if "children" in n:
                n["children"] = [c + off["nodes"] for c in n["children"]]
            out["nodes"].append(n)
        for m in doc.get("meshes", []):
            prims = []
            for p in m.get("primitives", []):
                p = {**p, "attributes": {k: v + off["accessors"] for k, v in p["attributes"].items()}}
                if "indices" in p:
                    p["indices"] += off["accessors"]
                if "material" in p:
                    p["material"] += off["materials"]
                prims.append(p)
            out["meshes"].append({**m, "primitives": prims})
        out["materials"] += [texture_refs(m, off["textures"]) for m in doc.get("materials", [])]
        out["accessors"] += [{**a, "bufferView": a["bufferView"] + off["bufferViews"]}
                             if "bufferView" in a else a for a in doc.get("accessors", [])]
        for v in doc.get("bufferViews", []):
            v = {**v, "buffer": v["buffer"] + off["buffers"]}
            if MESH_EXTENSION in v.get("extensions", {}):
                ext = v["extensions"][MESH_EXTENSION]
                v["extensions"] = {MESH_EXTENSION: {**ext, "buffer": ext["buffer"] + off["buffers"]}}
            out["bufferViews"].append(v)
        out["buffers"] += doc.get("buffers", [])
        for t in doc.get("textures", []):
            t = dict(t)
            if "source" in t:
                t["source"] += off["images"]
            if "sampler" in t:
                t["sampler"] += off["samplers"]
            if TEXTURE_EXTENSION in t.get("extensions", {}):
                ext = t["extensions"][TEXTURE_EXTENSION]
                t["extensions"] = {**t["extensions"], TEXTURE_EXTENSION: {**ext, "source": ext["source"] + off["images"]}}
            out["textures"].append(t)
        out["images"] += [{**i, "bufferView": i["bufferView"] + off["bufferViews"]}
                          if "bufferView" in i else i for i in doc.get("images", [])]
        out["samplers"] += doc.get("samplers", [])
        out["scenes"][0]["nodes"] += [r + off["nodes"] for r in doc["scenes"][doc.get("scene", 0)]["nodes"]]
    return out


def publish_parts(kit_id: str, packed: Path, raw: Path) -> dict:
    """Cut the packed GLB into the kit's parts (kit_parts.mjs); returns the
    parts index's totals with the source and packed sha256."""
    proc = subprocess.run(["node", str(PARTS_WRITER), "--kit", kit_id, "--glb", str(packed),
                           "--raw", str(raw)], cwd=REPO_ROOT, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"kit_parts failed on {kit_id}:\n{proc.stdout[-2000:]}{proc.stderr[-2000:]}")
    index = json.loads(parts_index_path(kit_id).read_text())
    return {**index["totals"], "sourceSha256": index["source"]["sha256"],
            "packedSha256": index["packed"]["sha256"]}


def parts_problems(kit_id: str, raw: Path | None = None, public_dir: Path | None = None) -> list[str]:
    """Why a kit's published parts are not shippable (empty = current): the
    index is schema 4, names the packed GLB the manifest's compression record
    names, holds a part for every manifest asset, and every file it lists
    exists at its recorded size. With `raw` (the raw build, when present on
    this machine): the index was cut from those bytes. Milliseconds; the writer
    is deterministic, so a current index means current parts."""
    fix = f"python3 -m pipeline.kit_compress --kit {kit_id}"
    public_dir = public_dir or PUBLIC_KITS
    folder = public_dir / kit_id / "parts"
    index_path = folder / "index.json"
    if not index_path.exists():
        return [f"{kit_id}: no parts index ({fix})"]
    index = json.loads(index_path.read_text())
    if index.get("schemaVersion") != PARTS_SCHEMA_VERSION:
        return [f"{kit_id}: parts index schemaVersion {index.get('schemaVersion')}, "
                f"writer is {PARTS_SCHEMA_VERSION} ({fix})"]
    manifest_path = public_dir / f"{kit_id}.kit.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    record = manifest.get("compression") or {}
    if record.get("sha256") != index.get("packed", {}).get("sha256"):
        return [f"{kit_id}: parts were cut from another packed GLB than the manifest records ({fix})"]
    if raw is not None and raw.exists() and index.get("source", {}).get("sha256") != _sha256(raw):
        return [f"{kit_id}: parts were cut from another raw build than {raw.name} ({fix})"]
    wanted, cut = {a["id"] for a in manifest.get("assets", [])}, set(index["assets"])
    if wanted - cut:
        return [f"{kit_id}: parts lack manifest asset(s) {sorted(wanted - cut)[:5]} ({fix})"]
    missing = [row["file"] for row in index["assets"].values()
               if not (folder / row["file"]).exists() or (folder / row["file"]).stat().st_size != row["bytes"]]
    textures = {h for row in index["assets"].values() for h in row["textures"]}
    missing += [f"tex/{h}.ktx2" for h in sorted(textures) if not (public_dir / "tex" / f"{h}.ktx2").exists()]
    return [f"{kit_id}: parts files missing or resized: {', '.join(missing[:5])} ({fix})"] if missing else []


def pool_problems() -> list[str]:
    """Pool textures (public/kits/tex/) no `<kit>/parts/index.json` references
    (kit_parts.mjs `orphanPoolFiles`, same rule): each one ships for nothing."""
    pool = PUBLIC_KITS / "tex"
    if not pool.exists():
        return []
    used = {f"{h}.ktx2" for index in sorted(PUBLIC_KITS.glob("*/parts/index.json"))
            for row in json.loads(index.read_text()).get("assets", {}).values()
            for h in row.get("textures", [])}
    orphans = sorted(p.name for p in pool.iterdir() if p.name not in used)
    return ([f"tex pool: {len(orphans)} file(s) no parts index references, e.g. {orphans[:3]} "
             "(node tooling/asset-pipeline/pipeline/kit_parts.mjs --prune deletes them)"] if orphans else [])


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
    parts = {"raw": _sha256(raw), "policy": policy,
             "args": gltfpack_args(policy, threads) if policy["enabled"] else [],
             "gltfpack": version, "code": _sha256(Path(__file__))}
    return hashlib.sha256(json.dumps(parts, sort_keys=True).encode()).hexdigest()


def reusable_record(kit_id: str, key: str, cache_dir: Path | None = None,
                    public_dir: Path | None = None) -> dict | None:
    """The previous compression record when the last run had this input key
    and the published parts were cut from the bytes that run packed; else None."""
    public_dir = public_dir or PUBLIC_KITS
    cache = (cache_dir or COMPRESS_CACHE) / f"{kit_id}.json"
    published, index = public_dir / f"{kit_id}.kit.json", parts_index_path(kit_id, public_dir)
    if not (cache.is_file() and published.is_file() and index.is_file()):
        return None
    last = json.loads(cache.read_text())
    record = json.loads(published.read_text()).get("compression") or {}
    packed = json.loads(index.read_text()).get("packed", {}).get("sha256")
    if last.get("inputKey") != key or not (record.get("sha256") == last.get("sha256") == packed):
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
    """Pack output/kits/<id>.glb into a temporary GLB, cut it into
    public/kits/<id>/parts/ and copy the manifest across with the compression
    record added. Nothing is packed or cut when the input key matches the
    last run's and the parts index still names that run's packed GLB
    (`reusable_record`); `force` always re-runs."""
    kit = json.loads((CONFIG / f"{kit_id}.json").read_text())
    raw = (REPO_ROOT / kit["output"]).resolve()
    manifest_path = raw.with_suffix(".kit.json")
    if not raw.exists() or not manifest_path.exists():
        raise FileNotFoundError(f"{kit_id}: build the kit first ({raw})")
    if raw.parent.resolve() == PUBLIC_KITS.resolve():
        raise ValueError(f"{kit_id}: config `output` is under public/kits; kits build into output/kits/")
    policy = policy_for(kit)
    manifest = json.loads(manifest_path.read_text())
    published = PUBLIC_KITS / f"{kit_id}.kit.json"
    key = input_key(raw, policy, threads)
    record = None if force else reusable_record(kit_id, key)
    if record is not None:
        print(f"[kit] {kit_id}: pack and cut skipped (raw GLB, policy and tool unchanged; --force re-runs)")
    else:
        PUBLIC_KITS.mkdir(parents=True, exist_ok=True)
        packed = PUBLIC_KITS / f".{kit_id}.packing.glb"
        try:
            if policy["enabled"]:
                record = compress(raw, packed, policy, threads)
            else:
                shutil.copyfile(raw, packed)
                record = {"schemaVersion": SCHEMA_VERSION, "enabled": False,
                          "bytes": raw.stat().st_size,
                          "reason": kit.get("compressionReason", "disabled in kit config"),
                          "sha256": _sha256(packed)}
            # The parts writer reads the manifest's asset list from public/.
            published.write_text(json.dumps(manifest, indent=1) + "\n")
            record["parts"] = publish_parts(kit_id, packed, raw)
        finally:
            packed.unlink(missing_ok=True)
        remember(kit_id, key, record)
    sidecars = publish_sidecars(kit_id)
    record["sidecarBytes"] = sidecars
    # The single list of kits the three architecture measurements do not apply
    # to travels with the manifest, so the export reads the exemption rather
    # than keeping a second copy of it (export_settlement_bundle.kit_sidecar_errors).
    if kit_id in SIDECAR_EXEMPT:
        record["sidecarsExempt"] = SIDECAR_EXEMPT[kit_id]
    manifest["schemaVersion"] = KIT_MANIFEST_SCHEMA_VERSION
    manifest["compression"] = record
    manifest_path.write_text(json.dumps(manifest, indent=1) + "\n")
    published.write_text(json.dumps(manifest, indent=1) + "\n")
    if sidecars:
        print(f"[kit] {kit_id}: sidecars " + ", ".join(
            f"{n} {b / 1e3:.1f} kB" for n, b in sorted(sidecars.items())))
    elif kit_id in SIDECAR_EXEMPT:
        print(f"[kit] {kit_id}: no sidecars ({SIDECAR_EXEMPT[kit_id]})")
    parts = record["parts"]
    print(f"[kit] {kit_id}: parts {parts['parts']} GLBs {parts['partBytes'] / 1e6:.1f} MB + "
          f"{parts['textureFiles']} textures {parts['textureBytes'] / 1e6:.1f} MB -> "
          f"{(PUBLIC_KITS / kit_id / 'parts').relative_to(REPO_ROOT)}")
    if record.get("enabled", True):
        print(f"[kit] {kit_id}: compressed {record['bytesBefore'] / 1e6:.1f} MB -> "
              f"{record['bytesAfter'] / 1e6:.1f} MB packed ({record['images']} images KTX2, "
              f"{'/'.join(f'{c} {policy[c].upper()}' for c in CLASSES)}, meshopt)")
    return record


def raw_build(kit_id: str) -> Path | None:
    """The raw build a kit config names (git-ignored; absent on CI)."""
    config = CONFIG / f"{kit_id}.json"
    return (REPO_ROOT / json.loads(config.read_text())["output"]).resolve() if config.exists() else None


def check(kit_id: str) -> list[str]:
    """Why a published kit is not acceptable (empty list = fine)."""
    return (published_problems(kit_id) + sidecar_problems(kit_id)
            + parts_problems(kit_id, raw_build(kit_id)) + pool_problems())


def published_problems(kit_id: str, public_dir: Path | None = None) -> list[str]:
    """Why a published kit's manifest may not ship (empty list = fine): it
    carries a `compression` record, and a compressed kit's record names KTX2
    images and meshopt geometry. 16h M19 ruling 5: `export_settlement_bundle
    --copy-assets` once copied raw `output/kits` builds over compressed ones;
    every writer into public/kits runs this first."""
    manifest_path = (public_dir or PUBLIC_KITS) / f"{kit_id}.kit.json"
    if not manifest_path.exists():
        return [f"{kit_id}: no published manifest"]
    record = json.loads(manifest_path.read_text()).get("compression")
    if record is None:
        return [f"{kit_id}: manifest has no `compression` record (published without pipeline.kit_compress)"]
    problems = []
    if record.get("enabled", True):
        if record.get("textureContainer") != "ktx2":
            problems.append(f"{kit_id}: compression record names no KTX2 textures")
        if record.get("geometry") != MESH_EXTENSION:
            problems.append(f"{kit_id}: compression record names no meshopt geometry")
    if not record.get("sha256"):
        problems.append(f"{kit_id}: compression record has no packed sha256")
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
