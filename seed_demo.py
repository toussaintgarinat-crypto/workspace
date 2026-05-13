#!/usr/bin/env python3
"""
Script de seed — Compte démo avec fausses données sur toutes les applications.

Usage : python3 seed_demo.py

Credentials créés :
  MemPalace  → username: demo  / password: Demo2026!
  Forge      → username: demo  / password: Demo2026!  (Keycloak realm: forge)

Services ciblés :
  MemPalace  http://localhost:8100
  Forge      http://localhost:3001  (Keycloak: http://localhost:8080)
  Assistant  http://localhost:8200  (config connexions seulement)
"""

import sys
import json
import time
import requests

# ── Config ─────────────────────────────────────────────────────────────────

MEMPALACE_URL = "http://localhost:8100"
FORGE_URL     = "http://localhost:3001"
KEYCLOAK_URL  = "http://localhost:8080"
ASSISTANT_URL = "http://localhost:8200"

DEMO_USERNAME = "demo"
DEMO_PASSWORD = "Demo2026!"
DEMO_EMAIL    = "eliott@demo.local"
DEMO_NOM      = "Eliott Dupont"
DEMO_EMOJI    = "🧠"

SEPARATOR = "─" * 60


def ok(msg):  print(f"  ✓  {msg}")
def info(msg): print(f"  ·  {msg}")
def err(msg, e=None):
    print(f"  ✗  {msg}", f"→ {e}" if e else "")


# ── 1. MemPalace ────────────────────────────────────────────────────────────

IPCRA_MEMORIES = [
    # Input — ce qui entre (idées brutes, newsletters, articles)
    {
        "content": "Article Medium : 'Les 10 modèles LLM open-source à surveiller en 2026' — Llama 4, Mistral 3B, Qwen2.5 se démarquent pour le on-device. Points clés : context window 128k, fine-tuning LoRA accessible, coût inférence divisé par 5 vs GPT-4.",
        "wing": "Input",
        "room": "veille-technologique",
        "metadata": {"source": "Medium", "lu": "2026-05-10", "priorite": "haute"}
    },
    {
        "content": "Newsletter Stratéchic #47 : Les fondateurs qui réussissent en 2026 construisent des 'AI-native products' dès le départ, pas en retrofit. Pattern observé : data flywheel dès le MVP, pas après. Citation clé : 'Your moat is your data, not your prompt.'",
        "wing": "Input",
        "room": "newsletters",
        "metadata": {"source": "Stratéchic", "auteur": "Nicolas Menet"}
    },
    # Projet — projets en cours ou à venir
    {
        "content": "Projet : App mobile 'MindMap Vocal' — Capture d'idées par la voix, classement IPCRA automatique via LLM, sync MemPalace. Stack : React Native + Expo, backend FastAPI. MVP attendu Q3 2026. Objectif : 500 utilisateurs beta en 3 mois.",
        "wing": "Projet",
        "room": "mindmap-vocal",
        "metadata": {"statut": "en cours", "date_fin": "2026-09-01", "priorite": "haute"}
    },
    {
        "content": "Projet : Refonte du site vitrine — Passer de Framer à Astro + Tailwind pour des performances Core Web Vitals max. SEO programmatique : 50 pages ville générées. Budget : 2 semaines de dev, 0€ externe. Sprint prévu : semaine du 19 mai.",
        "wing": "Projet",
        "room": "site-vitrine",
        "metadata": {"statut": "planifié", "tech": "Astro + Tailwind"}
    },
    # Casquette — rôles, identités, qui je suis
    {
        "content": "Casquette : Développeur FullStack IA — 8 ans d'expérience. Spécialités : Python (FastAPI, LangChain), TypeScript (React, Next.js), déploiement Docker/K8s. Je construis des outils qui augmentent l'intelligence humaine, pas des remplacements.",
        "wing": "Casquette",
        "room": "identite-pro",
        "metadata": {"type": "role", "anciennete": "8 ans"}
    },
    {
        "content": "Casquette : Co-fondateur & Ingénieur en chef chez Nexum.ai (stealth) — B2B SaaS d'automatisation de processus métier par LLM. Responsabilités : architecture technique, recrutement CTO adjoint, démos investisseurs. Levée seed Q4 2026.",
        "wing": "Casquette",
        "room": "roles-entreprises",
        "metadata": {"entreprise": "Nexum.ai", "role": "Co-fondateur"}
    },
    # Ressource — outils, frameworks, templates réutilisables
    {
        "content": "Framework de décision SCORE : Scope (périmètre clair) → Contraintes (budget, temps, équipe) → Options (≥3 alternatives) → Risques (impact × probabilité) → Exécution (owner + deadline). Utiliser pour toute décision > 1 semaine de travail.",
        "wing": "Ressource",
        "room": "frameworks-decisions",
        "metadata": {"type": "framework", "usage": "décisions stratégiques"}
    },
    {
        "content": "Template Pitch Investisseur (5 slides max) : 1-Problème vécu (30s) 2-Solution + demo (60s) 3-Marché & traction (30s) 4-Équipe (20s) 5-Ask & roadmap (30s). Règle : si on ne peut pas pitcher en 3 minutes, le produit n'est pas clair.",
        "wing": "Ressource",
        "room": "templates-pitch",
        "metadata": {"type": "template", "usage": "fundraising"}
    },
    # Archive — notes terminées, projets clôturés
    {
        "content": "Projet clôturé (Mars 2026) : Plateforme de freelance pour juristes — Arrêt après 4 mois de beta, LTV trop faible (38€/mois) vs CAC (210€). Leçon : valider le willingness-to-pay AVANT de builder, pas après. 3 interviews auraient suffi.",
        "wing": "Archive",
        "room": "post-mortems",
        "metadata": {"date_cloture": "2026-03-15", "lecon": "valider WTP avant de builder"}
    },
    {
        "content": "Notes réunion équipe 2026-04-28 : Décision de migrer l'infra vers HP G4 SFF auto-hébergé (Proxmox + LXC). Économie estimée : 340€/mois vs Vercel + AWS. Risque : maintenance hardware. Décision : OK si backup NAS + snapshot hebdo.",
        "wing": "Archive",
        "room": "reunions",
        "metadata": {"date": "2026-04-28", "type": "décision-infra"}
    },
]

