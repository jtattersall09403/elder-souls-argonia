"""Water regimes derived from the existing fluvial terrain-authoring inputs."""
import numpy as np
from scipy import ndimage

WETLAND_HEARTLANDS=(6,7,8,13)
RIVULET_BASE_DEPTH_M=.08


def authored_rivulet_mask(rivers,accumulation,wet_ground,regions=None):
    """Match refine_province's wet mask and fluvial._rivulets' area bounds."""
    wet=np.asarray(wet_ground,bool)
    if regions is not None:wet=wet|np.isin(regions,WETLAND_HEARTLANDS)
    return wet&(np.asarray(rivers)==0)&(accumulation>.02)&(accumulation<=.12)


def channel_depth_expectations(bands,rivulets):
    result=np.select([bands==b for b in (1,2,3)],[.30,.55,.85],default=.30).astype(np.float32)
    result[np.asarray(rivulets,bool)]=RIVULET_BASE_DEPTH_M
    return result


def native_rivulet_core(coarse_mask, shape, coarse_step=3, sample_step=1):
    """Exactly mirror the carver's repeated predicate and softened core."""
    native=np.repeat(np.repeat(np.asarray(coarse_mask,bool),coarse_step,0),coarse_step,1)
    native=native[::sample_step,::sample_step][:shape[0],:shape[1]]
    if native.shape!=tuple(shape):raise ValueError('Incompatible native rivulet grid')
    return ndimage.gaussian_filter(native.astype(np.float32),2./sample_step)>.30
