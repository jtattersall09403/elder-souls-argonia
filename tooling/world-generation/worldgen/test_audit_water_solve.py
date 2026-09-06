from .audit_water_solve import proposal_gate


def test_fewer_constraints_cannot_hide_new_neighbour_failure():
    assert proposal_gate({1,2,3},{4})==(False,[4],[1,2,3])


def test_single_pass_requires_actual_progress_without_new_failures():
    assert proposal_gate({1,2},{2})==(True,[],[1])
    assert proposal_gate({1,2},{1,2})==(False,[],[])
