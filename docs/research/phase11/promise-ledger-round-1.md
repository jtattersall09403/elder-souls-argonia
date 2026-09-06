# Promise ledger, round 1 — what the records promise and what the blueprints built

Owner finding, 2026-09-05: *"do we have something that ensures all the things
the macro plotting layer promises a place will give the player (services,
quests etc.) actually ARE present? In Lilmoth I couldn't find the shops and
services we planned."* We did not, so this is the first run of the mechanism
that now does: `worldgen.blueprint_promises`, called by `compile_settlement`
(principle 97 E9, enforcement row G22).

**This is a report, not a fix.** No blueprint was edited. Each unmet row says
what would meet it, in the schema's own terms, for the agent that fills them.

## How a promise gets checked

The catalogue record is the promise. Its `services[]` (typed 2026-09-05 and
derived by `worldgen.derive_services`), the roles in `contents.npcs`, its
`travelStation`, its `questHooks.provisions`, its `sockets`, the reward kinds
that imply a place and its `entrance` kind are each matched against the
blueprint object that realises them: a parcel carrying that `service` with a
door onto a linked interior, an occupant with `worksAt`/`livesAt`, a travel
service and a landing, a socket, a variant. Unmet is a compile error from
magnitude M3 up and a warning below. The per-place table is regenerated into
`tooling/world-generation/output/settlements/<id>.ledger.md` on every compile.

## The five blueprints

| Place | Magnitude | Promises | Met | Unmet | Unmet are |
|---|---|---|---|---|---|
| Mazzatun (`place.dunmer-north.mazzatun`) | M3 | 8 | 1 | **7** | errors |
| Nine-Trunks (`place.hist-heartland.nine-trunks`) | M3 | 8 | 1 | **7** | errors |
| The Licensed Stage (`place.hist-heartland.sap-tapping-licensed`) | M1 | 3 | 1 | **2** | warnings |
| Lilmoth (`place.mercantile-coast.lilmoth`) | M5 | 47 | 28 | **19** | errors |
| The Standing Charge (`place.naga-kur-deeps.wamasu-pond-adult`) | — | 2 | 1 | **1** | warnings |

### Mazzatun — 1/8 met

| Unmet promise | Kind | What would meet it |
|---|---|---|
| a lodging that the player can use | service | add a parcel with `service: "lodging"` (an exact kit piece, a why and a yaw), or drop `lodging` from the record if the culture does not have one |
| a shrine that the player can use | service | add a parcel with `service: "shrine"` (an exact kit piece, a why and a yaw), or drop `shrine` from the record if the culture does not have one |
| a trader that the player can use | service | add a parcel with `service: "trader"` (an exact kit piece, a why and a yaw), or drop `trader` from the record if the culture does not have one |
| evidence socket evidence.mazzatun.the-half-cut-blocks | socket | add a questSockets[] entry carrying the catalogue id evidence.mazzatun.the-half-cut-blocks, or a `socketRef: "evidence.mazzatun.the-half-cut-blocks"` on the blueprint socket that realises it |
| marks socket marks.mazzatun.xit-xaht-mark | socket | add a questSockets[] entry carrying the catalogue id marks.mazzatun.xit-xaht-mark, or a `socketRef: "marks.mazzatun.xit-xaht-mark"` on the blueprint socket that realises it |
| scene socket scene.mazzatun.the-conduit-room | socket | add a questSockets[] entry carrying the catalogue id scene.mazzatun.the-conduit-room, or a `socketRef: "scene.mazzatun.the-conduit-room"` on the blueprint socket that realises it |
| station socket station.mazzatun.shaper | socket | add a questSockets[] entry carrying the catalogue id station.mazzatun.shaper, or a `socketRef: "station.mazzatun.shaper"` on the blueprint socket that realises it |

### Nine-Trunks — 1/8 met

| Unmet promise | Kind | What would meet it |
|---|---|---|
| a merchant works here | npc-role | add a parcel with `service` in ['market', 'trader'] in which the merchant works |
| STATE quest.provision.identity-case | provision | add a `variants[]` entry whose id names identity-case |
| the place gives the rest-shelter reward | reward | build one of ['lodging'] as a parcel with a `service` |
| the place gives the services reward | reward | build one of ['lodging', 'shrine', 'trader'] as a parcel with a `service` |
| a lodging that the player can use | service | add a parcel with `service: "lodging"` (an exact kit piece, a why and a yaw), or drop `lodging` from the record if the culture does not have one |
| a shrine that the player can use | service | add a parcel with `service: "shrine"` (an exact kit piece, a why and a yaw), or drop `shrine` from the record if the culture does not have one |
| a trader that the player can use | service | add a parcel with `service: "trader"` (an exact kit piece, a why and a yaw), or drop `trader` from the record if the culture does not have one |

### The Licensed Stage — 1/3 met

| Unmet promise | Kind | What would meet it |
|---|---|---|
| LOC quest.provision.mr04-anchor | provision | add a parcel, landmark or questSocket whose id names mr04-anchor, so the quest has somewhere to happen |
| the place gives the trade-access reward | reward | build one of ['market', 'trader'] as a parcel with a `service` |