def seed_mempalace():
    print(f"\n{SEPARATOR}")
    print("  MEMPALACE  http://localhost:8100")
    print(SEPARATOR)

    # Enregistrement
    try:
        # Tenter le login d'abord (l'utilisateur peut déjà exister)
        r_login = requests.post(f"{MEMPALACE_URL}/auth/login",
            data={"username": DEMO_USERNAME, "password": DEMO_PASSWORD},
            timeout=10)
        if r_login.status_code == 200:
            token = r_login.json()["access_token"]
            info(f"Utilisateur '{DEMO_USERNAME}' existant → token récupéré")
        else:
            # Essayer de s'enregistrer
            r = requests.post(f"{MEMPALACE_URL}/auth/register", json={
                "username": DEMO_USERNAME,
                "password": DEMO_PASSWORD,
            }, timeout=10)
            if r.status_code == 201:
                token = r.json()["access_token"]
                ok(f"Utilisateur '{DEMO_USERNAME}' créé")
            elif r.status_code == 403:
                err(f"Register bloqué (admin token requis) — créer l'utilisateur manuellement :")
                err(f"  docker exec mempalace-api-1 python3 -c \"import bcrypt,sqlite3,uuid; ...")
                return None
            else:
                err(f"Register échoué ({r.status_code})", r.text[:200])
                return None
    except Exception as e:
        err("MemPalace inaccessible", e)
        return None

    headers = {"Authorization": f"Bearer {token}"}

    # Ajout des mémoires IPCRA
    added = 0
    for mem in IPCRA_MEMORIES:
        try:
            r = requests.post(f"{MEMPALACE_URL}/api/drawers", json=mem, headers=headers, timeout=10)
            if r.status_code in (200, 201):
                added += 1
            else:
                err(f"Drawer [{mem['wing']}/{mem['room']}] échoué", r.text[:100])
        except Exception as e:
            err(f"Drawer [{mem['wing']}/{mem['room']}]", e)

    ok(f"{added}/{len(IPCRA_MEMORIES)} mémoires IPCRA ajoutées")

    # Statut palace
    try:
        r = requests.get(f"{MEMPALACE_URL}/api/status", headers=headers, timeout=10)
        if r.status_code == 200:
            status = r.json()
            ok(f"Palace : {status['total']} vecteurs — wings: {status['wings']}")
    except Exception:
        pass

    return token


# ── 2. Forge (Keycloak + API) ────────────────────────────────────────────────

