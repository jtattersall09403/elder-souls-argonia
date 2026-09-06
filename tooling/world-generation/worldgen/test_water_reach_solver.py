import numpy as np
from .water_reach_solver import coupled_reach_correction


def fixture():
    ground=np.full((7,9),12.,np.float32);ground[3,2:7]=10.
    ground[3,3]=14.;ground[3,5]=13.5
    points=np.array([[3.,x] for x in range(2,7)])
    heads=np.full(5,10.5);depths=np.full(5,.5)
    normals=np.tile([1.,0.],(5,1));radii=np.ones(5)
    return ground,points,heads,depths,normals,radii


def test_joint_reach_solves_local_and_longitudinal_sills_together_minimally():
    ground,points,heads,depths,normals,radii=fixture()
    result=coupled_reach_correction(ground,ground,points,heads,depths,normals,radii)
    assert result is not None
    assert np.isclose(result['maximumOriginalLoweringM'],4.)
    assert np.allclose(result['heads'],10.5)
    cuts={int(i):d for i,d in zip(result['indices'],result['reductions']) if d>1e-6}
    assert cuts=={30:4.,32:3.5}
    assert coupled_reach_correction(ground,ground,points,heads,depths,normals,radii,maximum_lowering=3.) is None


def test_joint_reach_cannot_excavate_a_protected_retaining_crest():
    ground,points,heads,depths,normals,radii=fixture()
    assert coupled_reach_correction(ground,ground,points,heads,depths,normals,radii,protected=[30]) is None


def test_joint_reach_indexed_budget_cannot_override_immutable_spill_floor():
    ground,points,heads,depths,normals,radii=fixture()
    lower=np.full(ground.shape,-np.inf);lower.flat[30]=10.2
    assert coupled_reach_correction(ground,ground,points,heads,depths,normals,radii,
                                   retaining_lower_bounds=lower) is None


def test_reclassified_banked_interval_cannot_keep_obsolete_freefall_exemption():
    ground,points,heads,depths,normals,radii=fixture()
    ground[:,3]=10.25;ground[3,3]=14.
    falling=np.array([False,True,False,False,False])
    old=coupled_reach_correction(ground,ground,points,heads,depths,normals,radii,falling=falling)
    assert old is not None
    corrected=ground.copy()
    corrected.ravel()[old['indices']]-=old['reductions'].astype(np.float32)
    # Once actual geometry makes this interval banked, its low real banks
    # cannot retain the incident10.5m head. Never accept the former sheet.
    assert coupled_reach_correction(ground,corrected,points,heads,depths,normals,radii,
                                   falling=np.zeros(5,bool)) is None


def test_shared_support_cut_must_preserve_neighbor_fixed_head_and_bank():
    ground,points,heads,depths,normals,radii=fixture()
    ground[2,3]=9.
    assert coupled_reach_correction(ground,ground,points,heads,depths,normals,radii) is not None
    neighbor={'node':99,'point':[2.,3.],'normal':[1.,0.],'radius':.5,'head':11.9}
    assert coupled_reach_correction(ground,ground,points,heads,depths,normals,radii,
                                   external_banks=[neighbor]) is None


def test_artificial_record_boundary_does_not_freeze_an_infeasible_interior_head():
    from .audit_water_joint_cuts import connected_reach_path
    # Physical channel0→3→1→4→2, split into two export records at1.
    state={'original_links':np.array([1,2,-1]),'links':np.array([3,4,-1,1,2]),
           'orientation_levels':np.array([3.,2.,1.])}
    diagnostics={'bankCap':np.array([4.,2.5,2.,1.5,2.]),
                 'solvedHeads':np.array([3.,2.,1.,1.5,1.2]),
                 'falling':np.zeros(5,bool),'pinned':np.zeros(5,bool)}
    path,members=connected_reach_path(state,0,diagnostics)
    assert path==[0,3,1,4,2] and members==[0,1]
    diagnostics['pinned'][1]=True
    assert connected_reach_path(state,0,diagnostics)[0]==[0,3,1]


def test_rejected_downstream_fallback_is_not_a_physical_fixed_head():
    from .audit_water_joint_cuts import connected_reach_path
    state={'original_links':np.array([1,2,-1]),'links':np.array([3,4,-1,1,2]),
           'orientation_levels':np.array([3.,2.,1.])}
    diagnostics={'bankCap':np.full(5,4.),'solvedHeads':np.array([3.,1.5,1.,2.,1.2]),
                 'falling':np.zeros(5,bool),'pinned':np.zeros(5,bool),'rejectedSources':{1}}
    assert connected_reach_path(state,0,diagnostics)==([0,3,1,4,2],[0,1])
    diagnostics['pinned'][1]=True
    assert connected_reach_path(state,0,diagnostics)==([0,3,1],[0])