### Lilmoth — 28/47 met

| Unmet promise | Kind | What would meet it |
|---|---|---|
| a named official lives and works here | named-npc | give an occupant slot `worksAt` and/or `livesAt` naming the parcel at which the player finds them |
| a named priest lives and works here | named-npc | give an occupant slot `worksAt` and/or `livesAt` naming the parcel at which the player finds them |
| a named quest-giver lives and works here | named-npc | give an occupant slot `worksAt` and/or `livesAt` naming the parcel at which the player finds them |
| an official works here | npc-role | add a parcel with `service` in ['council', 'court', 'licence-office'] in which the official works |
| LOC quest.provision.lilmoth-pusbottom-vault | provision | add a parcel, landmark or questSocket whose id names pusbottom-vault, so the quest has somewhere to happen |
| LOC quest.provision.lilmoth-tidal-palace | provision | add a parcel, landmark or questSocket whose id names tidal-palace, so the quest has somewhere to happen |
| LOC quest.provision.lq08-anchor | provision | add a parcel, landmark or questSocket whose id names lq08-anchor, so the quest has somewhere to happen |
| LOC quest.provision.mq32-epilogue-sockets | provision | add a parcel, landmark or questSocket whose id names mq32-epilogue-sockets, so the quest has somewhere to happen |
| the place gives the faction-access reward | reward | build one of ['council', 'guild-hall'] as a parcel with a `service` |
| an apothecary that the player can use | service | add a parcel with `service: "apothecary"` (an exact kit piece, a why and a yaw), or drop `apothecary` from the record if the culture does not have one |
| a boatwright that the player can use | service | add a parcel with `service: "boatwright"` (an exact kit piece, a why and a yaw), or drop `boatwright` from the record if the culture does not have one |
| a council that the player can use | service | add a parcel with `service: "council"` (an exact kit piece, a why and a yaw), or drop `council` from the record if the culture does not have one |
| a guild-hall that the player can use | service | add a parcel with `service: "guild-hall"` (an exact kit piece, a why and a yaw), or drop `guild-hall` from the record if the culture does not have one |
| a lodging that the player can use | service | add a parcel with `service: "lodging"` (an exact kit piece, a why and a yaw), or drop `lodging` from the record if the culture does not have one |
| a smith that the player can use | service | add a parcel with `service: "smith"` (an exact kit piece, a why and a yaw), or drop `smith` from the record if the culture does not have one |
| a tavern that the player can use | service | add a parcel with `service: "tavern"` (an exact kit piece, a why and a yaw), or drop `tavern` from the record if the culture does not have one |
| a temple that the player can use | service | add a parcel with `service: "temple"` (an exact kit piece, a why and a yaw), or drop `temple` from the record if the culture does not have one |
| a trader that the player can use | service | add a parcel with `service: "trader"` (an exact kit piece, a why and a yaw), or drop `trader` from the record if the culture does not have one |
| paid passage to place.mercantile-coast.oliis-ferry-stage | travel | add a `travelServices` entry with toPlaceId place.mercantile-coast.oliis-ferry-stage |

### The Standing Charge — 1/2 met

| Unmet promise | Kind | What would meet it |
|---|---|---|
| LOC quest.provision.canon.wamasu-charged-water | provision | add a parcel, landmark or questSocket whose id names charged-water, so the quest has somewhere to happen |


## What the round says

1. **Services were never built.** Ten of Lilmoth's twelve services have no
   parcel. The blueprint has one `shop` parcel. `shop` does not name the trade, so
   nothing could see the hole. The remedy is a parcel with
   `service: "<name>"`, a door and a linked interior, for each.
2. **Named people have nowhere to be.** Three of Lilmoth's four NPC slots are
   `named` and no occupant declares `worksAt` or `livesAt`, so the council
   factor, the tree-minder and the An-Xileel agent are people with no address.
3. **Sockets are realised under private ids.** Mazzatun's four catalogue
   sockets exist in the blueprint under `socket.mazzatun.*` names that do not
   carry the catalogue id, so the join is broken on both sides. Either the
   blueprint socket takes the catalogue id, or it declares `socketRef`.
4. **Four Lilmoth quest provisions have no object.** The Pusbottom vault, the
   tidal palace, the LQ08 anchor and the MQ32 epilogue sockets are named by
   quests. Nothing in the layout realises them.
5. **One travel destination is unserved.** The record sells passage to the
   Oliis ferry stage; the blueprint runs no service there.

## Not a defect: promises the lore may want removed

The ledger's remedy always offers the honest alternative — drop the promise.
Two are worth an author's judgement rather than a parcel:

- **Lilmoth's `temple`.** The derivation gives an M5 a temple; Argonian
  practice below M5 is the Hist court; Lilmoth's shrine is already there.
  If the rebuilt city keeps no temple hall, the record should say so.
- **Nine-Trunks' `lodging`.** A root village that houses guests in its own
  halls may not run an inn. The service-hub minimum can be met another way.

Neither is faked in the blueprint: 97 E9 says a service the culture lacks is
removed from the promise, never built to satisfy a check.
