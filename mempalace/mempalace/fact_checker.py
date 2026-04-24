"""
fact_checker.py — Contradiction detection between Knowledge Graph facts.
Implements Issue #27: compares triples from a branch vs trunk to detect conflicts.

Contradiction = same (subject, predicate) but different object between branch and trunk.
"""


def check_contradictions(branch_triples: list, trunk_triples: list) -> list:
    """
    Compare two triple lists and return contradictions.

    A contradiction: same subject + same predicate, but different object.
    Only active triples (current=True / valid_to=None) are compared.

    Returns a list of dicts:
        {subject, predicate, branch_value, trunk_value, severity}
    """
    # Index trunk by (subject.lower(), predicate.lower()) → object
    trunk_map: dict[tuple, str] = {}
    for t in trunk_triples:
        if t.get("current", True):
            key = (t["subject"].lower(), t["predicate"].lower())
            trunk_map[key] = t["object"]

    conflicts = []
    seen: set[tuple] = set()

    for bt in branch_triples:
        if not bt.get("current", True):
            continue
        key = (bt["subject"].lower(), bt["predicate"].lower())
        if key in seen:
            continue
        seen.add(key)

        trunk_val = trunk_map.get(key)
        if trunk_val is not None and trunk_val.lower() != bt["object"].lower():
            conflicts.append(
                {
                    "subject": bt["subject"],
                    "predicate": bt["predicate"],
                    "branch_value": bt["object"],
                    "trunk_value": trunk_val,
                    "severity": "high" if bt.get("confidence", 1.0) >= 0.8 else "low",
                }
            )

    return conflicts
