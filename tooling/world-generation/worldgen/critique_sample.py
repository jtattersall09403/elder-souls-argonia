"""Fast mechanical re-critique of the place catalogue (Phase 11 critique round).

Re-runs, cheaply, the checks the five adversarial critics failed the catalogue
on in the 2026-09-02 round, so any later agent can measure a repair pass instead
of arguing about it. These are *smells*, not gates: nothing here is wired into
`npm test` (the invariants that ARE hard gates live in test_catalogue.py and
test_type_recipes.py). Point it at a directory to compare against an old commit:

    git show <ref>:<path> ...  # into a scratch dir
    python3 -m worldgen.critique_sample /tmp/pre

Round result (pre-repair 29c502b -> post verify/wrap) is tabulated in
docs/decisions/0041-phase11-settlement-decisions.md.
"""
import json,glob,collections,os,re,sys
from .catalogue import CATALOGUE_DIR
D=sys.argv[1] if len(sys.argv)>1 else str(CATALOGUE_DIR)
# land km2 per zone (coverage-density.md S2)
LAND={'pirate-freeholds':0.78,'imperial-penal-south':1.06,'saxhleel-coast':1.81,'mercantile-coast':3.15,
 'naga-kur-deeps':2.51,'hist-heartland':9.25,'imperial-fringe':7.11,'dunmer-north':7.85}
regs={}
for p in sorted(glob.glob(os.path.join(D,'places-*.json'))):
    d=json.loads(open(p).read()); regs[d['region']]=[x for x in d['places'] if x.get('status') not in ('deferred','cut')]
out={}
# 1 region-constant vibe fields
const=[]
for r,rec in regs.items():
    for f in ('palette','materials','senses','condition','approach','silhouette','mood','signatureFeature'):
        vals=[(x.get('vibe') or {}).get(f) for x in rec]
        vals=[v for v in vals if v]
        if not vals: continue
        top,n=collections.Counter(vals).most_common(1)[0]
        if n/len(rec)>=0.25: const.append(f"{r}.{f} {n}/{len(rec)}")
out['region-constant vibe fields (>=25% identical)']=len(const); out['_const']=const[:6]
# 2 empty / missing vibe fields
miss=sum(1 for rec in regs.values() for x in rec for f in ('silhouette','condition','approach','palette','materials','signatureFeature','mood','senses')
         if not ((x.get('vibe') or {}).get(f) or '').strip())
out['empty or missing vibe fields']=miss
# 3 visual twins: same type + >=2 identical vibe axes
tw=0; seen=collections.defaultdict(list)
for rec in regs.values():
    for x in rec: seen[x['classification']['type']].append(x)
for t,xs in seen.items():
    for i in range(len(xs)):
        for j in range(i+1,len(xs)):
            a,b=(xs[i].get('vibe') or {}),(xs[j].get('vibe') or {})
            same=sum(1 for f in ('silhouette','palette','materials','signatureFeature','condition','mood','approach','senses')
                     if a.get(f) and a.get(f)==b.get(f))
            if same>=2: tw+=1
out['visual-twin pairs (same type, >=2 identical vibe axes)']=tw
# 4 duplicate names
names=collections.Counter(x['name'] for rec in regs.values() for x in rec if x.get('name'))
out['duplicate names']=sum(n-1 for n in names.values() if n>1)
out['empty names']=sum(1 for rec in regs.values() for x in rec if not (x.get('name') or '').strip() and not x.get('namingRule'))
# 5 sightline honesty
sl=sum(1 for rec in regs.values() for x in rec if x.get('discovery')=='sightline')
out['sightline discovery, province']=f"{sl} ({sl/sum(len(v) for v in regs.values()):.0%})"
out['_sightline per km2']={r:round(sum(1 for x in v if x.get('discovery')=='sightline')/LAND[r],1) for r,v in regs.items()}
# 6 socket-less tier 0/1
out['socket-less tier-0/1 records']=sum(1 for rec in regs.values() for x in rec
    if x.get('importanceTier',9)<=1 and not any((x.get('sockets') or {}).get(k) for k in ('scene','evidence','station','marks')))
# 7 season / era coverage
out['records missing any of the five strict fields']=sum(1 for rec in regs.values() for x in rec
    if any(x.get(f) in (None,'',[]) for f in ('season','eraLayers','densityLayer','entrance','underwaterAccess')))
out['distinct entrance types used']=len({x.get('entrance') for rec in regs.values() for x in rec})
out['records with only ["current"] era']=sum(1 for rec in regs.values() for x in rec if x.get('eraLayers')==['current'])
out['non-all-year season records']=sum(1 for rec in regs.values() for x in rec if x.get('season') not in (None,'all-year'))
# 8 counts
out['live records']=sum(len(v) for v in regs.values())
for k,v in out.items():
    if not k.startswith('_'): print(f"{k}: {v}")
print("  sample constants:",out['_const'])
print("  sightline/km2:",out['_sightline per km2'])