FORGE_SPRINTS = [
    {
        "pole_type": "ops",
        "sprint": {
            "nom": "Sprint 1 — Infrastructure & déploiement",
            "objectif": "Migrer toutes les apps sur HP G4 SFF avec Proxmox LXC",
            "dateFin": "2026-05-26",
        },
        "tasks": [
            {"titre": "Installer Proxmox VE 8.2 sur clé USB bootable", "statut": "done", "priorite": "haute"},
            {"titre": "Créer LXC container principal (CT-100) avec Docker", "statut": "done", "priorite": "haute"},
            {"titre": "Configurer NetBird mesh VPN pour accès téléphone", "statut": "en_cours", "priorite": "haute"},
            {"titre": "Migrer Forge + MemPalace + Assistant dans LXC", "statut": "todo", "priorite": "normale"},
            {"titre": "Mettre en place backup NAS automatique quotidien", "statut": "todo", "priorite": "normale"},
        ]
    },
    {
        "pole_type": "marketing",
        "sprint": {
            "nom": "Sprint 1 — Lancement site & contenu",
            "objectif": "Publier 10 articles SEO et lancer la newsletter",
            "dateFin": "2026-06-02",
        },
        "tasks": [
            {"titre": "Rédiger l'article 'Qu'est-ce que le PKM ?' (SEO pillar)", "statut": "en_cours", "priorite": "haute"},
            {"titre": "Créer la landing page newsletter avec Astro", "statut": "todo", "priorite": "haute"},
            {"titre": "Programmer 4 posts LinkedIn sur le lancement", "statut": "todo", "priorite": "normale"},
        ]
    },
    {
        "pole_type": "finance",
        "sprint": {
            "nom": "Sprint 1 — Budget & trésorerie Q2",
            "objectif": "Établir le prévisionnel Q2 et sécuriser 2 contrats clients",
            "dateFin": "2026-06-30",
        },
        "tasks": [
            {"titre": "Préparer le prévisionnel de trésorerie Q2 2026", "statut": "done", "priorite": "haute"},
            {"titre": "Envoyer facture Julie Fontaine — Pack annuel 700€/mois", "statut": "done", "priorite": "haute"},
            {"titre": "Déposer dossier BPI Émergence pour subvention", "statut": "en_cours", "priorite": "haute"},
            {"titre": "Ouvrir compte pro Qonto pour Nexum.ai", "statut": "en_cours", "priorite": "normale"},
            {"titre": "Choisir expert-comptable (3 devis en cours)", "statut": "todo", "priorite": "normale"},
        ]
    },
    {
        "pole_type": "tech",
        "sprint": {
            "nom": "Sprint 2 — Moteur IA & API publique",
            "objectif": "Finaliser le pipeline ReAct et ouvrir l'API en beta privée",
            "dateFin": "2026-06-09",
        },
        "tasks": [
            {"titre": "Implémenter le cache sémantique sur le gateway LiteLLM", "statut": "done", "priorite": "haute"},
            {"titre": "Rédiger la documentation OpenAPI pour les partenaires", "statut": "en_cours", "priorite": "haute"},
            {"titre": "Mettre en place les tests d'intégration E2E", "statut": "en_cours", "priorite": "normale"},
            {"titre": "Optimiser les embeddings Qdrant (HNSW params)", "statut": "todo", "priorite": "normale"},
            {"titre": "Déployer le rate-limiting par clé API", "statut": "todo", "priorite": "haute"},
        ]
    },
    {
        "pole_type": "legal",
        "sprint": {
            "nom": "Sprint 1 — Conformité & contrats",
            "objectif": "Finaliser CGU, politique RGPD et template contrat SaaS",
            "dateFin": "2026-05-30",
        },
        "tasks": [
            {"titre": "Rédiger les CGU v1.0 avec mentions IA obligatoires", "statut": "done", "priorite": "haute"},
            {"titre": "Politique de confidentialité RGPD + DPA clients", "statut": "done", "priorite": "haute"},
            {"titre": "Template contrat SaaS (SLA, résiliation, limitation responsabilité)", "statut": "en_cours", "priorite": "haute"},
            {"titre": "Déposer marque Nexum.ai à l'INPI", "statut": "todo", "priorite": "normale"},
        ]
    },
]

FORGE_BUDGET = [
    # Recettes
    {"label": "Contrat SaaS — Cabinet ALF Avocats (mois 1)", "montant": 700, "type": "recette", "categorie": "SaaS", "date": "2026-05-02"},
    {"label": "Subvention BPI Émergence (acompte 50%)", "montant": 5000, "type": "recette", "categorie": "Subvention", "date": "2026-04-15"},
    # Dépenses
    {"label": "Hébergement serveur HP G4 SFF — électricité + réseau", "montant": 45, "type": "depense", "categorie": "Infra", "date": "2026-05-01"},
    {"label": "Cursor AI — licence annuelle (pro)", "montant": 192, "type": "depense", "categorie": "Outils", "date": "2026-04-01"},
    {"label": "OpenRouter — crédits API LLM (avril)", "montant": 87, "type": "depense", "categorie": "IA", "date": "2026-04-30"},
    {"label": "Qonto — frais bancaires mensuel", "montant": 9, "type": "depense", "categorie": "Banque", "date": "2026-05-01"},
    {"label": "Figma — licence annuelle", "montant": 144, "type": "depense", "categorie": "Outils", "date": "2026-03-15"},
]

