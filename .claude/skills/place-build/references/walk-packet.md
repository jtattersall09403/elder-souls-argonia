# The walk packet (place-build step 6)

Moved from SKILL.md step 6 (2026-09-29); SKILL.md keeps one line per section and the post step. Source: 16k § Owner check-ins, owner 2026-09-27, 0102 decision 11, R5, R35, R74.

**The packet is short and assumes the owner knows nothing about the
place** (owner 2026-09-27). No per-item tables; every in-world thing is
introduced the first time it is named; plain English, at most ~20 lines
per place plus pictures; a packet of several places repeats sections 2–5
per place, in road order. Every line is under R5: checked against the
records and the runtime, never written from memory. Sections, in order:

1. **What this place is** (three sentences: where, who, why it exists).
2. **Start here:** one deployed-studio link at the anchor
   (`https://<pages-url>/?view=character&x=<E>&z=<S>&t=12`; the deploy ran
   green first), one link per building to enter (and its
   `&interior=<cellId>` form), and the `&sockets=1` link.
3. **What changed since the last walk:** the lines
   `python3 tooling/placement-workbench/wb.py whatchanged <layout> --base <the walked commit>`
   prints (R35: generated from the layout diff, each piece named by its
   manifest `displayName`), grouped under the cause each fixes. A piece it
   reports unnamed is named from its record before posting, never from
   memory; a line claiming a move or a height carries the published
   before/after value from the § 5 read-back (R74).
4. **The numbers, one line:** `check` 0 failures, reader 0 NOs, promises
   filled N of N, colliders, lights, interiors shipped. The full
   `walktable` goes to `tooling/.reports/16k/<place>-walk-N/`, its links on
   the deployed Pages URL, never `$ES_TUNNEL_URL`.
5. **Please look at** (at most eight lines): only judgements no tool makes.
6. **§ Gaps** only for 0102 decision 3's four reasons; **§ Owner calls**
   only for world-level choices. Never an archive purchase, a sourcing
   question or unfinished work.
7. Pictures (0102 decision 11): the plan render and up to four Blender
   shots in `tooling/.reports/16k/<place>-walk-N/`, committed
   (`git add -f -- <png>`), embedded by `--attach`.
8. How to reply: "walk it and tell me what looks wrong, in one message;
   'looks right' when done." Then the stay-or-switch line (0083).

Post (`owner_inbox.py --attach <png...> --walk <walk>`, commit 6201d27f):
run `python3 tooling/repo-standards/owner_inbox.py --post <packet.md>
--title '<Place> walk N' --attach <plan.png> <shot.png>... --walk <walk>`
once first — it copies the pictures into
`tooling/.reports/16k/<walk>/pictures/` and stages them, then refuses to
post until they are committed; commit and push those files on the branch,
then run the SAME command again to actually post. Collapse old packets
with `owner_inbox.py --collapse`.
