# Local fluid, caustic receivers and GPU limits

Completion-pass implementation notes,2026-09-06. This is not deployment or
visual acceptance; those remain in [the full checklist](water-completion-audit.md).

## Physical interaction

The [Evan Wallace port](https://github.com/jeantimex/threejs-water) demonstrates
why changing surface height, displaced volumes and refracted light together
matters more than adding identical decorative rings. Our province cannot run
that resolution everywhere. One persistent owner-selected128² patch covers
32m around a nearby standing-water interaction. A bounded finite-volume
height/flux solver uses depth-dependent gravity waves and closed dry/foreign
boundaries; it follows the conservation structure described in
[Clawpack's shallow-water reference](https://www.clawpack.org/riemann_book/html/Shallow_water.html).
This is an independently implemented local, linearised surface model, not a
volume-breaking-wave solver or copied demo code.

Sphere proxies integrate excluded submerged volume. Quiet initial admission
records a baseline without inventing an impact; real motion/removal produces
volume differences. Whole-actor admission is bounded and stable. The same
field feeds rendered height/normals, physical queries and refracted-ray
focusing. Presentation blends at the patch perimeter; conservation belongs
to the solver, not a claim of a globally simulated water body.

Caustic receiver hooks share terrain/prop lighting state and add only to
shadowed direct diffuse light. Chemistry, immersion, connected stage and
owner gates apply to interactive focusing too. Numerical tests cover flat
water, crest/trough focusing, optical folds, actual disturbances and dry
neighbours. Differential optics execute before varying visibility branches;
otherwise edge quads can produce undefined stripes. Visual judgement and
arbitrary complex receiver/obstacle geometry remain separate checks.

## Minimum WebGL2 budget

The high-tier fly shader includes three shadow cascades, aerial fields and
environment lighting. Actual compiled-program inspection found17 ground
fragment samplers after adding local caustics. The current three.js also
uses a DFG lookup texture, missed by an earlier paper count.

Decoded water alpha channels now carry GPU-only auxiliary bytes; CPU RGB
remains unchanged. No data is authored into PNG alpha, where browser
premultiplication is unsafe. On16-texture devices only, the lighting patch
uses the analytical DFG fit previously used by
[three.js r180](https://github.com/mrdoob/three.js/blob/r180/src/renderers/shaders/ShaderChunk/lights_physical_pars_fragment.glsl.js),
from Brian Karis's mobile environment-BRDF work. Higher-limit hardware keeps
the current lookup table. Direct single-scatter GGX is untouched; multiple
scattering compensation uses the fit. This is an explicit compatibility
approximation, not exact LUT equivalence.

A short software-WebGL probe linked the actual high-tier ground and water
programs with advertised16-unit capabilities: both fragment stages use16
samplers. Water has18 combined because two more are vertex-only; WebGL2's
combined limit is separate. This proves shader resource admission, not GPU
framerate. Re-run the same stage-specific check after any new texture input.
