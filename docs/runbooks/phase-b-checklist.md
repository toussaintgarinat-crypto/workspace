# Checklist Phase B — HP G4 SFF + Raspberry Pi 3B+

Déclencher ce runbook quand le matériel est reçu.  
**Prérequis Phase A** : stack tournant en dev local (MacBook), commit `732aad4` déjà appliqué.

---

## 0. Variables à remplir dans `.env` (avant tout)

```bash
# IP NetBird du Pi (attribuée après inscription au mesh)
PI_NETBIRD_IP=100.64.x.x

# Adresse MAC de la carte réseau HP G4 SFF (côté LAN)
# Trouver : ip link show eth0 (sur HP quand allumé manuellement 1 fois)
HP_MAC_ADDRESS=xx:xx:xx:xx:xx:xx

# IP NetBird du HP (attribuée après inscription)
HP_NETBIRD_IP=100.64.x.x

# IP LAN locale du HP (pour WoL — même subnet que le Pi)
HP_LAN_IP=192.168.x.x
```

---

## 1. Raspberry Pi 3B+ — Setup initial

### 1.1 OS
- Flasher **Raspberry Pi OS Lite 64-bit** (Bookworm) sur carte SD
- Activer SSH via `raspi-config` ou fichier `ssh` vide sur `/boot`

### 1.2 Docker
```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker pi
```

### 1.3 Wake-on-LAN (WoL relay)
Le Pi est sur le même LAN que le HP. Quand le HP est éteint, le Pi peut lui envoyer un magic packet via NetBird.

```bash
# Sur le Pi
apt-get install -y wakeonlan

# Test (HP doit être éteint, BIOS WoL activé)
wakeonlan <HP_MAC_ADDRESS>
```

### 1.4 Mini HTTP relay WoL (optionnel — pour `make wake-hp`)
```bash
# Sur le Pi — crée un endpoint HTTP sur port 9999
cat > /opt/wol-relay.py << 'EOF'
from http.server import HTTPServer, BaseHTTPRequestHandler
import subprocess, os

MAC = os.environ.get("HP_MAC", "")

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == "/wake":
            subprocess.run(["wakeonlan", MAC], check=True)
            self.send_response(200); self.end_headers(); self.wfile.write(b"sent")
        else:
            self.send_response(404); self.end_headers()
    def log_message(self, *a): pass

HTTPServer(("0.0.0.0", 9999), Handler).serve_forever()
EOF

cat > /etc/systemd/system/wol-relay.service << 'EOF'
[Unit]
Description=WoL Relay HTTP
After=network.target

[Service]
Environment=HP_MAC=<HP_MAC_ADDRESS>
ExecStart=/usr/bin/python3 /opt/wol-relay.py
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl enable --now wol-relay
```

### 1.5 NetBird sur le Pi
```bash
# Méthode officielle (arm64 compatible)
curl -fsSL https://pkgs.netbird.io/install.sh | sh
netbird up --setup-key <SETUP_KEY_DEPUIS_FORGE_DASHBOARD>

# Vérifier
netbird status
# → noter l'IP NetBird attribuée → mettre dans .env PI_NETBIRD_IP
```

---

## 2. HP G4 SFF — Setup initial

### 2.1 BIOS — Wake-on-LAN
- Entrer dans le BIOS (F10 sur HP)
- `Advanced → Power Management` → **Wake On LAN : Enabled**
- `Advanced → Network Boot` → activer pour la carte réseau LAN

### 2.2 OS
- Installer **Ubuntu Server 24.04 LTS** (recommandé) ou Debian 12
- Configurer interface réseau fixe ou DHCP statique sur le routeur (même IP LAN à chaque démarrage)

### 2.3 Docker
```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker $USER
```

### 2.4 NetBird sur le HP
```bash
curl -fsSL https://pkgs.netbird.io/install.sh | sh
netbird up --setup-key <SETUP_KEY_DEPUIS_FORGE_DASHBOARD>
netbird status
# → noter l'IP NetBird → mettre dans .env HP_NETBIRD_IP
```

### 2.5 Vérifier que WoL fonctionne depuis le Pi
```bash
# Éteindre le HP (shutdown -h now)
# Depuis MacBook via NetBird :
ssh pi@<PI_NETBIRD_IP> wakeonlan <HP_MAC_ADDRESS>
# Le HP doit démarrer dans les ~10 secondes
```

---

## 3. Makefile — Targets WoL + SSH HP

Ajouter dans `Makefile` :

