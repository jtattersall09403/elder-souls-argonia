import numpy as np
import pytest
from .water_pool_domains import (close_pool_domains,preserve_reference_pool_heads,
                                standing_pool_response,connected_standing_pool_labels,
                                preserve_pool_response_ranges)


def test_shore_growth_preserves_reviewed_pool_range_and_combined_minimum():
    levels=np.ones((2,2));labels=np.ones((2,2),int)
    reference={'schemaVersion':1,'gridSize':2,'pools':[
        {'nativeSeed':0,'planeM':1.,'seasonResponse':.5,'tideResponse':.2}]}
    season,tide=preserve_pool_response_ranges(levels,levels,labels,levels,reference)
    assert np.all(season==.5) and np.all(tide==np.float32(.2))
    reference['pools'] += [{'nativeSeed':3,'planeM':1.,'seasonResponse':0.,'tideResponse':1.}]
    with pytest.raises(ValueError,match='incompatible reviewed low-water extrema'):
        preserve_pool_response_ranges(levels,levels,labels,levels,reference)


def test_flat_pool_response_uses_real_diagonal_connectivity_and_distinct_heads():
    levels=np.array([[1.,2.],[3.,1.]])
    wet=np.ones((2,2),bool)
    response=np.array([[0.,.2],[.3,1.]])
    separate=connected_standing_pool_labels(levels,wet,np.zeros((1,1),bool))
    joined=connected_standing_pool_labels(levels,wet,np.ones((1,1),bool))
    assert separate[0,0]!=separate[1,1]
    assert joined[0,0]==joined[1,1]
    result=standing_pool_response(response,joined,wet)
    assert result[0,0]==result[1,1]==1.
    assert result[0,1]==np.float32(.2) and result[1,0]==np.float32(.3)


def test_connected_response_retains_the_seed_components_full_climate_range():
    climate=np.array([[1.,.5,.2]])
    seed_labels=np.array([[1,1,2]])
    standing=np.array([[False,True,True]])
    seed_response=standing_pool_response(climate,seed_labels,standing)
    connected=connected_standing_pool_labels(np.ones((1,3)),standing)
    response=standing_pool_response(seed_response,connected,standing)
    assert np.all(response[standing]==1.)


def test_recovered_pool_keeps_its_response_even_without_an_initially_selected_pool():
    levels=np.full((2,2),-np.inf);labels=np.ones((2,2),int)
    reference=np.full((2,2),.55);potential=np.full((2,2),.52)
    recovered,_,_=preserve_reference_pool_heads(levels,labels,potential,reference,potential,
                                                ground=np.full((2,2),.48))
    response=np.array([[0.,1.],[.5,0.]])
    result=standing_pool_response(response,labels,np.isfinite(recovered))
    assert np.all(result==1.)
    assert response[0,0]==0.  # Source climate field is not mutated.


def test_original_pool_plane_cannot_drift_with_repaired_channel_freeboard():
    levels=np.full((2,2),3.08);labels=np.ones((2,2),int);potential=np.full((2,2),3.)
    reference=np.full((2,2),3.045)
    result,locked,changes=preserve_reference_pool_heads(levels,labels,potential,reference,potential)
    assert np.allclose(result,3.045) and locked==frozenset([1])
    assert changes[0]['fromM']==3.08


def test_original_pool_plane_is_not_forced_onto_a_changed_outlet():
    levels=np.full((2,2),2.08);labels=np.ones((2,2),int)
    result,locked,changes=preserve_reference_pool_heads(levels,labels,np.full((2,2),2.),
        np.full((2,2),3.045),np.full((2,2),3.))
    assert np.array_equal(result,levels) and not locked and not changes


def test_original_head_is_set_before_shore_domain_growth():
    g=np.full((5,5),2.,np.float32);g[2,1]=.2;g[2,2]=.57;g[2,3]=.2
    levels=np.full(g.shape,-np.inf);levels[2,1]=.603332
    reference=levels.copy();reference[2,1]=.549202
    labels=np.zeros(g.shape,int);labels[2,1]=1
    potential=np.full(g.shape,.6);potential[2,1]=.523332
    fixed,_,_=preserve_reference_pool_heads(levels,labels,potential,reference,potential)
    wrong,_,_=close_pool_domains(g,levels,labels,potential,potential)
    correct,_,_=close_pool_domains(g,fixed,labels,potential,potential)
    assert np.isfinite(wrong[2,3])
    assert not np.isfinite(correct[2,2:4]).any()


