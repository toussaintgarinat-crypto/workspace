# Assistant — Agent IA personnel

Backend FastAPI + frontend React. Agent ReAct conversationnel avec accès aux services connectés (Forge, MemPalace, Oria). Inclut alertes proactives, swarm d'agents, voice I/O et PWA mobile.

- **Backend** : `http://localhost:8200`
- **Frontend** : `http://localhost:8300`


## Démarrage

```bash
# Depuis la racine du workspace
make start-assistant

# Prérequis : le gateway doit tourner
make start-gateway
```


## Variables d'environnement

### Obligatoires

| Variable | Description | Comment l'obtenir |
|---|---|---|
| `GATEWAY_URL` | URL du gateway LiteLLM | `http://localhost:4000` en local. En Docker multi-host : IP du serveur gateway. |
| `GATEWAY_API_KEY` | Clé virtuelle de l'assistant dans le gateway | Valeur fixe : `sk-assistant` (définie dans `gateway/litellm_config.yaml`) |
| `GATEWAY_MASTER_KEY` | Clé maître du gateway (pour créer des clés virtuelles) | Identique à `LITELLM_MASTER_KEY` dans le gateway |
| `VAULT_SECRET` | Clé de chiffrement AES-256 pour les tokens OAuth stockés | Générer : `openssl rand -base64 32` |


### Optionnelles — Modèle LLM

| Variable | Description | Défaut |
|---|---|---|
| `GATEWAY_MODEL` | Modèle utilisé par l'assistant | `openai/gpt-4o` |

Exemples de valeurs : `openai/gpt-4o`, `anthropic/claude-sonnet-4-6`, `google/gemini-2.5-flash-preview`, `ollama/llama3.2`


### Optionnelles — Base de données

| Variable | Description | Défaut |
|---|---|---|
| `DATABASE_URL` | URL PostgreSQL. **Si vide, SQLite local est utilisé.** | *(vide = SQLite)* |

Pour PostgreSQL :
```bash
DATABASE_URL=postgresql://user:password@host:5432/assistant
```

> SQLite est parfait pour un usage solo. Passez à PostgreSQL pour un déploiement cloud multi-instance ou si vous avez besoin de sauvegardes automatiques via votre provider.


### Optionnelles — Authentification Keycloak

Désactivée par défaut (`AUTH_ENABLED=false`). À activer si vous voulez protéger l'assistant avec Keycloak (partagé avec Forge).

| Variable | Description | Défaut |
|---|---|---|
| `AUTH_ENABLED` | Activer l'authentification | `false` |
| `KEYCLOAK_URL` | URL de Keycloak | `http://localhost:8080` |
| `KEYCLOAK_REALM` | Realm Keycloak | `master` |
| `KEYCLOAK_CLIENT_ID` | Client ID dans Keycloak | `assistant-app` |

> Pour créer le client Keycloak automatiquement : `bash assistant/setup_keycloak_client.sh`


### Optionnelles — Notifications

| Variable | Description | Comment l'obtenir |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Token du bot Telegram pour les alertes | [@BotFather](https://t.me/BotFather) sur Telegram → `/newbot` |
| `TELEGRAM_CHAT_ID` | ID du chat/canal où envoyer les alertes | Envoyer un message au bot, puis `https://api.telegram.org/bot<TOKEN>/getUpdates` |
| `DISCORD_WEBHOOK_URL` | URL du webhook Discord | Discord → Paramètres du canal → Intégrations → Webhooks → Nouveau webhook |


## Configurer Telegram

1. Ouvrir Telegram → chercher **@BotFather**
2. Envoyer `/newbot`, suivre les instructions
3. Copier le token (format `123456:ABC-DEF...`)
4. Envoyer un message à votre bot depuis votre compte
5. Récupérer votre `chat_id` :
   ```bash
   curl https://api.telegram.org/bot<TOKEN>/getUpdates
   # Chercher "id" dans "from" dans le résultat JSON
   ```

## Configurer Discord

1. Aller dans le canal Discord qui recevra les alertes
2. **Paramètres du canal** (⚙️) → **Intégrations** → **Webhooks**
3. **Nouveau webhook** → copier l'URL
4. Coller dans `.env` : `DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...`


## CI/CD — GitHub Actions

