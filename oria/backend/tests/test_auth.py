"""Tests des endpoints d'authentification (register, login, profil)."""
import pytest
from sqlalchemy import text
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from conftest import TestSessionLocal


@pytest.fixture(autouse=True)
def clean_users():
    yield
    session = TestSessionLocal()
    try:
        session.execute(text("DELETE FROM users"))
        session.commit()
    except Exception:
        session.rollback()
    finally:
        session.close()


REGISTER_PAYLOAD = {
    "email": "alice@test.com",
    "nom": "Alice",
    "avatar_emoji": "🦄",
    "password": "secret123",
}


class TestRegister:
    def test_register_crée_un_utilisateur(self, client):
        r = client.post("/api/auth/register", json=REGISTER_PAYLOAD)
        assert r.status_code == 200
        data = r.json()
        assert "oria_token" in r.cookies
        assert data["user"]["nom"] == "Alice"
        assert data["user"]["avatar_emoji"] == "🦄"

    def test_register_email_dupliqué_retourne_400(self, client):
        client.post("/api/auth/register", json=REGISTER_PAYLOAD)
        r = client.post("/api/auth/register", json=REGISTER_PAYLOAD)
        assert r.status_code == 400

    def test_register_avatar_emoji_par_défaut(self, client):
        payload = {**REGISTER_PAYLOAD, "email": "bob@test.com"}
        del payload["avatar_emoji"]
        r = client.post("/api/auth/register", json=payload)
        assert r.status_code == 200


class TestLogin:
    def test_login_identifiants_valides(self, client):
        client.post("/api/auth/register", json=REGISTER_PAYLOAD)
        r = client.post("/api/auth/login", json={
            "email": "alice@test.com",
            "password": "secret123",
        })
        assert r.status_code == 200
        assert "oria_token" in r.cookies

    def test_login_mauvais_mot_de_passe_retourne_401(self, client):
        client.post("/api/auth/register", json=REGISTER_PAYLOAD)
        r = client.post("/api/auth/login", json={
            "email": "alice@test.com",
            "password": "mauvais",
        })
        assert r.status_code == 401

    def test_login_email_inconnu_retourne_401(self, client):
        r = client.post("/api/auth/login", json={
            "email": "inconnu@test.com",
            "password": "nimporte",
        })
        assert r.status_code == 401

    def test_login_sans_2fa_pose_cookie_et_retourne_user(self, client):
        client.post("/api/auth/register", json=REGISTER_PAYLOAD)
        r = client.post("/api/auth/login", json={
            "email": "alice@test.com",
            "password": "secret123",
        })
        data = r.json()
        assert "oria_token" in r.cookies
        assert "user" in data
        assert "requires_2fa" not in data


@pytest.fixture
def user_in_db():
    """Crée le TEST_USER dans la DB pour les tests qui nécessitent un vrai User."""
    from models.user import User
    from passlib.context import CryptContext
    pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
    session = TestSessionLocal()
    try:
        user = User(
            id="user-test-abc-123",
            email="test@oria-test.com",
            nom="Test User",
            avatar_emoji="👤",
            hashed_password=pwd_ctx.hash("secret"),
        )
        session.add(user)
        session.commit()
    finally:
        session.close()
    yield
    session = TestSessionLocal()
    try:
        session.execute(text("DELETE FROM users WHERE id = 'user-test-abc-123'"))
        session.commit()
    finally:
        session.close()


class TestProfil:
    def test_patch_me_met_à_jour_nom(self, client, user_in_db):
        r = client.patch("/api/auth/me", json={"nom": "Alice Modifié"})
        assert r.status_code == 200
        assert r.json()["user"]["nom"] == "Alice Modifié"

    def test_patch_me_met_à_jour_emoji(self, client, user_in_db):
        r = client.patch("/api/auth/me", json={"avatar_emoji": "🐉"})
        assert r.status_code == 200
        assert r.json()["user"]["avatar_emoji"] == "🐉"

    def test_statut_2fa_retourne_false_par_défaut(self, client, user_in_db):
        r = client.get("/api/auth/me/2fa-status")
        assert r.status_code == 200
        assert r.json()["totp_enabled"] is False
