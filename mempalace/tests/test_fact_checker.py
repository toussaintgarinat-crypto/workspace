import pytest
from mempalace.fact_checker import check_contradictions


def triple(subject, predicate, obj, confidence=1.0, current=True):
    return {"subject": subject, "predicate": predicate, "object": obj,
            "confidence": confidence, "current": current}


def test_empty_lists_return_no_conflicts():
    assert check_contradictions([], []) == []


def test_no_conflict_when_same_object():
    t = [triple("projet", "durée", "3 mois")]
    assert check_contradictions(t, t) == []


def test_detects_contradiction_different_object():
    branch = [triple("projet", "durée", "3 mois")]
    trunk  = [triple("projet", "durée", "6 mois")]
    result = check_contradictions(branch, trunk)
    assert len(result) == 1
    assert result[0]["subject"] == "projet"
    assert result[0]["predicate"] == "durée"
    assert result[0]["branch_value"] == "3 mois"
    assert result[0]["trunk_value"] == "6 mois"


def test_case_insensitive_subject_and_predicate():
    branch = [triple("Projet", "Durée", "3 mois")]
    trunk  = [triple("projet", "durée", "6 mois")]
    result = check_contradictions(branch, trunk)
    assert len(result) == 1


def test_severity_high_when_confidence_gte_08():
    branch = [triple("projet", "durée", "3 mois", confidence=0.9)]
    trunk  = [triple("projet", "durée", "6 mois", confidence=0.9)]
    result = check_contradictions(branch, trunk)
    assert result[0]["severity"] == "high"


def test_severity_low_when_confidence_lt_08():
    branch = [triple("projet", "durée", "3 mois", confidence=0.5)]
    trunk  = [triple("projet", "durée", "6 mois", confidence=0.5)]
    result = check_contradictions(branch, trunk)
    assert result[0]["severity"] == "low"


def test_ignores_inactive_branch_triples():
    branch = [triple("projet", "durée", "3 mois", current=False)]
    trunk  = [triple("projet", "durée", "6 mois")]
    assert check_contradictions(branch, trunk) == []


def test_no_duplicate_conflicts():
    branch = [triple("projet", "durée", "3 mois"), triple("projet", "durée", "3 mois")]
    trunk  = [triple("projet", "durée", "6 mois")]
    result = check_contradictions(branch, trunk)
    assert len(result) == 1


def test_unrelated_predicates_dont_conflict():
    branch = [triple("projet", "durée", "3 mois")]
    trunk  = [triple("projet", "chef", "Alice")]
    assert check_contradictions(branch, trunk) == []


def test_multiple_predicates_only_conflicting_detected():
    branch = [triple("projet", "durée", "3 mois"), triple("projet", "chef", "Alice")]
    trunk  = [triple("projet", "durée", "6 mois"), triple("projet", "chef", "Alice")]
    result = check_contradictions(branch, trunk)
    assert len(result) == 1
    assert result[0]["predicate"] == "durée"