def test_original_retained_seed_survives_new_component_size_selection():
    levels=np.full((2,2),-np.inf);labels=np.ones((2,2),int)
    reference=np.full((2,2),.549202);potential=np.full((2,2),.523332)
    result,locked,_=preserve_reference_pool_heads(levels,labels,potential,reference,potential,
                                                ground=np.full((2,2),.48))
    assert np.allclose(result,.549202) and locked==frozenset([1])


def fixture():
    ground=np.full((9,9),4.,np.float32)
    ground[4,2:7]=.8
    levels=np.full((9,9),-np.inf,np.float32);levels[4,4]=1.
    labels=np.zeros((9,9),int);labels[4,4]=1
    filled=np.ones((9,9),np.float32)*.92
    potential=np.ones((9,9),np.float32)*.92
    return ground,levels,labels,filled,potential


def test_seed_free_shallow_backwater_inherits_one_unchanged_plane():
    g,l,b,f,p=fixture()
    result,owners,count=close_pool_domains(g,l,b,f,p)
    assert count==4
    assert np.all(result[4,2:7]==1.) and np.all(owners[4,2:7]==1)
    assert np.array_equal(result[np.isfinite(l)],l[np.isfinite(l)])


def test_dry_crest_and_incompatible_plane_stop_closure():
    g,l,b,f,p=fixture();g[4,3]=1.1;l[4,5]=.9;b[4,5]=2
    result,owners,_=close_pool_domains(g,l,b,f,p)
    assert not np.isfinite(result[4,2])
    assert result[4,5]==np.float32(.9) and owners[4,5]==2
    assert result[4,6]==np.float32(.9)


def test_lower_potential_flowing_outlet_is_not_a_flat_pool_shelf():
    g,l,b,f,p=fixture();p[4,5:]=.5
    result,owners,_=close_pool_domains(g,l,b,f,p)
    assert result[4,3]==1.
    assert not np.isfinite(result[4,5]) and not np.isfinite(result[4,6])


def test_fringe_cannot_claim_a_lower_existing_channel_head():
    g,l,b,f,p=fixture();heads=np.full(g.shape,1.2);heads[4,5:]=.95
    f[4,5:]=g[4,5:]
    result,_,_=close_pool_domains(g,l,b,f,p,maximum_head=heads)
    assert result[4,3]==1. and not np.isfinite(result[4,5])


def test_depth_expectation_cannot_punch_holes_in_connected_impoundment():
    g,l,b,f,p=fixture()
    g[4,5]=.4
    heads=g+.08
    result,owners,_=close_pool_domains(g,l,b,f,p,maximum_head=heads)
    assert np.all(result[4,2:7]==1.)
    assert np.all(owners[4,2:7]==1)
    assert g[4,5]==np.float32(.4)  # Occupancy only: no excavation.


def test_measured_wetland_pool_interior_is_not_a_153mm_false_bank():
    # Native (642,3419), authored wetland source cell (212,1141).
    # Every corner is inside one real 12.417549m drainage impoundment.
    g=np.full((5,5),13.,np.float32)
    g[2,1:4]=[12.298285,12.257444,12.285203]
    l=np.full(g.shape,-np.inf,np.float32);l[2,1]=12.459982
    b=np.zeros(g.shape,int);b[2,1]=7
    f=np.full(g.shape,12.417549,np.float32)
    result,owners,_=close_pool_domains(g,l,b,f,f,maximum_head=g+.08)
    assert np.all(result[2,1:4]==l[2,1])
    assert np.all(owners[2,1:4]==7)


def test_repaired_outlet_is_a_real_boundary_even_inside_old_impoundment():
    g,l,b,f,p=fixture();p[:]=2.;f[4,5:]=.5
    result,_,_=close_pool_domains(g,l,b,f,p)
    assert result[4,3]==1. and not np.isfinite(result[4,5])


def test_same_plane_carries_its_spill_through_a_retained_shore_seed():
    g,l,b,f,p=fixture()
    l[4,5]=1.;b[4,5]=2
    f[4,4]=p[4,4]=.90
    f[4,5]=p[4,5]=.96
    f[4,6]=p[4,6]=.94
    result,owners,_=close_pool_domains(g,l,b,f,p)
    assert result[4,6]==1.
    assert owners[4,5]==2  # Existing seed identity is retained.
    assert np.array_equal(result[np.isfinite(l)],l[np.isfinite(l)])
    # A truly lowered outlet remains outside the standing plane.
    f[4,6]=.85
    result,_,_=close_pool_domains(g,l,b,f,p)
    assert not np.isfinite(result[4,6])
