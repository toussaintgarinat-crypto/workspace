# Runbook — Partition réseau NetBird mesh cassé

## Symptômes
- Alertes Prometheus déclenchées : `NetBirdPeerDown`, `Node2Unreachable`, `SSHTunnelFailed`
- Logs typiques :
  ```
  netbird  | ERROR: failed to connect to peer <peer-id>: connection timeout
  netbird  | WARN: signal server unreachable — reconnecting...
  rsync    | ssh: connect to host 100.x.x.x port 22: Connection timed out
  ```

## Pré-conditions
- Accès requis : SSH direct sur HP (IP publique ou LAN), accès Docker
- Credentials : `NETBIRD_SETUP_KEY`, `NODE2_IP`, `NODE2_SSH_KEY` (dans `.env` racine)
- État attendu avant action : ping inter-nœuds via IP NetBird échoue (100.x.x.x injoignable)

---

## Procédure

### 1. Diagnostic rapide

```bash
# Statut NetBird local (HP)
netbird status

# Sortie attendue si sain :
# OS: linux/amd64
# Daemon version: ...
# CLI version: ...
# Management: Connected
# Signal:     Connected
# Relays:     1/1 Available
# Peers count: 2/2 Connected

# Vérifier la connectivité vers les peers
netbird status --detail 2>/dev/null || true

# Ping via IP NetBird (100.x.x.x assignées par NetBird)
source .env
ping -c 3 ${MACBOOK_NETBIRD_IP:-100.x.x.1} 2>/dev/null || echo "MacBook NetBird injoignable"
ping -c 3 ${NODE2_NETBIRD_IP:-100.x.x.2} 2>/dev/null || echo "Node2 NetBird injoignable"
```

### 2. Redémarrage NetBird (fix le plus fréquent)

```bash
# Arrêt propre puis reconnexion
netbird down
sleep 5
netbird up

# Vérifier la reconnexion (attendre 10-15 secondes)
sleep 15
netbird status

# Si le daemon NetBird n'est pas installé en service système
docker ps | grep netbird
docker restart netbird 2>/dev/null || true
sleep 15
netbird status
```

### 3. Réenregistrement complet (si reconnexion simple échoue)

```bash
source .env

# Désenregistrer le peer actuel
netbird down

# Réenregistrer avec la setup key
netbird up --setup-key ${NETBIRD_SETUP_KEY} \
           --management-url https://api.netbird.io \
           --hostname hp-node

sleep 20
netbird status
```

### 4. Vérifier depuis le management Netbird

```bash
# Lister les peers via l'API NetBird (nécessite NETBIRD_API_TOKEN)
source .env
if [[ -n "${NETBIRD_API_TOKEN:-}" ]]; then
  curl -sf \
    -H "Authorization: Bearer ${NETBIRD_API_TOKEN}" \
    "https://api.netbird.io/api/peers" \
    | python3 -c "import sys,json; [print(p['name'], '→', p['ip'], 'connected:', p.get('connected')) for p in json.load(sys.stdin)]"
else
  echo "NETBIRD_API_TOKEN non défini — vérifier via https://app.netbird.io/peers"
fi
```

### 5. Fallback SSH direct via IP publique (si NetBird définitivement KO)

Si NetBird ne parvient pas à se reconnecter, utiliser SSH direct vers N2 via son IP publique ou LAN.

```bash
source .env

# Identifier l'IP publique de N2 (si connue)
NODE2_PUBLIC_IP="${NODE2_PUBLIC_IP:-}"
NODE2_LAN_IP="${NODE2_LAN_IP:-}"

if [[ -n "$NODE2_PUBLIC_IP" ]]; then
  echo "Tentative SSH direct via IP publique N2..."
  ssh -i ${NODE2_SSH_KEY:-~/.ssh/id_ed25519} \
      -o StrictHostKeyChecking=no \
      -o ConnectTimeout=15 \
      ${NODE2_SSH_USER:-ubuntu}@${NODE2_PUBLIC_IP} \
      "hostname && docker ps --format '{{.Names}} {{.Status}}' | head -10"
fi

if [[ -n "$NODE2_LAN_IP" ]]; then
  echo "Tentative SSH direct via IP LAN N2..."
  ssh -i ${NODE2_SSH_KEY:-~/.ssh/id_ed25519} \
      -o StrictHostKeyChecking=no \
      -o ConnectTimeout=15 \
      ${NODE2_SSH_USER:-ubuntu}@${NODE2_LAN_IP} \
      "hostname && netbird status"
fi
```

### 6. Réinstaller NetBird si le binaire est corrompu

```bash
# Sur HP (si accès local ou SSH direct disponible)
curl -fsSL https://pkgs.netbird.io/install.sh | sh

# Vérifier la version installée
netbird version

# Relancer avec la setup key
source .env
netbird down
netbird up --setup-key ${NETBIRD_SETUP_KEY}
sleep 20
netbird status
```

### 7. Relancer les services qui dépendent de NetBird

Si NetBird était requis pour accéder à N2 (rsync WAL, snapshots, acme-sync) :

```bash
# Synchronisation ACME certs
make acme-sync

# Re-sync snapshots Qdrant vers N2
QDRANT_URL=http://localhost:6334 \
NODE2_IP=$(grep NODE2_IP .env | cut -d= -f2) \
bash infra/qdrant/snapshot-and-sync.sh
```

---

## Vérification post-recovery

```bash
# Statut complet NetBird
netbird status --detail

# Ping inter-nœuds via IP NetBird
source .env
ping -c 5 ${NODE2_NETBIRD_IP:-} 2>/dev/null && echo "N2 NetBird OK" || echo "N2 NetBird toujours KO"

# SSH vers N2 via NetBird
ssh -i ${NODE2_SSH_KEY:-~/.ssh/id_ed25519} \
    -o StrictHostKeyChecking=no \
    -o ConnectTimeout=10 \
    ${NODE2_SSH_USER:-ubuntu}@${NODE2_IP:-} \
    "echo 'SSH N2 OK'" 2>/dev/null || echo "SSH N2 toujours KO"

# Alertes Prometheus
curl -sf http://localhost:9090/api/v1/alerts | python3 -c \
  "import sys,json; alerts=json.load(sys.stdin)['data']['alerts']; [print(a['labels']['alertname'], a['state']) for a in alerts if 'NetBird' in a['labels'].get('alertname','') or 'Node2' in a['labels'].get('alertname','')]"
```

---

## Communication
- Telegram : `[INCIDENT] NetBirdDown — Mesh inter-nœuds cassé. Résync WAL/snapshots N2 suspendu. Fallback SSH direct activé. Investigation en cours.`
- Qui prévenir : soi-même (infra solo)

## Post-mortem
Voir `POSTMORTEM_TEMPLATE.md`