```makefile
# ── HP G4 SFF (S87B+) ─────────────────────────────────────────
HP_NETBIRD_IP ?= $(shell grep '^HP_NETBIRD_IP=' $(ENV_FILE) 2>/dev/null | cut -d= -f2-)
PI_NETBIRD_IP ?= $(shell grep '^PI_NETBIRD_IP='  $(ENV_FILE) 2>/dev/null | cut -d= -f2-)

.PHONY: wake-hp ssh-hp ssh-pi

# Allumer le HP via le Pi (WoL magic packet)
wake-hp:
	@HP_MAC=$$(grep '^HP_MAC_ADDRESS=' $(ENV_FILE) 2>/dev/null | cut -d= -f2-); \
	ssh pi@$(PI_NETBIRD_IP) "wakeonlan $$HP_MAC && echo '✓ Magic packet envoyé'"

# SSH direct sur le HP via NetBird
ssh-hp:
	ssh $(HP_NETBIRD_IP)

# SSH sur le Pi
ssh-pi:
	ssh pi@$(PI_NETBIRD_IP)
```

---

## 4. Migration des services MacBook → HP

### 4.1 Cloner le repo sur le HP
```bash
# Sur le HP (via ssh-hp)
git clone <REPO_URL> ~/workspace
cd ~/workspace
cp .env.example .env
# Remplir .env avec les vraies valeurs (copier depuis MacBook)
```

### 4.2 Générer les .env de service
```bash
make seed-envs
```

### 4.3 Créer les réseaux Docker
```bash
make proxy-network observability-network
```

### 4.4 Premier démarrage (ordre important)
```bash
make start-gateway
make start-mempalace
make start-forge     # inclut etcd + patroni + pgbouncer
make start-oria      # inclut etcd + patroni + pgbouncer
make start-assistant
make start-observability
```

### 4.5 Vérifier Patroni
```bash
make pg-status       # doit afficher forge-node1 Leader
make pg-status-oria  # doit afficher oria-node1 Leader
```

### 4.6 Build de l'image Patroni (premier démarrage)
```bash
# Docker compose build l'image au premier `up`
# Si besoin de rebuild manuel :
docker build -t patroni-pg16:local infra/postgres-ha/
```

---

## 5. Phase B — Postgres HA complet (quand N2 est décidé)

> Prérequis : HP + Pi en ligne sur NetBird, N2 approvisionné avec Docker + NetBird.

### 5.1 Étendre etcd de 1 → 3 nodes (HP + Pi + N2)

**Backup etcd d'abord :**
```bash
docker exec forge-etcd-1 etcdctl snapshot save /bitnami/etcd/backup.db \
  --endpoints=http://127.0.0.1:2379
```

**Ajouter Pi comme membre :**
```bash
# Obtenir l'ID du cluster actuel
docker exec forge-etcd-1 etcdctl member list --endpoints=http://127.0.0.1:2379

# Ajouter Pi
docker exec forge-etcd-1 etcdctl member add pi-witness \
  --peer-urls="http://<PI_NETBIRD_IP>:2380" \
  --endpoints=http://127.0.0.1:2379
```

**Démarrer etcd sur le Pi** (docker-compose dédié sur Pi) :
```bash
# Sur le Pi — infra/etcd-witness/docker-compose.yml (à créer)
ETCD_INITIAL_CLUSTER_STATE=existing  # PAS "new" !
ETCD_INITIAL_CLUSTER="forge-node1=http://<HP_NETBIRD_IP>:2380,pi-witness=http://<PI_NETBIRD_IP>:2380"
```

**Ajouter N2 :**
```bash
docker exec forge-etcd-1 etcdctl member add n2-node \
  --peer-urls="http://<N2_NETBIRD_IP>:2380" \
  --endpoints=http://127.0.0.1:2379
# Démarrer etcd sur N2 avec initial-cluster-state=existing
```

**Vérifier cluster 3 membres :**
```bash
docker exec forge-etcd-1 etcdctl member list --endpoints=http://127.0.0.1:2379
# Doit afficher 3 membres (HP + Pi + N2) avec statut "started"
```

### 5.2 Ajouter le replica Patroni sur N2

