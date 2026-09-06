import numpy as np
from .water_regimes import authored_rivulet_mask,channel_depth_expectations


def test_heartland_authored_web_is_not_limited_to_twi_wetlands():
    rivers=np.array([0,0,0,0,0,1,0,0])
    area=np.array([.05,.05,.05,.05,.05,.05,.02,.120001])
    wet=np.array([False,False,False,False,True,True,True,True])
    regions=np.array([6,7,8,13,1,6,6,6])
    assert authored_rivulet_mask(rivers,area,wet,regions).tolist()==[True]*5+[False]*3


def test_shallow_rivulets_do_not_change_authored_river_depths():
    result=channel_depth_expectations(np.array([1,1,2,3]),np.array([True,False,False,False]))
    assert np.allclose(result,[.08,.30,.55,.85])


def test_native_footprint_preserves_carved_core_next_to_high_accumulation():
    from scipy import ndimage
    from .water_regimes import native_rivulet_core
    area=np.full((7,7),.8);area[:,3]=.05
    mask=authored_rivulet_mask(np.zeros_like(area),area,np.ones_like(area,bool))
    actual=native_rivulet_core(mask,(21,21))
    repeated=np.repeat(np.repeat(mask,3,0),3,1)
    expected=ndimage.gaussian_filter(repeated.astype(np.float32),2)>.30
    assert np.array_equal(actual,expected)
    assert actual[10,10]
    # Interpolating accumulation before its threshold is a different and
    # physically incorrect authoring operation: it erases the real core.
    linear=ndimage.affine_transform(area,np.eye(2)/3,offset=-1/3,
                                   output_shape=(21,21),order=1,mode='nearest')
    wrong=authored_rivulet_mask(np.zeros_like(linear),linear,np.ones_like(linear,bool))
    assert not (ndimage.gaussian_filter(wrong.astype(np.float32),2)>.30)[10,10]
