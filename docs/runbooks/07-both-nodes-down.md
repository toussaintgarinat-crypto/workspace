# Runbook — Activation page maintenance Cloudflare Pages (Plan D)

## Symptômes
- Alertes Prometheus déclenchées : `AllServicesDown`, `HPNodeDown`, `Node2Down` (depuis monitoring externe)
- Situation : HP ET N2 simultanément inaccessibles (coupure réseau/électrique, catastrophe)
- Symptôme utilisateur : timeout sur toutes les URLs publiques (assistant, oria, mempalace)
- Logs cloudflare-monitor :
  ```
  [WARN] HP: 3 consecutive failures — switching DNS to Node 2
  [WARN] Node2: 3 consecutive failures — no healthy node available
  [CRIT] Both nodes down — manual intervention required
  ```

## Pré-conditions
- Accès requis : accès Cloudflare dashboard (navigateur) ou CLI `cf` / token API Cloudflare
- Credentials : `CF_API_TOKEN`, `CF_ZONE_ID`, `DOMAIN` (dans `.env` racine)
- État attendu avant action : HP KO, N2 KO, DNS Cloudflare pointant vers un nœud qui ne répond plus
- Cloudflare Pages (page maintenance S89) déjà déployée et disponible

---

## Procédure

### 1. Confirmer que les deux nœuds sont down

```bash
source .env

# Depuis une machine tierce (Mac local, téléphone, etc.)
# Test HTTP rapide
curl -sf --connect-timeout 5 https://assistant.${DOMAIN}/health && echo "HP UP" || echo "HP DOWN"

# Test via monitoring externe (si disponible)
make both-down-drill   # affiche les instructions de vérification

# Vérifier le DNS actuel
dig +short assistant.${DOMAIN} A
```

### 2. Redirection DNS vers Cloudflare Pages (page maintenance)

#### Option A — Via script automatique (si token disponible en local)

```bash
source .env

# Récupérer l'ID de l'enregistrement DNS cible
CF_RECORD_ID=$(curl -sf \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records?name=assistant.${DOMAIN}&type=CNAME" \
  | python3 -c "import sys,json; r=json.load(sys.stdin)['result']; print(r[0]['id']) if r else print('')")

echo "Record ID: $CF_RECORD_ID"

# Rediriger vers le sous-domaine CF Pages maintenance
# La page maintenance est hébergée sur Cloudflare Pages (ex: maintenance-agent.pages.dev)
CF_PAGES_URL="${CF_PAGES_URL:-maintenance-agent.pages.dev}"

curl -sf -X PATCH \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records/${CF_RECORD_ID}" \
  -d "{\"type\":\"CNAME\",\"name\":\"assistant.${DOMAIN}\",\"content\":\"${CF_PAGES_URL}\",\"proxied\":true}" \
  | python3 -m json.tool
```

#### Option B — Via Cloudflare Dashboard (manuel)

```
1. Se connecter à https://dash.cloudflare.com
2. Sélectionner le domaine : ${DOMAIN}
3. DNS → Records
4. Chercher l'enregistrement : assistant.${DOMAIN}
5. Modifier : Type=CNAME, Content = maintenance-agent.pages.dev (ou nom CF Pages)
6. Activer le proxy Cloudflare (nuage orange)
7. Sauvegarder
8. Répéter pour : mempalace.${DOMAIN}, oria.${DOMAIN}, api.${DOMAIN}
```

#### Option C — Page Rules Cloudflare (redirection globale)

```bash
source .env

# Créer une Page Rule qui redirige tout le domaine vers la page maintenance
curl -sf -X POST \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/pagerules" \
  -d "{
    \"targets\": [{\"target\":\"url\",\"constraint\":{\"operator\":\"matches\",\"value\":\"*.${DOMAIN}/*\"}}],
    \"actions\": [{\"id\":\"forwarding_url\",\"value\":{\"url\":\"https://maintenance-agent.pages.dev\",\"status_code\":302}}],
    \"status\": \"active\",
    \"priority\": 1
  }" | python3 -m json.tool
```

### 3. Vérifier la propagation DNS

```bash
source .env

# Attendre 30-60 secondes pour la propagation (Cloudflare : généralement < 30s)
sleep 30

# Vérifier que la page maintenance s'affiche
curl -sf -L "https://assistant.${DOMAIN}" | grep -i "maintenance\|bientôt\|back soon" && echo "Page maintenance OK" || echo "Page maintenance NON affichée"

# Via dig
dig +short assistant.${DOMAIN} CNAME
```

### 4. Tenter de relancer les nœuds

```bash
# Sur HP (si accès IPMI/iDRAC disponible)
# Utiliser l'interface IPMI ou Wake-on-LAN (si configuré)
# WoL depuis le réseau local :
# wakeonlan <MAC_ADDRESS_HP>

# Via NetBird management console (si le serveur NetBird est sur une infra tierce)
# https://app.netbird.io → Peers → HP → Restart

# Vérifier la reprise
sleep 60
curl -sf --connect-timeout 10 http://${HP_NETBIRD_IP:-localhost}:8000/health && echo "HP revenu" || echo "HP toujours down"
```

### 5. Restaurer le DNS vers les nœuds opérationnels

Dès qu'un nœud est de retour :

```bash
source .env
HP_PUBLIC_IP=$(dig +short hp.${DOMAIN} A)

# Remettre l'A record vers HP
CF_RECORD_ID=$(curl -sf \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records?name=assistant.${DOMAIN}" \
  | python3 -c "import sys,json; r=json.load(sys.stdin)['result']; print(r[0]['id']) if r else print('')")

curl -sf -X PATCH \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records/${CF_RECORD_ID}" \
  -d "{\"type\":\"A\",\"name\":\"assistant.${DOMAIN}\",\"content\":\"${HP_PUBLIC_IP}\",\"proxied\":true}" \
  | python3 -m json.tool

# Supprimer la Page Rule de redirection si elle a été créée
# CF Dashboard → Rules → Page Rules → supprimer la règle de maintenance
```

---

## Vérification post-recovery

```bash
source .env

# DNS résout vers la bonne IP
dig +short assistant.${DOMAIN} A

# Services répondent
curl -sf https://assistant.${DOMAIN}/health | python3 -m json.tool
curl -sf https://mempalace.${DOMAIN}/api/health | python3 -m json.tool

# Alertes Prometheus résolues
curl -sf http://localhost:9090/api/v1/alerts | python3 -c \
  "import sys,json; alerts=json.load(sys.stdin)['data']['alerts']; [print(a['labels']['alertname'], a['state']) for a in alerts if a['state'] == 'firing']"
```

---

## Communication
- Telegram : `[INCIDENT MAJEUR] Les deux nœuds HP + N2 sont inaccessibles. Page maintenance activée sur Cloudflare. Aucune donnée perdue. Retour estimé: inconnu. Investigation en cours.`
- En cas de retour : `[RÉSOLUTION] Nœuds revenus. DNS restauré vers HP. Tous les services opérationnels.`
- Qui prévenir : soi-même (infra solo)

## Post-mortem
Voir `POSTMORTEM_TEMPLATE.md`
