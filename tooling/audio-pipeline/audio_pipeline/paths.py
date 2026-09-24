"""Where things live: the repo, the asset vault, and the reused readers.

The vault (decision 0001) sits outside the repo; ``ELDER_SOULS_ASSET_ROOT``
overrides the default sibling checkout, exactly as tooling/asset-pipeline does.
The BSA and plugin-record readers are REUSED from tooling/asset-pipeline, never
re-implemented: this module puts that folder on ``sys.path`` once.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
PIPELINE_ROOT = REPO_ROOT / "tooling/audio-pipeline"
ASSET_ROOT = Path(os.environ.get("ELDER_SOULS_ASSET_ROOT", REPO_ROOT.parent / "elder-scrolls-asset-pipeline"))
SKYRIM_DATA = ASSET_ROOT / "skyrim-source/Data"
SOUNDS_BSA = SKYRIM_DATA / "Skyrim - Sounds.bsa"
SKYRIM_ESM = SKYRIM_DATA / "Skyrim.esm"
#: Raw extracted sources (wav/xwm), keyed by their archive path.
EXTRACTED = ASSET_ROOT / "skyrim-source/extracted/sounds"
#: Vault-side scratch: the plugin sound-record cache and conversion evidence.
VAULT_OUT = ASSET_ROOT / "output/audio"

#: What ships: encoded files + the manifest, served by the package's plugin.
AUDIO_FILES = REPO_ROOT / "packages/audio/files"
MANIFEST = AUDIO_FILES / "audio-manifest.json"
SELECTION = PIPELINE_ROOT / "selection.json"
PROVENANCE = PIPELINE_ROOT / "provenance.json"
INVENTORY = PIPELINE_ROOT / "inventory.json"

_ASSET_PIPELINE = str(REPO_ROOT / "tooling/asset-pipeline")
if _ASSET_PIPELINE not in sys.path:
    sys.path.insert(0, _ASSET_PIPELINE)
