import tempfile
import shutil
import pytest
from mempalace.knowledge_graph import KnowledgeGraph


@pytest.fixture
def kg():
    tmpdir = tempfile.mkdtemp()
    graph = KnowledgeGraph(db_path=f"{tmpdir}/test_kg.sqlite3")
    yield graph
    shutil.rmtree(tmpdir)


# ── Triples de base ───────────────────────────────────────────────

def test_add_triple_retourne_id(kg):
    tid = kg.add_triple("projet", "durée", "3 mois")
    assert isinstance(tid, str) and len(tid) > 0


def test_get_trunk_triples_retourne_les_triples_ajoutés(kg):
    kg.add_triple("projet", "durée", "3 mois")
    triples = kg.get_branch_triples("trunk")
    assert len(triples) == 1
    assert triples[0]["subject"] == "projet"
    assert triples[0]["predicate"] == "durée"
    assert triples[0]["object"] == "3 mois"


def test_get_branch_triples_branche_inconnue_retourne_vide(kg):
    result = kg.get_branch_triples("branche-inexistante-xyz")
    assert result == []


# ── Branches ──────────────────────────────────────────────────────

def test_create_branch_initialise_branche_vide(kg):
    kg.create_branch("session-abc")
    assert kg.get_branch_triples("session-abc") == []


def test_triple_branch_isolé_du_trunk(kg):
    kg.create_branch("session-isolée")
    kg.add_triple("projet", "durée", "3 mois", branch="session-isolée")
    assert kg.get_branch_triples("trunk") == []
    assert len(kg.get_branch_triples("session-isolée")) == 1


def test_trunk_isolé_de_la_branche(kg):
    kg.create_branch("session-b")
    kg.add_triple("projet", "chef", "Alice", branch="trunk")
    assert kg.get_branch_triples("session-b") == []


# ── Merge ─────────────────────────────────────────────────────────

def test_merge_branch_copie_triples_vers_trunk(kg):
    kg.create_branch("session-merge")
    kg.add_triple("projet", "durée", "3 mois", branch="session-merge")
    count = kg.merge_branch("session-merge")
    assert count == 1
    trunk = kg.get_branch_triples("trunk")
    assert any(t["predicate"] == "durée" for t in trunk)


def test_merge_branch_retourne_zero_si_déjà_dans_trunk(kg):
    kg.create_branch("session-dupe")
    kg.add_triple("projet", "durée", "3 mois", branch="trunk")
    kg.add_triple("projet", "durée", "3 mois", branch="session-dupe")
    count = kg.merge_branch("session-dupe")
    assert count == 0


def test_merge_branch_plusieurs_triples(kg):
    kg.create_branch("session-multi")
    kg.add_triple("projet", "durée", "3 mois", branch="session-multi")
    kg.add_triple("projet", "chef", "Alice", branch="session-multi")
    kg.add_triple("équipe", "taille", "5 personnes", branch="session-multi")
    count = kg.merge_branch("session-multi")
    assert count == 3
    trunk = kg.get_branch_triples("trunk")
    assert len(trunk) == 3


# ── Contradictions ────────────────────────────────────────────────

def test_detect_contradictions_vide_par_défaut(kg):
    kg.create_branch("session-propre")
    result = kg.detect_contradictions("session-propre")
    assert result == []


def test_detect_contradictions_trouve_le_conflit(kg):
    kg.create_branch("session-conflit")
    kg.add_triple("projet", "durée", "6 mois", branch="trunk")
    kg.add_triple("projet", "durée", "3 mois", branch="session-conflit")
    result = kg.detect_contradictions("session-conflit")
    assert len(result) == 1
    assert result[0]["predicate"] == "durée"


def test_detect_contradictions_pas_de_conflit_si_même_objet(kg):
    kg.create_branch("session-ok")
    kg.add_triple("projet", "durée", "3 mois", branch="trunk")
    kg.add_triple("projet", "durée", "3 mois", branch="session-ok")
    result = kg.detect_contradictions("session-ok")
    assert result == []
