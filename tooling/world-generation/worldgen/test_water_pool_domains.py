import numpy as np
from .water_pool_domains import close_pool_domains


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
