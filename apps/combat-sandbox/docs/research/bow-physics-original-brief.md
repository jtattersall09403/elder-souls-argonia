# Bow physics: the original research brief

> The owner-supplied brief that the archery implementation grew from (moved
> here from `tmp/` on 2026-09-05). The implemented, calibrated model and its
> tests are described in [archery-ballistics.md](archery-ballistics.md); where
> the two differ, that file is current. One deliberate departure: the arrow
> is pointed along its velocity kinematically rather than stabilised by a
> simulated fletching torque, which read as a tumble in play (decision 0040 §24).

## Physics basis for bows in `ecctrl-souls-combat`

The historical evidence supports using **actual projectile physics as the core of ranged combat**. We can keep the implementation fairly simple and still land surprisingly close to real medieval bow behaviour.

### Useful real-world parameters

For a **heavy medieval/early-Tudor war longbow**, the Mary Rose archaeological collection gives a useful baseline: surviving bows were about 1.84–2.11 m long, with estimated draw weights of **65–175 lb**, peaking around **110 lb**, and typical draw lengths around **28–30 in**. A 2017 ballistic model uses a particularly heavy **150 lb / 667 N bow**, a **96 g war arrow**, and obtains an initial velocity of about **53 m/s**.

That 96 g figure is a good upper-end war-arrow model. Mary Rose-style shafts have been estimated around **45 g before the iron head**, while surviving/reconstructed bodkin heads are commonly around **10–20 g**, with heavier examples above that. Other experimental medieval arrows have total masses around **40–48 g**. So useful game archetypes would be approximately:

* **Short/light bow:** 40–55 g arrow; ~50–80 lb draw.
* **Longbow:** 60–80 g arrow; ~90–120 lb draw.
* **Heavy warbow:** 80–100 g arrow; ~130–160 lb draw.

“Shortbow” is historically a fuzzy category—there is academic disagreement over whether it should even be treated as a distinct medieval English weapon—so for the game I would define it mechanically as a **shorter/lighter self bow**.

### Projectile model

Don't simulate bending bow limbs. On release, calculate an arrow's initial velocity from its bow and arrow parameters, then hand it entirely to the physics engine.

A practical approximation is:

`stored energy ≈ 0.5 × peak draw force × draw length`

then

`arrow KE = stored energy × bow efficiency`

and

`launch velocity = sqrt(2 × KE / arrow mass)`

Use an efficiency constant calibrated against historical results. The 150 lb / 96 g / 53 m/s example corresponds to roughly **135 J of arrow kinetic energy**, giving us a very useful empirical anchor.

After release apply:

`gravity = 9.81 m/s²`

and quadratic aerodynamic drag:

`Fdrag = 0.5 × airDensity × Cd × frontalArea × velocity²`

A published medieval-longbow simulation successfully simplified arrow flight using **constant atmosphere, constant drag coefficient, an 11.1 mm shaft diameter and Cd ≈ 1.1**; it reproduced a ~250 m maximum range with the 96 g / 53 m/s arrow. Experimental aerodynamic work confirms that arrow drag is substantial and affected by shaft oscillation/fletching, so quadratic drag is worth including rather than using gravity alone.

We can ignore detailed spin, flex and Archer's Paradox initially. Model the arrow as a rigid body whose **centre of mass is forward of centre** because of the iron head, with the fletching providing enough aerodynamic stabilisation to rotate the arrow toward its velocity vector. This should naturally produce convincing nose-down trajectories late in flight.

### What this gives us in combat

The interesting result is that a war longbow need not fire arrows dramatically faster than a lighter bow. Its major advantage is that it can launch a **much heavier arrow at similar velocity**, producing substantially more kinetic energy and momentum. The lighter bow therefore gives flatter-feeling, nimble shooting with light ammunition, while the warbow produces slower handling and much heavier impacts.

Damage should consequently derive from the projectile at the moment of collision:

`impact energy = 0.5 × mass × impactVelocity²`

with a separate **penetration factor based on arrowhead shape + impact angle + armour material**. The historical modelling also shows why this matters: aerodynamic losses reduce velocity/energy with range, while oblique impact angle becomes increasingly important and can cause arrows to glance or ricochet.

That means there is no need for arbitrary RPG-style range damage falloff: **the physics itself generates it**.

### Firing cadence

The often-repeated **10–12 arrows/minute** figure appears to describe short bursts by highly trained archers and should not become the sustained combat rate. Heavy-warbow experimentation puts practical deliberate shooting around **one arrow every ~7 seconds**, and experienced heavy-warbow shooters generally avoid sustaining more than about **six arrows/minute** because fatigue becomes severe.

For gameplay I would therefore use approximately:

* light/short bow: **~2.5–4 s** complete nock/draw/aim/release cycle;
* longbow: **~4–6 s**;
* heavy warbow: **~6–8 s** for a full-power aimed shot.

Allow quicker release by letting go before reaching full draw. Because launch energy comes from actual current draw distance, a snap-shot automatically produces a slower, weaker, more curved projectile. This gives us a useful Souls-style decision without inventing another system: **time spent drawing directly becomes projectile performance**.

### Proposed implementation

Use one generic `BowDefinition` containing draw-force curve/max draw force, draw length and efficiency, and one `ArrowDefinition` containing mass, shaft diameter/Cd, centre-of-mass offset and head type.

During the draw animation, continuously calculate current stored energy. On release, convert that energy into the rigid-body arrow's initial velocity. From that point onwards let Rapier/ecctrl-world physics handle gravity, collision and motion, with a small custom aerodynamic force each physics tick.

This gives us a ranged system whose **trajectory, range, flight time, long-range energy loss, moving-target leading, partial draws and impact power all emerge from the same small set of real physical parameters**, while leaving a handful of coefficients available for later gameplay tuning.