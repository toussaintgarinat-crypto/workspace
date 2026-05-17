# MemPalace — Guide de configuration

Ce fichier couvre la configuration Docker et les variables d'environnement. Pour la documentation complète sur le système de mémoire, voir [README.md](README.md).

- **API** : `http://localhost:8100`
- **MinIO console** : `http://localhost:9103`


## Démarrage

```bash
# Depuis la racine du workspace
make start-mempalace

# Premier lancement (crée les buckets MinIO)
cd mempalace && bash setup.sh
```


## Variables d'environnement

### Obligatoires

| Variable | Description | Comment générer |
|---|---|---|
| `MEMPALACE_JWT_SECRET` | Clé de signature des tokens JWT utilisateurs | `openssl rand -base64 32` |
| `MEMPALACE_ADMIN_TOKEN` | Token requis pour créer des comptes supplémentaires après le premier | `openssl rand -hex 24` |

> Le **premier compte** est créé librement (pas de token requis). Les suivants nécessitent `MEMPALACE_ADMIN_TOKEN`. C'est le mécanisme d'invitation.


### Optionnelles — Stockage

| Variable | Description | Défaut |
|---|---|---|
| `MEMPALACE_STORAGE` | Mode de stockage : `local` (fichiers) ou `s3` (MinIO) | `local` |
| `MEMPALACE_MINIO_USER` | Utilisateur admin MinIO | `mempalace` |
| `MEMPALACE_MINIO_PASSWORD` | Mot de passe MinIO | `mempalace_secret` — **à changer** |

> Le mode `s3` est recommandé pour les déploiements cloud — les palaces survivent aux redémarrages de container.

Pour activer MinIO :
```bash
MEMPALACE_STORAGE=s3
MEMPALACE_MINIO_USER=mempalace
MEMPALACE_MINIO_PASSWORD=un_mot_de_passe_fort
```


### Optionnelles — Gateway LLM

Permet à MemPalace d'utiliser un LLM pour des opérations avancées (résumé, recherche augmentée).

| Variable | Description | Défaut |
|---|---|---|
| `GATEWAY_URL` | URL du gateway LiteLLM | *(vide — LLM désactivé)* |
| `GATEWAY_API_KEY` | Clé virtuelle MemPalace dans le gateway | `sk-mempalace` |
| `GATEWAY_MODEL` | Modèle à utiliser | `openai/gpt-4o-mini` |

```bash
GATEWAY_URL=http://localhost:4000
GATEWAY_API_KEY=sk-mempalace
GATEWAY_MODEL=openai/gpt-4o-mini   # modèle économique recommandé
```


## Créer un compte et obtenir un token de service

Après le premier démarrage :

```bash
# 1. Créer le premier compte
curl -X POST http://localhost:8100/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "votre_mot_de_passe"}'

# 2. Se connecter et obtenir un token JWT
curl -X POST http://localhost:8100/auth/token \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "votre_mot_de_passe"}'
# → {"access_token": "eyJ..."}

# 3. Créer un token de service (pour Forge/Assistant)
curl -X POST http://localhost:8100/auth/service-token \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{"name": "forge-integration"}'
# → {"token": "svc_..."}
```

Ce token `svc_...` est à utiliser dans :
- `MEMPALACE_API_TOKEN` dans `forge/.env`
- Connexion MemPalace dans l'UI Assistant


## Intégration avec Forge

Dans `forge/.env` (ou `.env` racine) :
```bash
MEMPALACE_API_URL=http://localhost:8100
MEMPALACE_API_TOKEN=svc_...   # token créé ci-dessus
```

## Intégration avec l'Assistant

Dans l'UI Assistant → **Connexions** → **Ajouter une connexion** → type `MemPalace` → URL + token.
