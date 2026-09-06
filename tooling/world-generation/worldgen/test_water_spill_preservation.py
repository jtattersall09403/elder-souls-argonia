import numpy as np
from .water_spill_preservation import retaining_spill_cuts


def fixture():
    g=np.full((7,7),5.,np.float32);g[3,3]=1.;g[3,4]=3.
    levels=np.full(g.shape,-np.inf,np.float32);levels[3,3]=3.08
    potential=g.copy();potential[3,3]=3.
    current=potential.copy();current[3,3]=current[3,4]=1.5
    return g,levels,potential,current


def test_only_our_lower_outlet_is_restored_not_interior_channel_bed():
    g,l,p,c=fixture()
    records=retaining_spill_cuts(g,l,p,c,[[24,.5,1.],[25,1.5,3.],[17,4.,5.]])
    assert [r['nativeIndex'] for r in records]==[25]
    assert records[0]['originalPoolEvidence'][0]['originalSpillM']==3.
    assert records[0]['toM']==3.


def test_cut_that_has_no_lower_external_route_does_not_drain_pool():
    g,l,p,c=fixture();c[3,3]=c[3,4]=3.
    assert retaining_spill_cuts(g,l,p,c,[[25,1.5,3.]])==[]


def test_three_millimetre_sill_breach_is_not_quantisation_or_ignored_freeboard():
    g,l,p,c=fixture();c[3,3]=c[3,4]=2.997
    assert len(retaining_spill_cuts(g,l,p,c,[[25,2.997,3.]]))==1


def test_immutable_bounds_keep_sill_and_retaining_head_not_submerged_floor():
    from .water_spill_preservation import immutable_retaining_lower_bounds
    g,l,p,_=fixture()
    lower=immutable_retaining_lower_bounds(g,l,p)
    assert lower[3,4]==3.
    assert np.isclose(lower[2,3],3.085)
    assert not np.isfinite(lower[3,3])


def test_retaining_bounds_obey_actual_diagonal_not_fictitious_bank_link():
    from .water_spill_preservation import immutable_retaining_lower_bounds
    g,l,p,_=fixture();g[2,2]=3.
    flips=np.zeros((6,6),bool)
    assert not np.isfinite(immutable_retaining_lower_bounds(g,l,p,flips)[2,2])
    flips[2,2]=True
    assert immutable_retaining_lower_bounds(g,l,p,flips)[2,2]==3.


def test_routine_indexed_repair_cannot_cross_immutable_retaining_bound():
    from .water_geometry import repair_channel_beds
    original=np.full((5,5),5.,np.float32);corrected=original.copy()
    lower=np.full(original.shape,-np.inf);lower[2,2]=4.
    conflicts={0:{'bedTargetM':2.2,'pathNodes':[0],'drainageNodes':[],
        'requiredLevelM':5.03,'obstructionBedM':5.,'obstructionNode':0}}
    count=repair_channel_beds(original,corrected,np.array([[2.,2.]]),conflicts,
        max_lowering=3.,indexed_limits={12:5.},retaining_lower_bounds=lower)
    assert count==0 and np.array_equal(original,corrected)


def test_originally_unretained_depression_is_not_reclassified_as_pool():
    g,l,p,c=fixture();l[:]=-np.inf
    assert retaining_spill_cuts(g,l,p,c,[[25,1.5,3.]])==[]


def test_all_retained_pools_are_audited_without_a_failed_channel_filter():
    g,l,p,c=fixture()
    g[1,1]=1.;g[1,2]=4.;l[1,1]=4.08;p[1,1]=p[1,2]=4.
    c[1,1]=c[1,2]=2.
    records=retaining_spill_cuts(g,l,p,c,[[9,2.,4.],[25,1.5,3.]])
    assert [r['nativeIndex'] for r in records]==[9,25]


def test_retained_sill_domain_crosses_seed_free_plateau_not_lower_valley():
    from .water_spill_preservation import retained_impoundment_domains
    g,l,p,c=fixture();g[3,4:6]=3.;p[3,4:6]=3.
    p[3,6]=g[3,6]=2.
    domain=retained_impoundment_domains(g,l,p)
    assert np.all(domain[3,3:6])
    assert not domain[3,6]


def test_diagonal_rim_uses_actual_native_topology():
    g,l,p,c=fixture();g[2,2]=3.;c[2,2]=1.5
    flips=np.zeros((6,6),bool)
    assert retaining_spill_cuts(g,l,p,c,[[16,1.5,3.]],flips)==[]
    flips[2,2]=True
    assert len(retaining_spill_cuts(g,l,p,c,[[16,1.5,3.]],flips))==1


def floor_fixture():
    g=np.full((3,3),1.,np.float32);corrected=g.copy();corrected[1,1]=.5
    levels=np.full(g.shape,3.08);potential=np.full(g.shape,3.);drained=np.full(g.shape,2.)
    return g,corrected,levels,potential,drained


def test_recovered_submerged_pool_floor_restores_original_not_new_terrain():
    from .water_spill_preservation import unnecessary_pool_floor_cuts
    g,c,l,p,d=floor_fixture()
    restored,excluded=unnecessary_pool_floor_cuts(g,c,l,p,d,l,p,[[4,.5,1.]],
        np.array([[1.],[1.]]),np.array([3.08]),np.array([.015]))
    assert [r['nativeIndex'] for r in restored]==[4]
    assert not excluded


def test_original_pool_must_really_be_recovered_before_floor_restoration():
    from .water_spill_preservation import unnecessary_pool_floor_cuts
    g,c,l,p,d=floor_fixture()
    restored,excluded=unnecessary_pool_floor_cuts(g,c,l,p,d,l,d,[[4,.5,1.]],
        np.array([[1.],[1.]]),np.array([3.08]),np.array([.015]))
    assert not restored
    assert excluded[0]['reason']=='original-pool-not-recovered'


def test_active_lower_channel_receiving_geometry_keeps_required_corner():
    from .water_spill_preservation import unnecessary_pool_floor_cuts
    g,c,l,p,d=floor_fixture()
    restored,excluded=unnecessary_pool_floor_cuts(g,c,l,p,d,l,p,[[4,.5,1.]],
        np.array([[1.],[1.]]),np.array([.8]),np.array([.3]))
    assert not restored
    assert excluded[0]['reason']=='active-channel-depth-support'


def test_unchanged_original_pool_does_not_authorise_generic_underwater_rollback():
    from .water_spill_preservation import unnecessary_pool_floor_cuts
    g,c,l,p,d=floor_fixture()
    restored,excluded=unnecessary_pool_floor_cuts(g,c,l,p,p,l,p,[[4,.5,1.]],
        np.array([[1.],[1.]]),np.array([3.08]),np.array([.015]))
    assert not restored and not excluded