FORGE_CALENDAR = [
    {
        "titre": "Demo investisseur — Partech Shaker",
        "description": "Pitch 20 min + Q&A. Préparer deck 5 slides + demo live Forge.",
        "dateDebut": "2026-05-20T14:00:00",
        "dateFin":   "2026-05-20T15:30:00",
        "pole": "sales",
    },
    {
        "titre": "Réunion équipe hebdo",
        "description": "Revue des sprints en cours, blockers, priorities de la semaine.",
        "dateDebut": "2026-05-19T09:00:00",
        "dateFin":   "2026-05-19T09:45:00",
        "pole": "ops",
    },
    {
        "titre": "Onboarding client — Cabinet ALF Avocats",
        "description": "Session de prise en main 1h avec Julie Fontaine. Configurer l'espace Forge + MemPalace.",
        "dateDebut": "2026-05-21T10:00:00",
        "dateFin":   "2026-05-21T11:00:00",
        "pole": "sales",
    },
    {
        "titre": "Deadline dépôt INPI — marque Nexum.ai",
        "description": "Dossier à envoyer avant le 30 mai pour protéger la marque.",
        "dateDebut": "2026-05-30T17:00:00",
        "dateFin":   "2026-05-30T17:00:00",
        "pole": "legal",
    },
    {
        "titre": "Call Marc Dubreuil — InnovGroup (relance)",
        "description": "Relance 2 semaines après Web Summit. Préparer cas d'usage service client.",
        "dateDebut": "2026-05-27T11:00:00",
        "dateFin":   "2026-05-27T11:30:00",
        "pole": "sales",
    },
]

FORGE_INCIDENTS = [
    {
        "titre": "Gateway LiteLLM — timeout 504 pendant 2h",
        "description": "Incident du 2026-05-10 14h-16h. Le proxy LiteLLM ne répondait plus suite à un OOM sur le container. Fix : augmenté la mémoire limite de 512Mi à 1Gi + restart policy always.",
        "severite": "haute",
        "statut_post_creation": "resolu",
    },
    {
        "titre": "Latence élevée API Forge (> 2s p95)",
        "description": "Dégradation observée depuis le 2026-05-12. Les requêtes sur /api/poles/:id/tasks dépassent 2s. Hypothèse : requête N+1 sur les relations sprints. Investigation en cours.",
        "severite": "moyenne",
        "statut_post_creation": None,
    },
]

FORGE_CONTRATS = [
    {
        "titre": "Contrat SaaS — Cabinet ALF Avocats",
        "type": "SaaS",
        "parties": "Nexum.ai (prestataire) / Cabinet ALF Avocats (client)",
        "contenu": "Pack annuel Nexum.ai — accès Forge + MemPalace + Assistant IA. 700€/mois HT. SLA 99.5% uptime. Résiliation avec préavis 30 jours.",
        "valeur": 8400,
        "dateDebut": "2026-05-02",
        "dateFin": "2027-05-02",
        "notes": "Client satisfait. Première facture envoyée et réglée.",
        "signer": True,
        "signe_par": "Julie Fontaine",
    },
    {
        "titre": "NDA — InnovGroup",
        "type": "NDA",
        "parties": "Nexum.ai / InnovGroup",
        "contenu": "Accord de non-divulgation mutuel. Durée 2 ans. Couvre les discussions commerciales et la démo du produit.",
        "valeur": 0,
        "dateDebut": "2026-05-08",
        "dateFin": "2028-05-08",
        "notes": "À signer avant la démo du 27 mai. Renvoyer signé par Marc Dubreuil.",
        "signer": False,
        "signe_par": None,
    },
    {
        "titre": "CGU Nexum.ai v1.0",
        "type": "CGU",
        "parties": "Nexum.ai / Utilisateurs finaux",
        "contenu": "Conditions Générales d'Utilisation — plateforme Nexum.ai. Inclut mention traitement données IA, limitation de responsabilité, droit de résiliation. Conforme RGPD.",
        "valeur": 0,
        "dateDebut": "2026-05-01",
        "dateFin": "",
        "notes": "Validé par avocat externe. Publié sur le site le 01/05/2026.",
        "signer": False,
        "signe_par": None,
    },
]

