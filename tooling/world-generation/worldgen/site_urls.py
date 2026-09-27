"""The studio's base URL for links the tools hand the owner (16k S18).

A walk table, a walk packet or a site packet links the DEPLOYED studio on
GitHub Pages: the owner walks the published build, and `ES_TUNNEL_URL` is a
per-machine dev tunnel that is dead on the owner's phone once the session
ends (method review r3, wb.py walktable). The tunnel is used only when the
caller asks for a local link on purpose (`local=True`).

    from worldgen.site_urls import studio_url
    url = f"{studio_url(local=False)}?view=character&x=..&z=..&t=.."
"""

from __future__ import annotations

import os

PAGES_URL = "https://jtattersall09403.github.io/elder-souls-argonia/"
STUDIO_URL = PAGES_URL + "studio/"


def studio_url(local: bool = False) -> str:
    """The deployed studio URL, or the local tunnel's when `local` and
    `ES_TUNNEL_URL` is set (falls back to the deployed URL otherwise)."""
    if local:
        tunnel = os.environ.get("ES_TUNNEL_URL", "").strip()
        if tunnel:
            return tunnel if tunnel.endswith("/") else tunnel + "/"
    return STUDIO_URL
