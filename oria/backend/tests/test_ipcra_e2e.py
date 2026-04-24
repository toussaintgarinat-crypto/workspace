"""
Tests end-to-end du flux IPCRA.
Couvre : CRUD sessions · gestion des phases · assist IA · traces VoltAgent ·
         contradictions KG · Avocat du Diable · flux complet 5-phases.
"""
import json
import pytest
import httpx
from unittest.mock import patch, AsyncMock, MagicMock

from database import SessionLocal
from models.agent import AgentDefinition


# ── Helpers ──────────────────────────────────────────────────────

def create_session(client, titre="Test session", agent_id=None):
    body = {"titre": titre}
    if agent_id:
        body["agent_id"] = agent_id
    r = client.post("/api/ipcra/", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def create_agent(nom="Agent Test", forge_url="http://forge-test:3001", use_memory=False):
    """Crée un AgentDefinition directement en base et retourne son id."""
    db = SessionLocal()
    try:
        agent = AgentDefinition(
            nom=nom,
            world_id="world-test",
            owner_id="user-test-abc-123",
            forge_url=forge_url,
            forge_provider="anthropic",
            forge_model="claude-3-haiku",
            use_memory=use_memory,
            use_ipcra=True,
            is_active=True,
        )
        db.add(agent)
        db.commit()
        return agent.id
    finally:
        db.close()


def mock_forge_response(answer: str, steps: list = None):
    """Construit un mock httpx.AsyncClient qui retourne une réponse Forge."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"answer": answer, "steps": steps or []}

    mock_http = AsyncMock()
    mock_http.__aenter__ = AsyncMock(return_value=mock_http)
    mock_http.__aexit__ = AsyncMock(return_value=False)
    mock_http.post = AsyncMock(return_value=mock_resp)
    return mock_http


# ── CRUD Sessions ─────────────────────────────────────────────────

class TestSessionCRUD:
    def test_create_session_crée_branche_kg(self, client):
        with patch("mempalace_client.create_branch", return_value=True) as mock_branch:
            r = client.post("/api/ipcra/", json={"titre": "Mon projet test"})
        assert r.status_code == 200
        data = r.json()
        assert data["titre"] == "Mon projet test"
        assert data["phase"] == "identifier"
        assert data["status"] == "active"
        assert "id" in data
        mock_branch.assert_called_once_with(data["id"])

    def test_list_sessions_retourne_les_siennes(self, client):
        create_session(client, "Session A")
        create_session(client, "Session B")
        r = client.get("/api/ipcra/")
        assert r.status_code == 200
        assert len(r.json()) == 2

    def test_get_session_existante(self, client):
        s = create_session(client)
        r = client.get(f"/api/ipcra/{s['id']}")
        assert r.status_code == 200
        assert r.json()["id"] == s["id"]

    def test_get_session_inconnue_retourne_404(self, client):
        r = client.get("/api/ipcra/session-inexistante-000")
        assert r.status_code == 404

    def test_delete_session(self, client):
        s = create_session(client)
        r = client.delete(f"/api/ipcra/{s['id']}")
        assert r.status_code == 204
        assert client.get(f"/api/ipcra/{s['id']}").status_code == 404

    def test_update_status_valide(self, client):
        s = create_session(client)
        r = client.patch(f"/api/ipcra/{s['id']}/status", params={"status": "archivee"})
        assert r.status_code == 200
        assert r.json()["status"] == "archivee"

    def test_update_status_invalide_retourne_400(self, client):
        s = create_session(client)
        r = client.patch(f"/api/ipcra/{s['id']}/status", params={"status": "n_existe_pas"})
        assert r.status_code == 400


# ── Gestion des phases ────────────────────────────────────────────

class TestPhases:
    def test_mise_à_jour_contenu_phase(self, client):
        s = create_session(client)
        r = client.patch(
            f"/api/ipcra/{s['id']}/phase/identifier",
            json={"content": "Objectif : réduire le temps de déploiement de 50 %"},
        )
        assert r.status_code == 200
        assert "réduire le temps" in r.json()["identifier_notes"]

    def test_phase_invalide_retourne_400(self, client):
        s = create_session(client)
        r = client.patch(f"/api/ipcra/{s['id']}/phase/inexistante", json={"content": "x"})
        assert r.status_code == 400

    def test_advance_passe_à_planifier(self, client):
        s = create_session(client)
        r = client.post(f"/api/ipcra/{s['id']}/advance")
        assert r.status_code == 200
        assert r.json()["phase"] == "planifier"

    def test_advance_toutes_phases_dans_lordre(self, client):
        s = create_session(client)
        phases_attendues = ["planifier", "creer", "reflechir", "ajuster"]
        for phase in phases_attendues:
            r = client.post(f"/api/ipcra/{s['id']}/advance")
            assert r.status_code == 200
            assert r.json()["phase"] == phase

    def test_advance_dernière_phase_complète_la_session(self, client):
        s = create_session(client)
        for _ in range(5):
            client.post(f"/api/ipcra/{s['id']}/advance")
        r = client.get(f"/api/ipcra/{s['id']}")
        assert r.json()["status"] == "completee"

    def test_advance_vers_ajuster_déclenche_merge_kg(self, client):
        """Entrer en phase 'ajuster' doit appeler merge_branch exactement une fois."""
        s = create_session(client)
        for _ in range(3):  # identifier → planifier → creer → reflechir
            client.post(f"/api/ipcra/{s['id']}/advance")

        with patch("mempalace_client.merge_branch", return_value={"merged": 7, "conflicts": []}) as mock_merge:
            r = client.post(f"/api/ipcra/{s['id']}/advance")

        assert r.status_code == 200
        assert r.json()["phase"] == "ajuster"
        mock_merge.assert_called_once_with(s["id"])
        assert r.json()["merge"]["merged"] == 7

    def test_advance_avec_contenu_déclenche_sync_mempalace(self, client):
        """Avancer une phase non-vide doit indexer son contenu dans MemPalace."""
        s = create_session(client)
        client.patch(
            f"/api/ipcra/{s['id']}/phase/identifier",
            json={"content": "Contenu important à synchroniser"},
        )
        with patch("mempalace_client.sync", return_value=True) as mock_sync:
            client.post(f"/api/ipcra/{s['id']}/advance")

        mock_sync.assert_called_once()
        call_args = mock_sync.call_args[0]
        assert "Contenu important à synchroniser" in call_args[0]
        assert call_args[1] == s["id"]
        assert call_args[2] == "identifier"

    def test_advance_sans_contenu_ne_sync_pas(self, client):
        """Une phase vide ne doit pas déclencher de sync MemPalace."""
        s = create_session(client)
        with patch("mempalace_client.sync") as mock_sync:
            client.post(f"/api/ipcra/{s['id']}/advance")
        mock_sync.assert_not_called()


# ── Assist IA ────────────────────────────────────────────────────

class TestAssist:
    def test_assist_sans_agent_retourne_guide_textuel(self, client):
        s = create_session(client)
        r = client.post(
            f"/api/ipcra/{s['id']}/assist",
            json={"phase": "identifier", "prompt": "Comment démarrer ?"},
        )
        assert r.status_code == 200
        data = r.json()
        assert len(data["answer"]) > 20
        assert data.get("steps") == []

    def test_assist_phase_invalide_retourne_400(self, client):
        s = create_session(client)
        r = client.post(
            f"/api/ipcra/{s['id']}/assist",
            json={"phase": "phase_inconnue", "prompt": "test"},
        )
        assert r.status_code == 400

    def test_assist_persiste_trace_en_base(self, client):
        s = create_session(client)
        client.post(
            f"/api/ipcra/{s['id']}/assist",
            json={"phase": "planifier", "prompt": "Construis mon plan d'action"},
        )
        traces = client.get(f"/api/ipcra/{s['id']}/traces").json()
        assert len(traces) == 1
        t = traces[0]
        assert t["phase"] == "planifier"
        assert t["agent_nom"] == "guide-textuel"
        assert "Construis mon plan" in t["prompt"]

    def test_assist_avec_agent_forge_appelle_forge(self, client):
        agent_id = create_agent("Agent Forge Test")
        s = create_session(client, agent_id=agent_id)

        with patch("httpx.AsyncClient", return_value=mock_forge_response("Voici mon analyse.", [{"step": 1}])):
            r = client.post(
                f"/api/ipcra/{s['id']}/assist",
                json={"phase": "creer", "prompt": "Génère le livrable"},
            )

        assert r.status_code == 200
        assert r.json()["answer"] == "Voici mon analyse."

    def test_assist_avec_agent_forge_down_dégrade_gracieusement(self, client):
        agent_id = create_agent("Agent Forge Down", forge_url="http://forge-down:9999")
        s = create_session(client, agent_id=agent_id)

        mock_http = AsyncMock()
        mock_http.__aenter__ = AsyncMock(return_value=mock_http)
        mock_http.__aexit__ = AsyncMock(return_value=False)
        mock_http.post = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))

        with patch("httpx.AsyncClient", return_value=mock_http):
            r = client.post(
                f"/api/ipcra/{s['id']}/assist",
                json={"phase": "identifier", "prompt": "Test"},
            )

        assert r.status_code == 200
        assert "non disponible" in r.json()["answer"]

    def test_assist_avec_mempalace_injecte_contexte(self, client):
        """Avec use_memory=True, le prefetch MemPalace doit être appelé."""
        agent_id = create_agent("Agent Mémoire", use_memory=True)
        s = create_session(client, agent_id=agent_id)

        with patch("mempalace_client.prefetch", return_value=[]) as mock_prefetch, \
             patch("httpx.AsyncClient", return_value=mock_forge_response("Réponse avec mémoire")):
            client.post(
                f"/api/ipcra/{s['id']}/assist",
                json={"phase": "identifier", "prompt": "Test mémoire"},
            )

        mock_prefetch.assert_called_once()


# ── Traces VoltAgent ─────────────────────────────────────────────

class TestTraces:
    def test_traces_vides_initialement(self, client):
        s = create_session(client)
        r = client.get(f"/api/ipcra/{s['id']}/traces")
        assert r.status_code == 200
        assert r.json() == []

    def test_traces_saccumulent_par_assist(self, client):
        s = create_session(client)
        for phase in ["identifier", "planifier", "creer"]:
            client.post(
                f"/api/ipcra/{s['id']}/assist",
                json={"phase": phase, "prompt": f"Aide pour {phase}"},
            )
        traces = client.get(f"/api/ipcra/{s['id']}/traces").json()
        assert len(traces) == 3
        phases_tracées = {t["phase"] for t in traces}
        assert phases_tracées == {"identifier", "planifier", "creer"}

    def test_traces_triées_par_date_asc(self, client):
        s = create_session(client)
        for phase in ["identifier", "planifier"]:
            client.post(
                f"/api/ipcra/{s['id']}/assist",
                json={"phase": phase, "prompt": "test"},
            )
        traces = client.get(f"/api/ipcra/{s['id']}/traces").json()
        assert traces[0]["phase"] == "identifier"
        assert traces[1]["phase"] == "planifier"

    def test_traces_session_inconnue_retourne_404(self, client):
        r = client.get("/api/ipcra/session-inconnue-xyz/traces")
        assert r.status_code == 404

    def test_trace_contient_duree_ms(self, client):
        s = create_session(client)
        client.post(
            f"/api/ipcra/{s['id']}/assist",
            json={"phase": "reflechir", "prompt": "Analyse"},
        )
        trace = client.get(f"/api/ipcra/{s['id']}/traces").json()[0]
        assert isinstance(trace["duree_ms"], int)
        assert trace["duree_ms"] >= 0


# ── Contradictions KG ─────────────────────────────────────────────

class TestContradictions:
    def test_contradictions_vides_par_défaut(self, client):
        s = create_session(client)
        r = client.get(f"/api/ipcra/{s['id']}/contradictions")
        assert r.status_code == 200
        data = r.json()
        assert data["session_id"] == s["id"]
        assert data["conflicts"] == []
        assert data["count"] == 0

    def test_contradictions_retourne_les_conflits_détectés(self, client):
        s = create_session(client)
        conflicts = [
            {
                "sujet": "projet",
                "predicat": "durée",
                "branche": "3 mois",
                "trunk": "6 mois",
                "severity": "high",
            }
        ]
        with patch("mempalace_client.check_contradictions", return_value=conflicts):
            r = client.get(f"/api/ipcra/{s['id']}/contradictions")

        assert r.status_code == 200
        assert r.json()["count"] == 1
        assert r.json()["conflicts"][0]["severity"] == "high"

    def test_contradictions_session_inconnue_retourne_404(self, client):
        r = client.get("/api/ipcra/session-fantome/contradictions")
        assert r.status_code == 404


# ── Avocat du Diable ─────────────────────────────────────────────

class TestDevilAdvocate:
    def test_devil_sans_agent_retourne_400(self, client):
        s = create_session(client)
        r = client.post(
            f"/api/ipcra/{s['id']}/devil",
            json={"content": "Le projet est parfait.", "phase": "planifier"},
        )
        assert r.status_code == 400

    def test_devil_retourne_json_structuré(self, client):
        agent_id = create_agent("Agent Devil")
        s = create_session(client, agent_id=agent_id)

        devil_payload = {
            "critique": "Le plan ignore les risques techniques majeurs.",
            "biais": ["Optimisme excessif", "Biais de confirmation", "Effet de halo"],
            "questions": [
                "Que se passe-t-il si le délai double ?",
                "Qui valide la qualité du livrable ?",
            ],
            "steelman": "Un délai court peut favoriser la créativité sous contrainte.",
        }

        with patch("httpx.AsyncClient", return_value=mock_forge_response(
            json.dumps(devil_payload, ensure_ascii=False)
        )):
            r = client.post(
                f"/api/ipcra/{s['id']}/devil",
                json={"content": "Plan sans plan B.", "phase": "planifier"},
            )

        assert r.status_code == 200
        data = r.json()
        assert "critique" in data
        assert isinstance(data["biais"], list)
        assert len(data["biais"]) == 3
        assert isinstance(data["questions"], list)
        assert "steelman" in data

    def test_devil_forge_down_retourne_503(self, client):
        agent_id = create_agent("Agent Devil Down", forge_url="http://forge-down:9999")
        s = create_session(client, agent_id=agent_id)

        mock_http = AsyncMock()
        mock_http.__aenter__ = AsyncMock(return_value=mock_http)
        mock_http.__aexit__ = AsyncMock(return_value=False)
        mock_http.post = AsyncMock(side_effect=httpx.ConnectError("down"))

        with patch("httpx.AsyncClient", return_value=mock_http):
            r = client.post(
                f"/api/ipcra/{s['id']}/devil",
                json={"content": "Contenu test", "phase": "reflechir"},
            )
        assert r.status_code == 503

    def test_devil_persiste_trace_avocat(self, client):
        """L'Avocat du Diable doit créer une trace avec agent_nom='avocat-du-diable'."""
        agent_id = create_agent("Agent Devil Trace")
        s = create_session(client, agent_id=agent_id)

        with patch("httpx.AsyncClient", return_value=mock_forge_response(
            '{"critique": "ok", "biais": [], "questions": [], "steelman": "ok"}'
        )):
            client.post(
                f"/api/ipcra/{s['id']}/devil",
                json={"content": "Contenu à analyser", "phase": "reflechir"},
            )

        traces = client.get(f"/api/ipcra/{s['id']}/traces").json()
        assert any(t["agent_nom"] == "avocat-du-diable" for t in traces)

    def test_devil_json_malformé_retourne_critique_brute(self, client):
        """Si Forge ne retourne pas du JSON valide, on doit retourner la réponse brute dans 'critique'."""
        agent_id = create_agent("Agent Devil Brut")
        s = create_session(client, agent_id=agent_id)

        with patch("httpx.AsyncClient", return_value=mock_forge_response(
            "Ce n'est pas du JSON valide, juste du texte brut."
        )):
            r = client.post(
                f"/api/ipcra/{s['id']}/devil",
                json={"content": "Contenu", "phase": "identifier"},
            )

        assert r.status_code == 200
        data = r.json()
        assert "Ce n'est pas du JSON" in data["critique"]
        assert data["biais"] == []


# ── Flux complet end-to-end ───────────────────────────────────────

class TestFluxCompletE2E:
    def test_flux_ipcra_5_phases(self, client):
        """
        Simule le parcours complet d'un utilisateur sur une session IPCRA :
        création → 5 phases remplies → assist sur chaque phase →
        avancement (avec merge KG à l'entrée en ajuster) → session completée →
        vérification traces + contradictions.
        """
        PHASES = ["identifier", "planifier", "creer", "reflechir", "ajuster"]
        CONTENUS = {
            "identifier": "Contexte : migration cloud AWS. Deadline : Q2 2026.",
            "planifier":  "Étapes : 1) Audit infra 2) Plan migration 3) Tests 4) Prod.",
            "creer":      "Livrable : document de migration complet avec schémas.",
            "reflechir":  "Points forts : coordination équipe. Lacune : tests insuffisants.",
            "ajuster":    "Amélioration : ajouter une phase de tests dédiée dès le début.",
        }

        # 1. Créer la session
        s = create_session(client, "Migration Cloud AWS E2E")
        sid = s["id"]
        assert s["phase"] == "identifier"
        assert s["status"] == "active"

        # 2. Pour chaque phase : remplir le contenu + demander assist + avancer
        for i, phase in enumerate(PHASES):
            # Sauvegarder le contenu de la phase
            r = client.patch(
                f"/api/ipcra/{sid}/phase/{phase}",
                json={"content": CONTENUS[phase]},
            )
            assert r.status_code == 200, f"PATCH phase {phase} : {r.text}"

            # Assist IA (guide textuel car pas d'agent)
            r = client.post(
                f"/api/ipcra/{sid}/assist",
                json={"phase": phase, "prompt": f"Guide-moi pour la phase {phase}"},
            )
            assert r.status_code == 200, f"Assist {phase} : {r.text}"
            assert "answer" in r.json()

            # Avancer (sauf depuis la dernière phase)
            if i < len(PHASES) - 1:
                next_phase = PHASES[i + 1]
                if next_phase == "ajuster":
                    with patch(
                        "mempalace_client.merge_branch",
                        return_value={"merged": 4, "conflicts": []},
                    ) as mock_merge:
                        r = client.post(f"/api/ipcra/{sid}/advance")
                    assert r.json().get("merge", {}).get("merged") == 4
                    mock_merge.assert_called_once_with(sid)
                else:
                    r = client.post(f"/api/ipcra/{sid}/advance")

                assert r.status_code == 200, f"Advance depuis {phase} : {r.text}"
                assert r.json()["phase"] == next_phase

        # 3. Compléter la session (advance depuis ajuster)
        r = client.post(f"/api/ipcra/{sid}/advance")
        assert r.status_code == 200

        final = client.get(f"/api/ipcra/{sid}").json()
        assert final["status"] == "completee"
        assert final["identifier_notes"] == CONTENUS["identifier"]
        assert final["ajuster_notes"] == CONTENUS["ajuster"]

        # 4. Vérifier les 5 traces (une par assist)
        traces = client.get(f"/api/ipcra/{sid}/traces").json()
        assert len(traces) == 5
        phases_tracées = {t["phase"] for t in traces}
        assert phases_tracées == set(PHASES)
        assert all(t["agent_nom"] == "guide-textuel" for t in traces)

        # 5. Vérifier les contradictions (dégradation gracieuse → vide)
        r = client.get(f"/api/ipcra/{sid}/contradictions")
        assert r.status_code == 200
        assert r.json()["count"] == 0

    def test_session_isolation_entre_utilisateurs(self, client):
        """
        Les sessions d'un utilisateur ne doivent pas être visibles
        dans le GET /{session_id} d'un autre utilisateur (404).
        """
        from main import app
        from routers.auth import get_current_user as gcu

        # Créer une session avec l'utilisateur par défaut
        s = create_session(client, "Session privée user A")

        # Simuler un autre utilisateur
        app.dependency_overrides[gcu] = lambda: {
            "id": "user-autre-xyz",
            "email": "autre@test.com",
        }
        r = client.get(f"/api/ipcra/{s['id']}")
        app.dependency_overrides[gcu] = lambda: {
            "id": "user-test-abc-123",
            "email": "test@oria-test.com",
            "username": "testuser",
        }

        assert r.status_code == 404
