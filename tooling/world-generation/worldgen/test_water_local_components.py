import numpy as np
from .audit_water_local_components import support_components
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