Le pipeline build les images Docker et les pousse sur GHCR à chaque push sur `main` touchant `assistant/**`.

### Images publiées

| Image | Tag |
|---|---|
| `ghcr.io/toussaintgarinat-crypto/workspace/assistant-backend` | `latest` + SHA du commit |
| `ghcr.io/toussaintgarinat-crypto/workspace/assistant-frontend` | `latest` + SHA du commit |

### Secrets GitHub à configurer

Dans **Settings → Secrets and variables → Actions** de votre repo :

| Secret / Variable | Type | Description |
|---|---|---|
| `GITHUB_TOKEN` | auto | Fourni automatiquement par GitHub Actions — auth GHCR en lecture/écriture |
| `SERVER_HOST` | Secret | IP ou hostname du serveur cible (NetBird IP pour le HP, IP publique pour VPS). **Si vide, le deploy SSH est ignoré.** |
| `SSH_USER` | Secret | Utilisateur SSH sur le serveur (ex: `root`, `ubuntu`) |
| `SSH_PRIVATE_KEY` | Secret | Clé privée SSH (contenu de `~/.ssh/id_rsa`). La clé publique doit être dans `~/.ssh/authorized_keys` sur le serveur. |
| `GHCR_TOKEN` | Secret | PAT GitHub avec scope `read:packages` — permet au serveur de pull les images. Générer : **Settings → Developer settings → Personal access tokens → Fine-grained** |
| `SCALE_N` | Variable | Nombre de réplicas backend à lancer (défaut : `1`) |
| `DEPLOY_PATH` | Variable | Chemin du workspace sur le serveur (défaut : `$HOME/workspace`) |

### Générer une paire de clés SSH pour le deploy

```bash
# Sur votre machine locale
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/deploy_key -N ""

# Copier la clé publique sur le serveur
ssh-copy-id -i ~/.ssh/deploy_key.pub user@SERVER_HOST

# Copier la clé privée dans le secret GitHub SSH_PRIVATE_KEY
cat ~/.ssh/deploy_key
```

### Activer le deploy SSH (quand le serveur est prêt)

1. Configurer `SERVER_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `GHCR_TOKEN` dans les secrets GitHub
2. Pousser un commit sur `main` touchant `assistant/`
3. Le job **Deploy via SSH** se déclenche automatiquement après le build
4. Le serveur exécute `make deploy-assistant N=$SCALE_N`

### Deploy manuel sur le serveur

```bash
# Authentification GHCR (avec un PAT read:packages)
echo "VOTRE_GHCR_TOKEN" | docker login ghcr.io -u toussaintgarinat-crypto --password-stdin

# Pull + redémarrage (1 réplica)
make deploy-assistant N=1

# Scale à 3 réplicas (requiert PostgreSQL + Redis)
make deploy-assistant N=3
```


## Connexion aux autres services

L'assistant peut se connecter à Forge, MemPalace et Oria via l'interface **Connexions** (onglet paramètres dans l'UI). Aucune configuration `.env` requise — les URLs et tokens sont gérés directement dans l'UI.


## Connaissance offline (Kiwix)

Le service `kiwix` expose Wikipedia en local, accessible même sans internet. Le tool `search_kiwix` est activé automatiquement si Kiwix répond au démarrage du backend.

### Activer Kiwix

```bash
# Dans assistant/.env
KIWIX_URL=http://kiwix:8080
ZIM_PATH=/opt/assistant/zim   # chemin host des fichiers ZIM
```

### Télécharger Wikipedia

```bash
# Mini (~50 Mo, recommandé pour tester)
bash scripts/download_zim.sh fr_mini

# Wikipedia FR complet sans images (~5 Go)
bash scripts/download_zim.sh fr

# Redémarrer kiwix après téléchargement
docker compose restart kiwix
```

### Comportement

| État | Tool LLM | Résultat |
|---|---|---|
| Kiwix sain, aucun ZIM | désactivé | — |
| Kiwix sain + ZIM chargé | `search_kiwix` activé | 5 résultats max |
| Kiwix KO au démarrage | désactivé | — |

- Port local : `http://localhost:8090`
- Les ZIM sont montés depuis `ZIM_PATH` (`/opt/assistant/zim` par défaut)
