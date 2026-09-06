import numpy as np
import pytest
from .water_route_alternatives import bank_aware_route, route_peak, validate_route_override


def test_routes_preserve_original_saddle_corridor_and_determinism():
    y, x = np.indices((13, 13))
    ground = (10 + np.abs(y-6)*2 + x*.1).astype(np.float32)
    previous = np.array([[6, i] for i in range(3, 10)], float)
    first = bank_aware_route(ground, previous, 2., .3)
    second = bank_aware_route(ground, previous, 2., .3)
    assert np.array_equal(first, second)
    assert route_peak(ground, first) <= route_peak(ground, previous)
    assert np.array_equal(first[[0,-1]], previous[[0,-1]])


def test_override_rejects_higher_bank_and_remote_corridor():
    ground = np.zeros((9,9), np.float32)
    previous = np.array([[4,3],[4,4],[4,5]], float)
    ground[3,4] = 3
    with pytest.raises(ValueError, match='higher original'):
        validate_route_override(ground,previous,[[4,3],[3,4],[4,5]],previous[0],previous[-1],2.)
    with pytest.raises(ValueError, match='corridor'):
        validate_route_override(ground,previous,[[4,3],[3,3],[2,3],[1,3],[2,4],[3,5],[4,5]],previous[0],previous[-1],2.)


def test_equal_saddle_existing_bend_avoids_unbanked_shortcut():
    # Measured native channel 377,237, reduced to a local immutable fixture.
    # The old shortcut visits (5,8), an exposed shoulder. The alternate bend
    # keeps the identical 307.430 m maximum saddle and existing anchors.
    ground = np.array([
      [315.021,314.730,314.276,313.585,312.540,310.929,308.641,305.472,298.813,300.449,298.301,296.788,296.311,296.029,295.821,295.498],
      [315.125,314.786,314.284,313.656,312.890,311.444,309.284,306.419,299.228,301.173,299.196,297.989,297.231,296.691,296.127,295.641],
      [315.230,314.859,314.324,313.609,312.788,311.800,309.902,307.123,300.373,302.467,300.486,299.207,298.612,297.622,296.488,295.815],
      [315.347,314.938,314.319,313.493,312.528,311.454,309.354,307.508,301.557,301.930,301.607,300.402,299.730,298.148,296.753,295.958],
      [315.500,315.035,314.339,313.422,311.916,310.539,308.896,307.045,302.762,302.753,302.448,301.274,300.317,298.686,297.084,296.096],
      [315.679,315.166,314.316,313.148,311.809,310.475,309.085,307.430,306.099,303.964,301.382,301.815,300.840,299.165,297.459,296.321],
      [315.877,315.321,314.565,313.622,304.845,303.848,303.429,308.072,306.802,305.248,302.316,300.500,301.333,299.852,298.218,296.895],
      [316.107,315.551,314.931,314.042,305.317,303.880,303.315,308.245,307.399,306.529,303.624,301.550,302.213,300.914,299.378,297.912],
      [316.427,315.821,315.174,314.260,306.111,304.293,303.441,308.254,307.306,306.907,305.443,304.403,303.498,302.327,300.822,299.239],
      [316.910,316.272,315.505,314.480,313.193,311.467,309.733,308.066,306.952,306.554,307.589,306.005,304.614,303.711,302.222,300.608],
      [317.597,316.921,311.615,314.868,313.391,311.869,310.388,309.055,308.173,307.800,307.681,307.102,305.427,304.150,302.802,301.194],
      [318.438,317.792,316.832,315.601,314.011,312.328,310.750,309.305,308.307,307.922,307.853,307.631,305.825,304.106,302.121,300.064],
      [314.319,318.578,317.853,316.589,315.055,313.320,311.602,310.068,308.931,308.261,308.006,307.735,305.943,303.572,301.284,299.090],
    ], np.float32)
    previous=np.array([[7,6],[6,6],[5,7],[5,8],[5,9],[5,10]],float)
    candidate=bank_aware_route(ground,previous,2.,.3)
    assert route_peak(ground,candidate)==route_peak(ground,previous)
    assert not any(np.array_equal(p,[5,8]) for p in candidate)
    assert np.array_equal(candidate[[0,-1]],previous[[0,-1]])
    from .water_geometry import refine_channel_stations, condition_channel_profiles, repair_channel_beds
    from .scale import RAW_M
    def residual(path):
        corrected=ground.copy()
        anchors=path[[0,-1]]
        initial=ground[anchors[:,0].astype(int),anchors[:,1].astype(int)]+.3
        original_links=np.array([1,-1])
        for _ in range(10):
            points,links,levels,radius,_=refine_channel_stations(corrected,anchors,original_links,
                initial,[2.,2.],minimum_depth=.3,routing_ground=ground,routing_overrides={0:path})
            diagnostics={}
            _,_,_,conflicts=condition_channel_profiles(corrected,points,links,levels,radius,2,original_links,
                orientation_levels=initial,minimum_depth=.3,strict_banks=True,diagnostics=diagnostics,
                allow_freefall=True,metres_per_pixel=RAW_M)
            changed=repair_channel_beds(ground,corrected,points,conflicts,max_lowering=3.,
                depth_targets=diagnostics['depthTargets'],pinned=diagnostics['pinned'],links=links,
                radius=diagnostics['bankRadius'],bank_normals=diagnostics['bankNormals'])
            if not changed:return len(conflicts)
        raise AssertionError('Local bounded repair did not converge')
    assert residual(previous)>0
    assert residual(candidate)==0