FORGE_CRM_LEADS = [
    {
        "nom": "Sarah Lecomte",
        "email": "sarah@techvision.fr",
        "telephone": "+33 6 12 34 56 78",
        "entreprise": "TechVision SAS",
        "statut": "qualifie",
        "valeur": 12000,
        "notes": "DSI d'une PME 80 personnes. Intéressée par automatisation RH. Demo prévue le 20 mai. Budget confirmé 10-15k€/an.",
    },
    {
        "nom": "Marc Dubreuil",
        "email": "marc.d@innovgroup.io",
        "telephone": "+33 7 98 76 54 32",
        "entreprise": "InnovGroup",
        "statut": "prospect",
        "valeur": 5000,
        "notes": "Rencontré au Web Summit Paris. Cherche solution IA pour service client. À recontacter dans 2 semaines.",
    },
    {
        "nom": "Julie Fontaine",
        "email": "j.fontaine@cabinetalf.com",
        "telephone": "+33 6 55 44 33 22",
        "entreprise": "Cabinet ALF Avocats",
        "statut": "gagne",
        "valeur": 8400,
        "notes": "Contrat signé le 2 mai 2026. Pack annuel 700€/mois. Onboarding prévu semaine du 19 mai.",
    },
    {
        "nom": "Thomas Renard",
        "email": "t.renard@startup-lab.co",
        "telephone": "+33 6 11 22 33 44",
        "entreprise": "StartupLab",
        "statut": "perdu",
        "valeur": 3600,
        "notes": "A choisi un concurrent (Notion AI). Raison : intégration Notion native. À reroucher en Q4 si l'intégration MemPalace est prête.",
    },
]


def get_keycloak_admin_token():
    try:
        r = requests.post(
            f"{KEYCLOAK_URL}/realms/master/protocol/openid-connect/token",
            data={"client_id": "admin-cli", "username": "admin", "password": "admin", "grant_type": "password"},
            timeout=10
        )
        if r.status_code == 200:
            return r.json()["access_token"]
        err(f"Token admin Keycloak échoué ({r.status_code})", r.text[:100])
    except Exception as e:
        err("Keycloak inaccessible", e)
    return None


def create_keycloak_user(admin_token):
    headers = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
    payload = {
        "username": DEMO_USERNAME,
        "email": DEMO_EMAIL,
        "firstName": "Eliott",
        "lastName": "Dupont",
        "enabled": True,
        "emailVerified": True,
        "credentials": [{"type": "password", "value": DEMO_PASSWORD, "temporary": False}],
        "attributes": {
            "nom":         [DEMO_NOM],
            "avatarEmoji": [DEMO_EMOJI],
        },
    }
    r = requests.post(
        f"{KEYCLOAK_URL}/admin/realms/forge/users",
        json=payload,
        headers=headers,
        timeout=10,
    )
    if r.status_code == 201:
        ok(f"Utilisateur Keycloak '{DEMO_USERNAME}' créé dans realm 'forge'")
        return True
    elif r.status_code == 409:
        info(f"Utilisateur Keycloak '{DEMO_USERNAME}' existant")
        return True
    else:
        err(f"Création Keycloak échouée ({r.status_code})", r.text[:200])
        return False


def get_forge_user_token():
    r = requests.post(
        f"{KEYCLOAK_URL}/realms/forge/protocol/openid-connect/token",
        data={
            "client_id": "forge-app",
            "username": DEMO_USERNAME,
            "password": DEMO_PASSWORD,
            "grant_type": "password",
        },
        timeout=10,
    )
    if r.status_code == 200:
        ok(f"Token Forge obtenu pour '{DEMO_USERNAME}'")
        return r.json()["access_token"]
    err(f"Login Forge échoué ({r.status_code})", r.text[:200])
    return None


