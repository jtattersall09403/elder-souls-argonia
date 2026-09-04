# Part 4 step 2 — asset-deliverability repair brief (2026-09-04)

Owner ruling: every place must be buildable with assets we have or can source
(CLAUDE.md "Make asset-aware decisions"; engineering standard 12: prose is
written against the record). The audit
[place-asset-deliverability-audit.md](../place-asset-deliverability-audit.md)
gives a verdict per type and a per-record list of undeliverable claims in
`tooling/world-generation/output/asset-deliverability.json`. One agent per
region file repairs its records; the lead re-plots after.

## Read first (and only)

1. The audit doc §inventory and the verdict tables (what kits exist, what
   each interior family can be built from, which types are retired or
   redefined, the sourcing shortlist).
2. Your region's entries in `asset-deliverability.json` → `records`.
3. `world/sources/catalogue/README.md` (schema v2, naming register, signature
   pool) and `docs/text/style-guide.md` §1.2, §2.4–2.5 + the banned table in
   docs/quests/60 §45e.1 (no em dashes, no AI tells, "but" where the sense is
   contrast) — you will be rewriting prose.
4. `docs/research/phase11-critique/part4-step2-region-brief.md` § Hard rules
   (ids permanent; never write plot fields; write through `catalogue.dump_json`;
   `--check` and `registries --check` must print OK).

## Per record with an undeliverable claim

Choose, in this order:

1. **Rewrite to the kit.** Keep the place; change every built-form noun the
   prose promises to what its `assetPlan` families actually show (read the
   audit's inventory description of each family). A "root gallery" whose kit
   is `hist-tree` + `passerelles-walkway` becomes raised walkways strung
   between Hist roots; a "house carved into the cliff" becomes a cave mouth
   in the cliff with a built porch. Update `vibe.*`, `why.*`, `hook`,
   `interior.family` (must be a deliverable family per the audit), and
   `assetPlan` (aliases from `asset-aliases.json` only; the audit says which
   deliver what).
2. **Swap the type.** If the type itself is retired/redefined by the audit,
   reclassify the record to the deliverable type the audit names (taxonomy
   must resolve; the type recipe exists), and re-derive why/vibe/purpose to
   match.
3. **Source it** only when the audit lists a permissioned mod for exactly this
   form: keep the record, add `assetGaps: ["<mod name> (Nexus id)"]` on it so
   the sourcing pass can pick it up, and write the prose to what that mod
   delivers. Do not download.
4. **Defer** when none of the above keeps the place worth having (edges →
   `relationsReserved`).

Keep counts honest: report live count before/after, and keep the region's
balance (dungeon-like or hostile ≥ 55 %, settlement + civic ≤ 22 %) — if a
conversion changes class, check the region's figures in the rebalance table
(docs/research/place-purpose-hostility-and-dungeon-balance.md §8b).

## Rules

- Prose is written FROM the typed fields (standard 12): read `assetPlan`,
  `interior`, `contents`, `plotFacts.landform` first, then write.
- No composites of pieces not authored to combine (CLAUDE.md rule).
- Only your region's file. Do not commit. Run the checks before reporting.

## Report (≤12 lines)

Records with claims before/after; rewritten / retyped / flagged-for-sourcing /
deferred counts by id count; types you retyped away from; anything the audit
got wrong.
