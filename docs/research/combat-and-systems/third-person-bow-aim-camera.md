# Third-person bow aim: the over-the-shoulder camera

Reference for the sandbox's `aimView: "shoulder"` option (decision 0040 §44),
requested by the owner as a side-by-side alternative to the first-person arms
rig, "how Zelda: Tears of the Kingdom does it".

## What Tears of the Kingdom actually does (from play and public breakdowns)

- Holding the aim button keeps the game **third person**. The camera moves in
  behind Link's right shoulder and slightly above eye height, a short pull-in
  rather than a cut, and a reticle appears at screen centre.
- Link **turns with the camera** while the bow is up; the stick strafes and
  back-pedals around the aim, it never turns him away from it. The upper body
  pitches with the reticle; the legs stay on their locomotion.
- The arrow is nocked and drawn on the string by the ordinary third-person bow
  animation; there is no separate arms rig. The camera offset is what keeps the
  drawn bow and string in shot rather than across the reticle.
- Aiming tightens the field of view a little (gyro/stick sensitivity drops
  accordingly), and the reticle is the arrow's line at a modest range: the
  small parallax between an over-shoulder camera and the bow is accepted.
- Bullet time is airborne-only and is not part of the camera model.

## Mapping onto the sandbox

- Camera: eye point + 0.55 m to the right of the aim, +0.22 m up, 1.7 m back
  along the aim, sighting along the aim direction (`SHOULDER_AIM_*` in
  `CombatScene`). Third-person near plane. Existing aim FOV/zoom apply.
- Body: already turns with the camera while aiming (0040 §38) and pitches the
  spine to the aim (`aimPitchRef`); the rigged bow and nocked arrow are the
  same ones the first-person rig uses, mounted on the third-person hands.
- The crosshair and the shot are unchanged: the shot leaves from the nock
  along the aim direction, the crosshair is the aim direction.

Sources: Nintendo, *The Legend of Zelda: Tears of the Kingdom* (2023), play;
GDC/Nintendo talks do not cover the bow camera specifically, so the numbers
above are the sandbox's, chosen to reproduce the framing.
