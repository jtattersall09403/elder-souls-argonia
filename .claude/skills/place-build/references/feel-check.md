# Feel check (step 4b)

Pictures from where the player stands, judged against § Intent by a reader
who has not seen the design. One check per render round, inside standard
14's four-round cap; it replaces no gate.

## Shots

- Day, eye height: one per walk-through stage, from the cameras in
  § Walk-through ([design-intent.md](design-intent.md)): `wb.py paint-look
  --eye NAME:EX,EZ>LX,LZ --scene <scene> --preview` (eye-level Cycles over
  the draped ground with the applied scene).
- Night: `wb.py render --shots iso:<approach bearing>@night` plus the
  interior cutaway at night (until `render` takes an eye-height token).
- Inside: one interior shot per enterable building from its door, looking in.

## Reader brief (one `image-reader`, copy and fill)

> You are judging whether a place in a fantasy game set in Black Marsh
> (Argonia), a province of many regions, reads as intended. Images: <paths,
> each with its stage name>.
> 1. Before reading further, describe in three sentences what this place is
>    and how it feels (blind read).
> Intent: type <type>; region <class and climate in plain words>; purpose
> <one sentence>; mood <words>; the three images <in words>; palette
> <ground, water, vegetation, material, light, air words from § Intent>.
> 2. Per mood word: EVIDENCED / ABSENT / CONTRADICTED, with the visible
>    detail and the image.
> 3. Per image the player should keep: found (which picture) or not.
> 4. Palette: do the ground, water, vegetation, materials and air read as
>    the palette given? Name the patches that read as some other region or
>    climate (and which).
> 5. In the far and approach shots, where does the eye go first? Is it
>    <first-seen object>?
> 6. Anything that reads as a stand-in: a block, a flat slab, an unlit
>    dome, a boulder where a made thing should be, smoke with no fire, a
>    dark room with no light source, the same building or prop repeated so it
>    reads as copy-paste.
> 7. Given this context (the place, its type, its region, the intent words,
>    what each view is meant to be), does what you see feel right for it? If
>    not, what is obviously wrong when you step back? (Last, per
>    [reader-brief.md](reader-brief.md); items 1-6 stay first.)
> Answer in at most 25 lines.

## Exit rule

Pass when: the blind read names the type and at least one mood word or a
near synonym; every mood word is EVIDENCED; all three images are found; the
palette reads as given in § Intent item 4 (this replaces any fixed idea of
what the province looks like); the eye goes first to the intended object;
item 6 is empty; item 7 names nothing wrong. Each miss becomes a layout row naming the lever from the
mood table ([design-intent.md](design-intent.md)), never a change of prose. A
miss still open after the fourth round goes into the walk packet as an owner
call with its pictures. Record each round in design.md § Feel check: round,
shots, verdict per word.
