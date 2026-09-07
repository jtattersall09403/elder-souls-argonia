"""Save the physical solver state from an audit or a full field compilation."""
import numpy as np


def save_profile_cache(path, profile, orientation_levels, **provenance):
    """Keep native arrays and verification status without pickle payloads.

Full compilation must request capture_profile=True. Its returned profile
marks seasonal responses verified only after the fresh field guard passes.
Profiles-only audits preserve their explicitly unverified status.
"""
    if profile.get('diagnostics') is None:
        raise ValueError('Profile cache requires captured solver diagnostics')
    if 'seasonal_response_verified' in provenance:
        raise ValueError('Profile verification status must come from the compiler result')
    arrays = {key: value for key, value in profile.items()
              if isinstance(value, np.ndarray) and key != 'seasonal_response_verified'}
    diagnostics = {'diagnostic_' + key: value for key, value in profile['diagnostics'].items()
                   if isinstance(value, np.ndarray)}
    payload = {**arrays, 'orientation_levels': orientation_levels, **provenance, **diagnostics,
               'seasonal_response_verified': np.array(bool(profile.get('seasonal_response_verified', False)))}
    if any(np.asarray(value).dtype.hasobject for value in payload.values()):
        raise ValueError('Profile cache does not accept pickle-dependent object arrays')
    np.savez_compressed(path, **payload)
