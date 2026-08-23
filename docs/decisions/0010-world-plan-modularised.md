# 0010 — World-generation master plan modularised

**Date:** 2026-08-23 · **Status:** accepted (owner decision)

The ~2,830-line monolith is split into `docs/world/` — 14 part-modules plus a
**~4k-token universal core (`00-core.md`)** that every world-gen agent reads
in full each session, and a task router (`world/README.md`). This supersedes
the short-lived every-agent-reads-all-45k mandate: the owner judged that
important guidance (e.g. §9 assets-carry-terrain-identity, §16 region
grammar, the Part XI asset candidate lists, water-repo references) risked
getting lost in the bulk.

Mechanics: section numbering (§NN) is preserved inside modules and the README
carries a §→module map; `docs/world-gen-master-plan.md` remains as a redirect
stub so existing references across decisions/dossiers/code comments resolve.
Acceptance rules (old Part XIV) live in 00-core because they bind everything.
The modules ARE the plan — same editing authority as before.
