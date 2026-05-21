# Runbook — Postgres HA Failover (S87)

## Contexte

Deux clusters Patroni indépendants :
- **forge-pg** : Forge + Keycloak — pgBouncer sur `pgbouncer:5432`
- **oria-pg** : Oria backend + Keycloak — pgBouncer sur `pgbouncer:5432`

Phase A (actuelle) : single-node, etcd single-node, WAL archive local.  
Phase B (N2 + Pi reçus) : ajouter replica + etcd 3 nodes → voir section Phase B ci-dessous.

---

## Statut rapide

```bash
make pg-status        # Patroni forge
make pg-status-oria   # Patroni oria
```

Sortie attendue (leader sain) :
```
+ Cluster: forge-pg (xxxxxxxxx) +---------+----+-----------+
| Member       | Host           | Role    | State   | TL | Lag in MB |
+--------------+----------------+---------+---------+----+-----------+
| forge-node1  | postgres:5432  | Leader  | running |  1 |           |
+--------------+----------------+---------+---------+----+-----------+
```

---

## Plan A — Opération normale

Postgres tourne sur le nœud HP G4. pgBouncer distribue les connexions.  
Vérifications de routine :
```bash
# Lag WAL archive (doit être < 5min)
docker exec forge-postgres-1 psql -U postgres -c "SELECT now() - last_archived_time FROM pg_stat_archiver;"

# Connexions actives pgBouncer
docker exec forge-pgbouncer-1 psql -p 5432 -U forge pgbouncer -c "SHOW POOLS;"
```

---

## Plan B — Failover Patroni (Phase B uniquement, N2 disponible)

En Phase B, si le primary HP G4 tombe, Patroni promeut automatiquement le replica N2 (< 30s).

**Vérification après failover automatique :**
```bash
make pg-status
# Member forge-node1 doit afficher "stopped" ou "start failed"
# Member forge-node2 doit afficher "Leader"
```

**Failover forcé manuel (maintenance) :**
```bash
docker exec forge-postgres-1 patronictl -c /etc/patroni/patroni.yml failover forge-pg --master forge-node1 --candidate forge-node2 --scheduled now --force
```

**Retour du primary HP G4 après réparation :**
```bash
# Patroni re-join automatiquement comme replica en streaming
make pg-status  # vérifier que forge-node1 revient comme "Replica"
```

---

## Plan C — Restore depuis WAL archive

Si le primary et le replica sont tous les deux KO.

**Localiser les archives WAL :**
```bash
# Les WAL sont dans le volume wal_archive
docker volume inspect forge_wal_archive
# ou sur le filesystem host :
ls -lh /var/lib/docker/volumes/forge_wal_archive/_data/
```

**Restore (exemple Forge) :**
```bash
# 1. Stopper forge
make stop-forge

# 2. Backup du data directory courant
docker run --rm -v forge_postgres_data:/data -v /tmp:/backup alpine \
  tar czf /backup/pg_data_backup_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .

# 3. Vider le data directory
docker run --rm -v forge_postgres_data:/data alpine sh -c "rm -rf /data/*"

# 4. Restore base depuis pg_dump (Plan D) OU via PITR WAL :
#    PITR nécessite un base backup + replay des WAL jusqu'à RECOVERY_TARGET_TIME
#    Ajouter recovery.conf dans le data dir avant de démarrer Patroni.

# 5. Redémarrer
make start-forge
make pg-status
```

---

## Plan D — Restore depuis pg_dump (dernier recours)

Si WAL corrompus ou perdus, utiliser le pg_dump du backup S82 :
```bash
BACKUP=<timestamp>  make restore
# Puis relancer les migrations Alembic si nécessaire
```

---

## Phase B — Ajouter le replica (N2 + Pi disponibles)

1. Provisionner N2 avec Docker + NetBird
2. Modifier `forge/docker-compose.yml` (sur N2) :
   ```yaml
   # Ajouter service patroni-replica
   patroni-replica:
     build:
       context: ../infra/postgres-ha
     image: patroni-pg16:local
     environment:
       PATRONI_NAME: forge-node2
       PATRONI_SCOPE: forge-pg
       PATRONI_ETCD3_HOSTS: "forge-node1-ip:2379,forge-node2-ip:2379,pi-ip:2379"
       # ... autres vars identiques au primary
   ```
3. Ajouter les 2 membres etcd supplémentaires (N2 + Pi) :
   ```bash
   # Sur HP G4 : joindre N2 et Pi au cluster etcd existant
   etcdctl member add forge-node2 --peer-urls http://N2_IP:2380
   etcdctl member add pi-witness  --peer-urls http://PI_IP:2380
   ```
4. Activer `synchronous_mode: true` dans patroni.yml (DCS) :
   ```bash
   docker exec forge-postgres-1 patronictl -c /etc/patroni/patroni.yml edit-config
   # Modifier synchronous_mode: true
   # synchronous_mode_strict: false (fallback async si replica absent)
   ```
5. Tester le failover :
   ```bash
   make pg-failover-drill  # à implémenter en S91
   ```

---

## Contacts escalade

- Runbook BCP global : `docs/continuity/README.md`
- Alertes Prometheus : `observability/prometheus/continuity.yml` (groupes continuity_postgres)
- Dashboard Grafana : uid `continuity` → panel "PG Replication Lag"
