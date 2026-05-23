# Runbook — Traefik Failover (Sprint 89)

## Plans de continuité — Entrée publique

| Plan | Trigger | Action |
|---|---|---|
| **A** | Normal | Traefik HP G4 SFF, ACME HTTP-01, DNS → HP_PUBLIC_IP |
| **B** | HP inaccessible | DNS Cloudflare basculé → NODE2_PUBLIC_IP, Traefik N2 actif |
| **C** | HP + N2 inaccessibles | Accès direct via NetBird mesh (admin uniquement) |
| **D** | Tout down | Page maintenance Cloudflare Pages visible sur le domaine |

---

## Détection d'incident

Alertes Prometheus concernées (rules.yml — groupe `entry_tier`) :

| Alerte | Seuil | Sévérité |
|---|---|---|
| `TraefikHPDown` | HP ping fail > 1min | critical |
| `BothNodesDown` | HP + N2 fail > 30s | page |
| `CertExpiringSoon` | expiry < 14j | warning |

---

## Procédures

### Plan B — Bascule HP → Node 2

**Automatique** (si `cloudflare-monitor.sh` tourne sur Node 2 ou Pi) :
- 3 échecs consécutifs au poll `/ping` HP → CF API update automatique
- Telegram alerte envoyée
- DNS TTL 60s → propagation ~1min

**Manuel** :
```bash
# Vérifier que Traefik N2 est UP
ssh root@${NODE2_NETBIRD_IP} "docker compose -f infra/traefik/compose-node2.yml ps"

# Mettre à jour le DNS via CF API (remplacer les valeurs)
DOMAIN=monagent.fr
NODE2_PUBLIC_IP=<ip-n2>
CF_ZONE_ID=<zone-id>
CF_API_TOKEN=<token>

for rec in assistant.$DOMAIN oria.$DOMAIN mempalace.$DOMAIN forge.$DOMAIN; do
  RECORD_ID=$(curl -s "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records?name=${rec}&type=A" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" | python3 -c "import sys,json; print(json.load(sys.stdin)['result'][0]['id'])")
  curl -s -X PUT "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records/${RECORD_ID}" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" -H "Content-Type: application/json" \
    -d "{\"type\":\"A\",\"name\":\"${rec}\",\"content\":\"${NODE2_PUBLIC_IP}\",\"ttl\":60,\"proxied\":false}"
  echo "✓ $rec → $NODE2_PUBLIC_IP"
done
```

### Retour Plan A — Restauration HP

**Automatique** : `cloudflare-monitor.sh` détecte HP joignable → restore DNS.

**Manuel** :
```bash
bash infra/dns-failover/cloudflare-monitor.sh --restore
```

### Plan C — Accès NetBird mesh

```bash
# Vérifier la connectivité NetBird
netbird status

# Accéder directement aux services sur HP via IP NetBird
curl http://${HP_NETBIRD_IP}:8300/   # assistant frontend
curl http://${HP_NETBIRD_IP}:8200/health  # assistant backend
```

### Plan D — Page maintenance visible ?

```bash
# Vérifier que le DNS pointe bien vers Cloudflare Pages
dig +short assistant.${DOMAIN}
# Si retourne 192.0.2.x (Cloudflare Pages stub IP) → OK

# Forcer CNAME maintenance (si HP + N2 down ET DNS pas encore sur CF Pages)
# Via interface Cloudflare → DNS → modifier l'enregistrement
# Type: CNAME, Name: *, Target: agent-maintenance.pages.dev
```

---

## Synchronisation certs Let's Encrypt

Si Node 2 vient de démarrer, synchroniser les certs depuis HP pour éviter de refaire une validation :

```bash
make acme-sync
# Puis redémarrer Traefik N2 :
ssh root@${NODE2_NETBIRD_IP} "cd workspace && docker compose -f infra/traefik/compose-node2.yml restart traefik"
```

---

## Drills (tests réguliers)

```bash
# Drill bascule HP → N2
make traefik-failover-drill

# Drill both-down → maintenance page
make both-down-drill
```

---

## Variables d'environnement requises

| Variable | Description |
|---|---|
| `CF_API_TOKEN` | Token CF avec permission "Zone DNS Edit" |
| `CF_ZONE_ID` | ID de la zone (onglet Overview CF) |
| `CF_RECORDS` | Enregistrements A à basculer (CSV) |
| `HP_PUBLIC_IP` | IP publique HP G4 SFF |
| `NODE2_PUBLIC_IP` | IP publique Node 2 |
| `NODE2_NETBIRD_IP` | IP NetBird Node 2 (pour acme-sync + SSH) |
| `HP_NETBIRD_IP` | IP NetBird HP (pour accès mesh Plan C) |

---

## Checklist pré-bascule Node 2

- [ ] `docker compose -f infra/traefik/compose-node2.yml up -d` sur Node 2
- [ ] `make acme-sync` pour copier les certs
- [ ] Test ping N2 depuis externe : `curl http://<NODE2_PUBLIC_IP>:8082/ping`
- [ ] `cloudflare-monitor.sh` démarré sur Node 2 ou Pi (cron ou Docker service)
- [ ] Alerte Telegram test reçue au démarrage du monitor
