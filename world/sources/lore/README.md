# Lore dossiers

Per-location canon records feeding world generation (danger, cultures, routes)
and later the Phase 11 causal models, quests and dialogue. One file per anchor
city now; add files for regions, tribes, factions and POIs as they get built.

## Sourcing rules

- Primary source: **UESP** — the wiki extract in the vault
  (`mod-sources/lore/uesp_morrowind_blackmarsh_extract.jsonl.xz`, 6,299 pages,
  sha256 `b1a1641c…`) plus targeted fetches from the UESP MediaWiki API for
  pages the extract lacks. Cite the UESP page name on every fact.
- Facts are labelled with the confidence vocabulary from the master plan §13.
  Era policy is decision 0002 (production era 4E 201): earlier-era facts are
  history; ESO (2E) political states must not leak into the 4E 201 present.
- The old planning repo (`~/workspace/elder-souls-claude/.../corpus/60-lore`)
  contains curated lore briefs — **treat as unverified**: the owner warns some
  assertions there are wrong. Mine it for leads only; verify against UESP
  before recording anything from it here.
- Before quest/dialogue authoring against a dossier, re-verify its facts on
  live UESP (pages evolve; our extract is a snapshot).

## Dossiers

Province: [black-marsh-province.md](black-marsh-province.md) ·
Cities: [helstrom](helstrom.md), [gideon](gideon.md), [archon](archon.md),
[thorn](thorn.md), [blackrose](blackrose.md), [lilmoth](lilmoth.md),
[stormhold](stormhold.md), [soulrest](soulrest.md),
[alten-corimont](alten-corimont.md)
