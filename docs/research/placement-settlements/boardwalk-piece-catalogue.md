# Boardwalk piece catalogue (16k walk 6)

What we hold for boardwalks, docks and walkways over marsh water, measured
from the meshes (rails: vertices 0.5 to 1.6 m over the deck, per edge) and
read from the abuts record (`world/sources/placement/kit-assemblies-mined.json`
`abuts`). Survey 2026-09-30 for the Riverwalk rebuild (owner walk 6: the
corner was two straights at a right angle, and the route was a long L).
Full per-piece notes and the measuring script: the survey report
`tooling/.reports/16k/walk6/boardwalk-piece-survey.md`. The routing and the
walk check that use this are `.claude/skills/modular-runs/SKILL.md` § F.

## The finding

No mined pair joins a corner or junction piece to a straight at a turn, in
any marsh-grade kit: every vanilla, King of the Murkmire and Valenwood
junction piece is in `placedNoPairs` or `singleUse`. The only mined turns
between modular deck pieces are imperial-keep `mwimparchdockplatfront01 >
corout01` (yaw 270, n 4) and Valenwood `passcirc90 > passl128i01` (yaw 135,
n 3). A turn is therefore laid by GEOMETRY onto a piece made to turn
(face to face, then walked by `walkwayRule`), never by butting two straights.

## Pieces

| piece | kit | deck L x W (m), deck z | railed edges | role | turn pairs mined |
|---|---|---|---|---|---|
| dockstrsol01 / sol02 | docks-v1, settlement-imperial-v1 | 7.28 x 4.38 / 4.0 x 4.23, 0 | sol02 both long sides; sol01 posts | straight | run 7.27 m (n 5-9) |
| dockstrent01-04 | docks-v1 | 7.3-7.7 x 4.0-4.25, 0 | posts and part rails on both long sides | straight | run 5.9-7.3 m (ent02: 7.09 m, n 133) |
| dockcorsol01 | docks-v1 | 6.02 x 6.02, 0 | two outer sides, part | corner | none |
| dockstr4way01 | docks-v1 | 7.28 x 4.24, 0 | posts | X junction | none |
| dockstepsdown01/02, stepsdownend01 | docks-v1 | 7.3 x 4.4 / 2.2 x 3.7 | 01: both long sides | stair to water or ground | 01 > sol01 yaw 268 |
| KotM dockscentre / alt / nopost / small | settlement-stilt-v1 | 3.64 x 3.71, 0.2 | nopost, small: none | straight; nopost is an open platform | none |
| KotM docksend / docksendnopost | settlement-stilt-v1 | 2.51 x 3.69, 0.2 | posts / none | end cap | nopost run 3.66 m (n 8) |
| KotM dockscorner / docks3way / docks4way | settlement-stilt-v1 | 3.6 x 3.7, 0.2 | posts | corner / T / X | none |
| KotM walkway01-07, walkwaystairs | settlement-stilt-v1 | fixed prefab lengths 9-27 m, 0.9 | none | fixed shapes, stair | none |
| mwimparchdockplat mid / front / corin / corout | imperial-keep | 3.64 square, 0-0.3 | none | platform, edge, inner and outer corner | front > corout yaw 270 (n 4) |
| tamu_wooddock01 / 02 / short01 | docks-v1, settlement-stilt-v1 | 3.64 x 1.81, 1.4 | none to part | straight | double only |
| Valenwood pass* (l, junc t/x/y, circ45/90, end) | settlement-root-v1 | 3.64-3.83 square; circ90 8 x 8 | juncxd all four sides; passend three | straight, T, X, Y, 45 and 90 deg curve, end | circ90 > l128i yaw 135 (n 3) |
| Mud Mother argonianbridge / bridgestart | settlement-mud-v1 | 6.34 x 2.73, 0.3 | both long sides | railed span / start | none |
| Mud Mother argonianplatform / small | settlement-mud-v1 | 2.7 square, 0.1 | none | open platform (any-angle junction) | none |
| KotM mudhut stairs01/02, BM&V steps01-03 / bridge01 | settlement-mud-v1, route-spans-v1 | stairs 2.2 x 2.4; bridge01 4.9 x 2.25, 2.7 | none | stair to ground; hut bridge | steps02 > bridge01 (n 3) |

## What a boardwalk can do with these

- **Straight at any bearing**: every straight family above (a run is one
  yaw; the mined pair sets the step).
- **90 deg turn**: vanilla `dockstr4way01` or `dockcorsol01` in the vanilla
  family; KotM `dockscorner` / `docks3way` / `docks4way` in the KotM family
  (deck 0.2); the imperial-keep platform set for its own family.
- **45 deg and curves**: only the Valenwood `passcirc45/90` set (a root-city
  look, not a marsh boardwalk); an open platform (Mud Mother
  `argonianplatform`, KotM `dockscentrenopost`) takes any angle, but its deck
  sits 0.1-0.2 m off the vanilla deck, so it joins its own family only.
- **Ends**: a straight whose short side has no rail ends on flat ground
  (vanilla ent/sol ends are open between corner posts).

No sourcing gap: turns and junctions exist in every family we use; what
was missing was a router that uses them and a check that walks the joint.