def seed_forge():
    print(f"\n{SEPARATOR}")
    print("  FORGE      http://localhost:3000")
    print(SEPARATOR)

    # 1. Admin token
    admin_token = get_keycloak_admin_token()
    if not admin_token:
        return

    # 2. Créer l'utilisateur Keycloak
    if not create_keycloak_user(admin_token):
        return

    # 3. Token utilisateur
    user_token = get_forge_user_token()
    if not user_token:
        return

    headers = {"Authorization": f"Bearer {user_token}", "Content-Type": "application/json"}

    # 4. Créer la venture (déclenche la création des 5 pôles par défaut)
    r = requests.get(f"{FORGE_URL}/api/ventures", headers=headers, timeout=10)
    existing_ventures = []
    if r.status_code == 200:
        existing_ventures = r.json()

    venture_id = None
    if existing_ventures:
        venture_id = existing_ventures[0]["id"]
        info(f"Venture existante trouvée : {existing_ventures[0]['nom']}")
    else:
        r = requests.post(f"{FORGE_URL}/api/ventures", json={
            "nom": "Nexum.ai",
            "description": "Automatisation de processus métier par LLM — stealth mode",
            "emoji": "⚡",
            "couleur": "#6366f1",
            "type": "own",
        }, headers=headers, timeout=10)
        if r.status_code == 201:
            venture_id = r.json()["id"]
            ok(f"Venture 'Nexum.ai' créée (id: {venture_id[:8]}...)")
        else:
            err(f"Venture création échouée ({r.status_code})", r.text[:200])
            return

    # 5. Récupérer les pôles
    r = requests.get(f"{FORGE_URL}/api/poles", headers=headers, timeout=10)
    if r.status_code != 200:
        err(f"Liste pôles échouée ({r.status_code})", r.text[:100])
        return

    poles = r.json()
    pole_by_type = {p["type"]: p for p in poles}
    ok(f"{len(poles)} pôles disponibles : {[p['nom'] for p in poles]}")

    # 6. Créer sprints + tâches
    total_sprints, total_tasks = 0, 0
    for sprint_data in FORGE_SPRINTS:
        pole = pole_by_type.get(sprint_data["pole_type"])
        if not pole:
            err(f"Pôle '{sprint_data['pole_type']}' introuvable")
            continue

        r = requests.post(
            f"{FORGE_URL}/api/poles/{pole['id']}/sprints",
            json=sprint_data["sprint"],
            headers=headers,
            timeout=10,
        )
        if r.status_code != 201:
            err(f"Sprint [{pole['nom']}] échoué ({r.status_code})", r.text[:100])
            continue

        sprint_id = r.json()["id"]
        total_sprints += 1
        ok(f"Sprint '{sprint_data['sprint']['nom'][:40]}...' créé dans [{pole['nom']}]")

        for task in sprint_data["tasks"]:
            r2 = requests.post(
                f"{FORGE_URL}/api/poles/{pole['id']}/tasks",
                json={**task, "sprintId": sprint_id},
                headers=headers,
                timeout=10,
            )
            if r2.status_code == 201:
                total_tasks += 1
            else:
                err(f"Tâche '{task['titre'][:30]}' échouée", r2.text[:80])

    ok(f"{total_sprints} sprints + {total_tasks} tâches créés")

    # 7. CRM leads (pôle Sales)
    sales_pole = pole_by_type.get("sales")
    if sales_pole:
        total_leads = 0
        for lead in FORGE_CRM_LEADS:
            r = requests.post(
                f"{FORGE_URL}/api/poles/{sales_pole['id']}/crm",
                json=lead,
                headers=headers,
                timeout=10,
            )
            if r.status_code == 201:
                total_leads += 1
            else:
                err(f"Lead '{lead['nom']}' échoué", r.text[:80])
        ok(f"{total_leads} leads CRM créés dans [{sales_pole['nom']}]")

    # 8. Budget (pôle Finance)
    finance_pole = pole_by_type.get("finance")
    if finance_pole:
        total_budget = 0
        for entry in FORGE_BUDGET:
            r = requests.post(
                f"{FORGE_URL}/api/poles/{finance_pole['id']}/budget",
                json=entry,
                headers=headers,
                timeout=10,
            )
            if r.status_code == 201:
                total_budget += 1
            else:
                err(f"Budget '{entry['label'][:30]}' échoué", r.text[:80])
        ok(f"{total_budget} entrées budget créées dans [{finance_pole['nom']}]")

    # 9. Calendrier
    total_events = 0
    for event in FORGE_CALENDAR:
        r = requests.post(
            f"{FORGE_URL}/api/calendar/events",
            json=event,
            headers=headers,
            timeout=10,
        )
        if r.status_code == 201:
            total_events += 1
        else:
            err(f"Événement '{event['titre'][:30]}' échoué", r.text[:80])
    ok(f"{total_events} événements calendrier créés")

    # 10. Incidents (pôle Ops)
    ops_pole = pole_by_type.get("ops")
    if ops_pole:
        total_incidents = 0
        for inc in FORGE_INCIDENTS:
            r = requests.post(
                f"{FORGE_URL}/api/poles/{ops_pole['id']}/incidents",
                json={"titre": inc["titre"], "description": inc["description"], "severite": inc["severite"]},
                headers=headers,
                timeout=10,
            )
            if r.status_code == 201:
                inc_id = r.json()["id"]
                total_incidents += 1
                if inc["statut_post_creation"]:
                    requests.patch(
                        f"{FORGE_URL}/api/incidents/{inc_id}",
                        json={"statut": inc["statut_post_creation"]},
                        headers=headers,
                        timeout=10,
                    )
            else:
                err(f"Incident '{inc['titre'][:30]}' échoué", r.text[:80])
        ok(f"{total_incidents} incidents créés dans [{ops_pole['nom']}]")

    # 11. Contrats (pôle Legal)
    legal_pole = pole_by_type.get("legal")
    if legal_pole:
        total_contrats = 0
        for contrat in FORGE_CONTRATS:
            payload = {k: v for k, v in contrat.items() if k not in ("signer", "signe_par")}
            r = requests.post(
                f"{FORGE_URL}/api/poles/{legal_pole['id']}/contrats",
                json=payload,
                headers=headers,
                timeout=10,
            )
            if r.status_code == 201:
                contrat_id = r.json()["id"]
                total_contrats += 1
                if contrat["signer"]:
                    requests.post(
                        f"{FORGE_URL}/api/contrats/{contrat_id}/signer",
                        json={"signePar": contrat["signe_par"]},
                        headers=headers,
                        timeout=10,
                    )
            else:
                err(f"Contrat '{contrat['titre'][:30]}' échoué", r.text[:80])
        ok(f"{total_contrats} contrats créés dans [{legal_pole['nom']}]")

    return user_token


