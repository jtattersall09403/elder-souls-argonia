# Type <n>: <type name> (sheet written by slice <N>, <place>; edited by every later slice of the type)

- **Cultures and their 97 Part F rows:** one half per culture the type is built by; plan unit, centre, spacing, orientation, enclosure, water relation, never-appears.
- **Recipe:** the `type-recipes.json` rows this type covers (five slots, siting, magnitude, danger, asset plan) and what the catalogue records of the type actually carry.
- **Lore to read:** dossier paths, one line each on what it decides for this type.
- **Bars:** the `breadth-bars.json` type object and the 0098 tier row, copied as numbers with the file they come from.
- **Gate rows and asset pools:** the 16k checklist rows this type must pass, each with its pool.
- **Approach:** the 16 questions (openworld-approach §5) with the type's usual answer.
- **Building minimum set and yard sets:** per building kind, the assembly layers and the named `group` yard sets with their pieces.
- **Pieces that worked, pieces that failed:** asset ids with the slice and the reason.
- **Known failure modes:** the `lessons.md` ids that bit this type.
- **Template** (method review r3 finding J, 2026-09-27; written before the type's `layout_template.py`, 16k S10, and read by it). What the type's layout template must carry so place 2 does not re-earn place 1's walks:
  - the sub-kind variants the type covers (type 1: on-road, off-road, water-edge), each with the ops that differ;
  - a shell pool with a rotation rule across places, never fixed shells (0098's cap of 3 per signature falls by the type's fourth place otherwise);
  - per-role parcel slots, each with the promise kinds it `fills`;
  - the roster socket sets;
  - the door → interior claim table (the batch pre-pass's shell → cell table, 16k S16);
  - the lit-entrance light per door (97 C16);
  - the scan spec;
  - every walk ruling of the type's accepted places as a parameter, never baked into one place's coordinates (type 1: own-porch sill, per-side aprons, deck piling, board height).
