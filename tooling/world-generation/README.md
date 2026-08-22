# World generation tooling

Offline compilers and extractors that turn vault source data into world data.
Nothing here ships to the browser; runtime consumables are written into app
`public/` directories or `world/` manifests.

- `worldgen/esp.py` — minimal Skyrim SE plugin reader (GRUP walking, compressed
  records, CELL/XCLC + LAND/VHGT decoding).
- `worldgen/extract_province.py` — stitches the Argonia worldspace heightfield
  (Tamriel Worldspaces, Nexus SSE mod 118678) into a float32 grid in the vault
  plus a downsampled browser preview in `apps/world-studio/public/province/`.

Run from this directory:

```bash
python3 -m worldgen.extract_province "<vault>/mod-sources/tamriel-worldspaces-118678/extracted/Argonia Worldspace/Argonia.esp"
python3 -m pytest -q
```