# ── 3. Oria ─────────────────────────────────────────────────────────────────

ORIA_URL = "http://localhost:8000"

ORIA_WORLDS = [
    {
        "nom": "Innovation Lab",
        "description": "Espace de collaboration et d'expérimentation IA",
        "emoji": "⚡",
        "couleur": "#6366f1",
        "buildings": [
            {
                "nom": "QG Nexum.ai",
                "type": "immeuble",
                "description": "Bureaux virtuels de l'équipe",
                "rooms": [
                    {"nom": "Lobby", "type": "accueil", "emoji": "🏢", "etage": 0},
                    {"nom": "Salle de réunion", "type": "reunion", "emoji": "📋", "etage": 1},
                    {"nom": "Bureau dev", "type": "travail", "emoji": "💻", "etage": 1},
                    {"nom": "Salon café", "type": "detente", "emoji": "☕", "etage": 0},
                ],
            },
            {
                "nom": "Atelier Design",
                "type": "maison",
                "description": "Espace créatif et maquettes",
                "rooms": [
                    {"nom": "Studio créatif", "type": "travail", "emoji": "🎨", "etage": 0},
                    {"nom": "Archive projets", "type": "archive", "emoji": "📁", "etage": 1},
                ],
            },
        ],
    },
    {
        "nom": "Mon Jardin Secret",
        "description": "Espace privé de réflexion et de veille",
        "emoji": "🌿",
        "couleur": "#2d5a27",
        "buildings": [
            {
                "nom": "Bibliothèque",
                "type": "site",
                "description": "Ressources et références personnelles",
                "rooms": [
                    {"nom": "Veille technologique", "type": "lecture", "emoji": "🔭", "etage": 0},
                    {"nom": "Notes de lecture", "type": "travail", "emoji": "📝", "etage": 0},
                    {"nom": "Idées & drafts", "type": "mixte", "emoji": "💡", "etage": 1},
                ],
            },
        ],
    },
]


def seed_oria():
    print(f"\n{SEPARATOR}")
    print("  ORIA       http://localhost:3002")
    print(SEPARATOR)

    # 1. Token Oria
    try:
        r = requests.post(
            "http://localhost:8080/realms/oria/protocol/openid-connect/token",
            data={"client_id": "oria-app", "username": DEMO_USERNAME, "password": DEMO_PASSWORD, "grant_type": "password"},
            timeout=10,
        )
        if r.status_code != 200:
            err(f"Login Oria Keycloak échoué ({r.status_code})", r.text[:100])
            return None
        oria_token = r.json()["access_token"]
    except Exception as e:
        err("Keycloak Oria inaccessible", e)
        return None

    headers = {"Authorization": f"Bearer {oria_token}", "Content-Type": "application/json"}

    # 2. Déclencher le provisioning utilisateur (jardin secret auto-créé)
    r = requests.get(f"{ORIA_URL}/api/worlds", headers=headers, timeout=10)
    if r.status_code != 200:
        err(f"API Oria inaccessible ({r.status_code})", r.text[:100])
        return None

    existing = r.json()
    existing_noms = {w["nom"] for w in existing}
    ok(f"Utilisateur Oria provisionné ({len(existing)} worlds existants)")

    total_worlds, total_buildings = 0, 0
    for world_data in ORIA_WORLDS:
        if world_data["nom"] in existing_noms:
            info(f"World '{world_data['nom']}' existant → skip")
            continue

        r = requests.post(f"{ORIA_URL}/api/worlds", json={
            "nom": world_data["nom"],
            "description": world_data["description"],
            "emoji": world_data["emoji"],
            "couleur": world_data["couleur"],
        }, headers=headers, timeout=10)

        if r.status_code not in (200, 201):
            err(f"World '{world_data['nom']}' échoué ({r.status_code})", r.text[:100])
            continue

        world_id = r.json()["id"]
        total_worlds += 1
        ok(f"World '{world_data['nom']}' créé")

        for building_data in world_data["buildings"]:
            r2 = requests.post(f"{ORIA_URL}/api/buildings", json={
                "world_id": world_id,
                "nom": building_data["nom"],
                "type": building_data["type"],
                "description": building_data["description"],
            }, headers=headers, timeout=10)
            if r2.status_code in (200, 201):
                total_buildings += 1
                building_id = r2.json().get("id")
                rooms_auto = len(r2.json().get("rooms", []))
                ok(f"  Building '{building_data['nom']}' créé ({rooms_auto} rooms auto)")

                # Créer les rooms définies dans la config
                rooms_added = 0
                for room_data in building_data.get("rooms", []):
                    r3 = requests.post(
                        f"{ORIA_URL}/api/rooms/{building_id}/rooms",
                        json={
                            "nom": room_data["nom"],
                            "type": room_data.get("type", "mixte"),
                            "emoji": room_data.get("emoji", "💬"),
                            "etage": room_data.get("etage", 0),
                        },
                        headers=headers,
                        timeout=10,
                    )
                    if r3.status_code in (200, 201):
                        rooms_added += 1
                    else:
                        err(f"    Room '{room_data['nom']}' échouée", r3.text[:60])
                if rooms_added:
                    ok(f"    {rooms_added} rooms créées dans '{building_data['nom']}'")
            else:
                err(f"  Building '{building_data['nom']}' échoué", r2.text[:80])

    total_rooms_created = sum(
        len(b.get("rooms", []))
        for w in ORIA_WORLDS for b in w["buildings"]
    )
    ok(f"{total_worlds} worlds + {total_buildings} buildings + ~{total_rooms_created} rooms créées")
    return oria_token