Sur N2, créer `forge/docker-compose.replica.yml` :
```yaml
services:
  patroni-replica:
    build:
      context: ../infra/postgres-ha
    image: patroni-pg16:local
    environment:
      PATRONI_NAME: forge-node2          # NOM DIFFÉRENT du primary
      PATRONI_SCOPE: forge-pg            # MÊME scope que le primary
      PATRONI_RESTAPI_CONNECT_ADDRESS: <N2_NETBIRD_IP>:8008
      PATRONI_POSTGRESQL_CONNECT_ADDRESS: <N2_NETBIRD_IP>:5432
      PATRONI_POSTGRESQL_DATA_DIR: /var/lib/postgresql/data
      # Pointer vers les 3 nodes etcd
      PATRONI_ETCD3_HOSTS: "<HP_NETBIRD_IP>:2379,<PI_NETBIRD_IP>:2379,<N2_NETBIRD_IP>:2379"
      # Mêmes credentials que le primary
      PATRONI_SUPERUSER_PASSWORD: ${POSTGRES_SUPERUSER_PASSWORD}
      PATRONI_REPLICATION_USERNAME: replicator
      PATRONI_REPLICATION_PASSWORD: ${REPLICATOR_PASSWORD}
      PATRONI_REWIND_USERNAME: rewind_user
      PATRONI_REWIND_PASSWORD: ${REWIND_PASSWORD}
      POSTGRES_USER: ${POSTGRES_USER:-forge}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB:-forge}
    volumes:
      - postgres_data:/var/lib/postgresql/data    # volume local sur N2
      - wal_archive:/var/lib/postgresql/wal_archive
      - ../infra/postgres-ha/forge/patroni.yml:/etc/patroni/patroni.yml:ro
    ports:
      - "5432:5432"
      - "8008:8008"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -h 127.0.0.1 || exit 1"]
      interval: 5s
      timeout: 5s
      retries: 20
      start_period: 60s
    restart: unless-stopped
```

Démarrer :
```bash
docker compose -f forge/docker-compose.replica.yml up -d
# Patroni va automatiquement cloner le primary via pg_basebackup et démarrer en streaming
```

Vérifier :
```bash
make pg-status
# Doit afficher :
# forge-node1 | HP_IP  | Leader  | running | 1 |     0 |
# forge-node2 | N2_IP  | Replica | running | 1 |     0 |
```

### 5.3 Activer synchronous_mode (RPO = 0)

```bash
# Sur HP
docker exec forge-postgres-1 patronictl -c /etc/patroni/patroni.yml edit-config
```

Modifier dans l'éditeur :
```yaml
synchronous_mode: true
synchronous_mode_strict: false  # fallback async si replica absent → writes ne bloquent pas
```

Vérifier que le replica est bien en sync :
```bash
docker exec forge-postgres-1 psql -U postgres -c "SELECT application_name, sync_state FROM pg_stat_replication;"
# sync_state doit être "sync" ou "quorum"
```

### 5.4 Même procédure pour Oria (cluster oria-pg)

Répéter les étapes 5.1-5.3 avec :
- scope `oria-pg` au lieu de `forge-pg`
- `infra/postgres-ha/oria/patroni.yml`
- Port etcd oria sur un port différent (2381 pour éviter collision si même machine)
  
```bash
make pg-status-oria
```

---

## 6. Vérification finale Phase B

```bash
# Statut Patroni (2 leaders + 2 replicas)
make pg-status && make pg-status-oria

# Latence replication (doit être < 1s)
docker exec forge-postgres-1 psql -U postgres -c \
  "SELECT application_name, write_lag, flush_lag, replay_lag FROM pg_stat_replication;"

# WAL archive actif
docker exec forge-postgres-1 psql -U postgres -c \
  "SELECT archived_count, last_archived_wal, last_archived_time FROM pg_stat_archiver;"

# Prometheus alerts silencieuses (aucune alerte PatroniNoLeader, PostgresDown)
curl -s http://localhost:9090/api/v1/alerts | python3 -m json.tool | grep alertname
```

---

## 7. Référence IP / ports

| Service | Hôte | IP NetBird | Port |
|---|---|---|---|
| etcd Forge | HP G4 SFF | HP_NETBIRD_IP | 2379/2380 |
| etcd Oria | HP G4 SFF | HP_NETBIRD_IP | 2381/2382 |
| etcd Forge | Pi 3B+ | PI_NETBIRD_IP | 2379/2380 |
| etcd Forge | N2 | N2_NETBIRD_IP | 2379/2380 |
| Patroni primary Forge | HP | HP_NETBIRD_IP | 5432/8008 |
| Patroni replica Forge | N2 | N2_NETBIRD_IP | 5432/8008 |
| pgBouncer Forge | HP | HP_NETBIRD_IP | 6432 |
| WoL relay | Pi 3B+ | PI_NETBIRD_IP | 9999 |
