"""Physical body summaries from exported authorities, never invented gameplay data.

One hydraulic owner can span several semantic classes. Basin membership does
not imply a shared head. Bounds include the potential-stage domain, not a
promise that every point inside the rectangle is wet or navigable.
"""
import numpy as np


def compile_body_records(meta: dict, fields: dict) -> list[dict]:
    owners = fields["bodies2"]
    height, width = owners.shape
    count = 65536
    bounds = np.full((count, 4), np.inf)
    bounds[:, 2:] = -np.inf
    head_min, head_max = np.full(count, np.inf), np.full(count, -np.inf)
    classes = np.zeros(count, dtype=np.uint32)
    band_min, band_max = np.full(count, 255, dtype=np.int16), np.zeros(count, dtype=np.int16)
    mpp = meta["surface"]["metresPerPixel"]
    origin = meta["surface"].get("gridOriginM", 0)
    cmpp = meta["klass"]["metresPerPixel"]
    corigin = meta["klass"].get("gridOriginM", cmpp * .5)
    cx = np.clip(np.rint((origin + np.arange(width) * mpp - corigin) / cmpp).astype(int), 0, fields["cls"].shape[1] - 1)
    # Row-bounded temporaries; do not materialize multiple province-sized X/Z grids.
    for z in range(height):
        valid = fields["support2"][z].astype(bool) & (owners[z] != 0)
        x = np.flatnonzero(valid)
        if not len(x):
            continue
        ids = owners[z, x].astype(int)
        if np.any(ids >= count):
            raise ValueError("Water body owner exceeds RG16 domain")
        wx, wz = origin + x * mpp, origin + z * mpp
        np.minimum.at(bounds[:, 0], ids, wx - mpp / 2)
        np.minimum.at(bounds[:, 1], ids, wz - mpp / 2)
        np.maximum.at(bounds[:, 2], ids, wx + mpp / 2)
        np.maximum.at(bounds[:, 3], ids, wz + mpp / 2)
        heads = fields["w2"][z, x]
        if not np.all(np.isfinite(heads)):
            raise ValueError("Non-finite body surface")
        np.minimum.at(head_min, ids, heads)
        np.maximum.at(head_max, ids, heads)
        cz = int(np.clip(round((wz - corigin) / cmpp), 0, fields["cls"].shape[0] - 1))
        semantic = fields["cls"][cz, cx[x]].astype(np.uint32)
        if np.any(semantic >= len(meta["klass"]["classes"])):
            raise ValueError("Unknown water semantic class")
        np.bitwise_or.at(classes, ids, np.left_shift(np.uint32(1), semantic))
        bands = fields["river_band"][cz, cx[x]]
        np.minimum.at(band_min, ids, bands)
        np.maximum.at(band_max, ids, bands)

    channels: dict[int, list[str]] = {}
    for ribbon in meta.get("ribbons", []):
        owner = int(ribbon["bodyIndex"])
        if owner < 1 or owner >= count:
            raise ValueError("Invalid channel owner")
        channels.setdefault(owner, []).append(ribbon["id"])
        classes[owner] |= 1 << meta["klass"]["classes"].index("river")
        band_min[owner] = min(band_min[owner], ribbon["riverBand"])
        band_max[owner] = max(band_max[owner], ribbon["riverBand"])
        for point in ribbon["points"]:
            section = point.get("crossSection", [])
            radius = max([point["halfWidthM"], abs(point.get("crossSectionMinOffsetM", 0)),
                          abs(point.get("crossSectionMaxOffsetM", 0))] + [abs(p["offsetM"]) for p in section])
            bounds[owner, :2] = np.minimum(bounds[owner, :2], [point["x"] - radius, point["z"] - radius])
            bounds[owner, 2:] = np.maximum(bounds[owner, 2:], [point["x"] + radius, point["z"] + radius])
            head_min[owner] = min(head_min[owner], point["y"])
            head_max[owner] = max(head_max[owner], point["y"])

    records = []
    for identity in fields["body_records"]:
        owner = identity["index"]
        # Reduction can remove an unused tiny owner. Keep every referenced
        # owner, but do not publish an invented empty bounding rectangle.
        if not np.isfinite(bounds[owner]).all():
            continue
        if owner in channels:
            surface = {"kind": "channel-network", "ribbonIds": sorted(channels[owner]), "field": "surface"}
        elif head_min[owner] == head_max[owner]:
            surface = {"kind": "standing-plane", "baseHeightM": float(head_min[owner])}
        else:
            surface = {"kind": "field", "field": "surface"}
        records.append({
            **identity, "schemaVersion": 1,
            "bounds": dict(zip(("minX", "minZ", "maxX", "maxZ"), map(float, bounds[owner]))),
            "semanticClasses": [name for i, name in enumerate(meta["klass"]["classes"])
                                if i and classes[owner] & (1 << i)],
            "riverBandRange": [int(band_min[owner]), int(band_max[owner])],
            "surface": surface,
            "fields": {"depth": "surface.depthProxy", "flow": "flow+ribbons",
                       "access": "surface.access+ribbons", "optics": "klass+shore+character",
                       "levels": "access+shore+ribbons", "ground": "native-terrain"},
            "rendererProfile": "province-semantic-v2",
        })
    known = {r["index"] for r in records}
    referenced = set(map(int, np.unique(owners[fields["support2"].astype(bool)]))) - {0}
    if not (referenced | channels.keys()) <= known:
        raise ValueError("Physical water owner has no stable identity")
    return records
