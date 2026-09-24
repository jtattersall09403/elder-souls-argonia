# stats-lab

The owner's bench for the stat model (stats-lab lane, decision 0088). Sliders
for race, sex, class, level, attributes, skills, carried weight and armour;
tables for the derived values, the combat modifiers, the D1–D5 ladder against
this character and climbing; curves for any skill's bands; a button that runs
the balance harness's 19 invariants. Every number comes from
`@elder-souls/game-core/stats`; this app only lays it out. Every string comes
from the text catalogue (`packages/text-catalogue/src/stats-text.ts`).

```bash
npm run dev -w @elder-souls/stats-lab     # needs ES_STUDIO_PORT and ES_TUNNEL_URL, as the studio does
npm test -w @elder-souls/stats-lab
```

Not yet on the Pages site: the composer is 16h's file (backlog row).
