# 0051 — Route span systems: how a way crosses a gap

Date: 2026-09-09. Status: accepted. Supersedes nothing; extends
[0041](0041-phase11-settlement-decisions.md) (placement) and the
`route-structures-v1` half of module 90.

## Context

`route-structures-v1` had pieces for climbing a slope but none for crossing a
gap. Its only road-spanning asset was a 4.216 m free-standing slab, tiled. A
389.6 m crossing became ninety-three slabs end to end with nothing beneath.
`route-spans-v1` (2026-09-09) sourced and packaged the missing pieces; this
record is the set of calls made when wiring them into
`worldgen.compile_route_structures`.

## The calls

**1. A span is additive geometry and moves no ground.** The owner's ruling
stands: no embankments. Every piece below is placed above the natural
heightfield and the compiler never writes terrain.

**2. Anchoring is part of a piece's contract.** Each span piece declares
`deck-line`, `foot` or `mid-pivot`. `validate_spans` checks the declaration
against the built manifest's own `originOffsetM`. A `deck-line` piece whose
pivot is at its foot, or a `foot` piece whose pivot is half way up it, is
refused rather than placed 22 m out. The Nordic pier is 26.825 m tall with its
pivot at deck level and 21.848 m of shaft below, so the declaration is what
puts it in the right place.

**3. The deck line of a crossing follows a taut string.** The deck runs on the
upper convex hull of the ground profile between the window's two endpoints. It
meets the road at both ends, lies on or above the ground the whole way and
moves no ground. A straight chord was tried first and buried the deck by as
much as **8.25 m** in 133 of the 204 crossings, because an over-cap stretch is a slope
with hummocks in it. With the taut profile the worst deck burial province-wide
is **0.19 m**.

**4. The monolith rule.** A crossing is built as ONE whole authored bridge when
a single piece covers the gap at the way's running width, overhangs it by no
more than 12 m, lies flat over it without burying itself and meets the lower
road no more than 2 m up. Otherwise the family's viaduct is chained. On today's
204 windows that fires **3 times**. The measurement is why. The windows come
from the grader's over-cap stretches and their median fall is **3.9 m**, so a
flat vanilla arch would meet the lower road several metres in the air. A
chained viaduct steps down with the ground. One consequence is recorded in the
polish backlog: a monolith cannot follow a slope because the placement contract
carries yaw only. A pitch axis would let ~46 more crossings be a single arch.

**5. No chain is built without the authors' own evidence.** Two chains that
existed only because two pieces sounded compatible are gone:
`stockadescaffoldbridge01/02/narrow` (no template anywhere pairs one with a
scaffold base or with another bridge piece) and
`hlaalu:…/hammerfell/trgmbridge02` (no template places two end to end; it was
being chained 29 deep). Both remain as single-piece landings, which needs no
pairing evidence. The freehold deck is now the `stockade-trestle`, whose joins
are mined from vanilla, parapet included.

**6. The two "unbuilt but measured" bridges are rejected on their extents.**
`windhelmbridge2` is 145.127 m of span at **32.9 m wide** and `sbridge01`
92.442 m at **30.923 m**. They are city bridges, four to six times the 5.0 m
running surface a trunk road gets. The monolith ladder stops at vanilla's
free-standing landscape bridges, at 52.188 m.

**7. A pier is only placed where the deck is clear of the ground by more than
the deck's own measured thickness.** Below that the deck module's underside is
already on the ground and the pier would be entirely buried; the change removed
1,071 wholly-underground towers.

## What holds it

`worldgen/test_route_structures.py`: a family with no `span` block is refused; a
deck with no abutment is refused; a `deck-line` piece whose pivot is its foot is
refused; a pier whose declared drop the manifest does not measure is refused; a
system mixing whole bridges with a chained deck is refused; the monolith rule
picks the smallest bridge that fits and refuses an 18 m overhang; and a
synthetic gorge crossing is built on the taut profile with every pier reaching
the floor.
