# Interaction (0103 decision 4)

One `activate` press (io/input.ts: E, the pad's bottom face button, the
touch prompt), one answer.

| File | What it owns |
| --- | --- |
| `arbiter.ts` | `InteractionArbiter`: providers `offer` candidates `{id, kind, positionM [x, z], reachM, promptTextId}` each frame; the host `resolve`s once per frame with the player's position and the `activate` edge; the nearest candidate within its own reach (planar, ties by id) is the focus, the only one that shows its prompt and answers the press. `pickCandidate` is the pure rule. |

Providers today (studio): `InteriorDoors.tsx` (the door `DoorTransition`
offers) and `travel/TravelSockets.tsx` (operator sockets). A provider does
its own non-planar gating (an interior exit door checks the floor; the
travel sockets offer nothing while the player is inside a cell). The host
creates one arbiter (`CharacterMode.tsx`) and swallows the held button when
an activation lands (`input.suppressHeld()`), since `activate` shares the
pad's bottom face button with `dodge`.