# ── 4. Assistant — config connexions ────────────────────────────────────────

def seed_assistant(mempalace_token, forge_token=None, oria_token=None):
    print(f"\n{SEPARATOR}")
    print("  ASSISTANT  http://localhost:8300")
    print(SEPARATOR)

    try:
        r = requests.get(f"{ASSISTANT_URL}/health", timeout=5)
        if r.status_code != 200:
            err(f"Backend Assistant status {r.status_code}")
            return
        ok("Backend Assistant en ligne")
    except Exception as e:
        err("Assistant inaccessible", e)
        return

    # Configurer les connexions via l'API persistante
    connections = []
    if mempalace_token:
        connections.append({
            "id": "mempalace-demo",
            "name": "MemPalace (demo)",
            "url": "http://localhost:8100",
            "token": mempalace_token,
            "app_type": "mempalace",
            "enabled": True,
        })
    if forge_token:
        connections.append({
            "id": "forge-demo",
            "name": "Forge (demo)",
            "url": "http://localhost:3001",
            "token": forge_token,
            "app_type": "forge",
            "enabled": True,
        })
    if oria_token:
        connections.append({
            "id": "oria-demo",
            "name": "Oria (demo)",
            "url": "http://localhost:8000",
            "token": oria_token,
            "app_type": "oria",
            "enabled": True,
        })

    for conn in connections:
        try:
            r = requests.post(f"{ASSISTANT_URL}/connections", json=conn, timeout=10)
            if r.status_code in (200, 201):
                ok(f"Connexion '{conn['name']}' configurée ({conn['app_type']})")
            else:
                err(f"Connexion '{conn['name']}' échouée ({r.status_code})", r.text[:80])
        except Exception as e:
            err(f"Connexion '{conn['name']}'", e)


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print()
    print("╔══════════════════════════════════════════════════════════╗")
    print("║         SEED DÉMO — Agent Personnel de Création         ║")
    print("╚══════════════════════════════════════════════════════════╝")
    print()
    print("  Compte démo : demo / Demo2026!")

    mempalace_token = seed_mempalace()
    forge_token = seed_forge()
    oria_token = seed_oria()
    seed_assistant(mempalace_token, forge_token, oria_token)

    print(f"\n{SEPARATOR}")
    print("  RÉSUMÉ — CREDENTIALS")
    print(SEPARATOR)
    print()
    print("  MemPalace  http://localhost:8100/docs")
    print(f"             username : {DEMO_USERNAME}  /  password : {DEMO_PASSWORD}")
    print()
    print("  Forge      http://localhost:3000")
    print(f"             username : {DEMO_USERNAME}  /  password : {DEMO_PASSWORD}")
    print()
    print("  Oria       http://localhost:3002")
    print(f"             username : {DEMO_USERNAME}  /  password : {DEMO_PASSWORD}")
    print()
    print("  Assistant  http://localhost:8300")
    print("             (connexions configurées automatiquement)")
    print()
    print("  Keycloak Admin → http://localhost:8080/admin  (admin / admin)")
    print()
    print("  Données créées :")
    print("    MemPalace : 10 mémoires IPCRA (Input×2, Projet×2, Casquette×2, Ressource×2, Archive×2)")
    print("    Forge     : venture 'Nexum.ai', 5 pôles, 5 sprints, 22 tâches, 4 leads CRM")
    print("                7 entrées budget, 5 événements calendrier, 2 incidents, 3 contrats")
    print("    Oria      : 2 worlds (Innovation Lab, Jardin Secret), 3 buildings, 9 rooms")
    print("    Assistant : connexions MemPalace + Forge + Oria configurées")
    print()


if __name__ == "__main__":
    main()
