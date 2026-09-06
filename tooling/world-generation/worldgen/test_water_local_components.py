import numpy as np
from .audit_water_local_components import support_components, local_obstruction_owners, local_reach_owners
from .water_reach_solver import coupled_reach_correction
from .audit_water_component_subset import partition_components


def test_shared_bank_support_transitively_groups_components():
    assert support_components([{1,2},{3,4},{2,3},{9}])==[[0,1,2],[3]]


def test_exclusion_retires_whole_shared_component_not_only_named_station():
    components=[{'sources':[1,2]},{'sources':[3]}]
    assert partition_components(components,[1])==([components[1]],[components[0]])


def test_local_head_obeys_fixed_graph_incident_heads_and_valid_neighbor_bank():
    ground=np.full((5,5),12.,np.float32);ground[2,2]=11.
    args=(ground,ground,np.array([[2.,2.]]),[11.3],[.3],[[1.,0.]],[.5])
    kwargs=dict(fix_endpoints=False,head_links=[],incident_heads=[(0,10.6,True),(0,10.5,False)],maximum_lowering=3.)
    proposal=coupled_reach_correction(*args,**kwargs)
    assert proposal is not None and 10.5<=proposal['heads'][0]<=10.6
    ground[1,2]=9.
    neighbor={'node':5,'point':[1.,2.],'normal':[1.,0.],'radius':.5,'head':10.9}
    assert coupled_reach_correction(*args,**kwargs,external_banks=[neighbor]) is None


def test_two_obstructions_on_one_reach_are_repaired_together():
    from .water_geometry import condition_channel_profiles
    ground=np.full((7,11),12.,np.float32)
    ground[3,2:9]=10.
    ground[3,[4,6]]=12.
    points=np.array([[3.,x] for x in (2,8,3,4,5,6,7)])
    links=np.array([2,-1,3,4,5,6,1]);original_links=np.array([1,-1])
    def check(terrain):
        return condition_channel_profiles(terrain,points,links,np.full(7,10.5),
            np.ones(7),2,original_links,minimum_depth=.3,strict_banks=True)
    conflicts=check(ground)[-1]
    assert set(conflicts)=={0}
    owners=local_obstruction_owners(conflicts)
    assert set(owners)=={3,5}
    state=dict(links=links,original_links=original_links)
    assert set(local_reach_owners(state,conflicts))==set(range(7))
    # The intervening high sill is bank-contained locally, but still needs
    # lowering when both endpoints keep their original physical head.
    ground[3,5]=11.4
    nodes=[0,2,3,4,5,6,1]
    proposal=coupled_reach_correction(ground,ground,points[nodes],[10.5]*7,
        [.3]*7,[[1.,0.]]*7,[1.]*7,maximum_lowering=3.)
    assert proposal is not None
    corrected=ground.copy()
    corrected.ravel()[proposal['indices']]-=proposal['reductions'].astype(np.float32)
    assert check(corrected)[-1]=={}


def test_longitudinal_corridor_includes_valid_downstream_reach_that_backwaters_pool():
    # Source0 is rejected by an obstruction on source1. Source1 is locally
    # valid; fixing only source0 would freeze the very obstruction to repair.
    state=dict(original_links=np.array([1,2,-1]),links=np.array([3,4,-1,1,2]))
    conflicts={0:dict(node=0,obstructionPinned=False,drainageNodes=[0,3,1,4])}
    assert local_reach_owners(state,conflicts)=={}
    owners=local_reach_owners(state,conflicts,include_longitudinal=True)
    assert set(owners)=={0,1,2,3,4}
    assert owners[4]=={1} and owners[1]=={0,1}
