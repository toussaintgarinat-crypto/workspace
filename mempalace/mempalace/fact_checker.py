"""
fact_checker.py — Détection de contradictions entre faits du Knowledge Graph.
Câble l'Issue #27 : compare les triples d'une branche vs le trunk pour détecter les conflits.

Contradiction = même (sujet, prédicat) mais objet différent entre la branche et le trunk.
"""


def check_contradictions(branch_triples: list, trunk_triples: list) -> list:
    """
    Compare deux listes de triples et retourne les contradictions.

    Une contradiction : même sujet + même prédicat, mais objet différent.
    Seuls les triples actifs (current=True / valid_to=None) sont comparés.

    Retourne une liste de dicts :
        {subject, predicate, branch_value, trunk_value, severity}
    """
    # Index trunk : (subject.lower(), predicate.lower()) → object
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
