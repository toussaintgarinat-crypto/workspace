# Continuité d'activité — documentation

Plan de continuité (BCP) du projet Agent Personnel. Voir aussi la mémoire `roadmap-sprints-86-91`.

## Sommaire

- [00-inventory.md](./00-inventory.md) — matrice composant × backup × replication × failover × monitoring (S86)
- [01-node2-decision.md](./01-node2-decision.md) — comparatif et arbitrage du node 2 (S86)

À venir :
- `02-postgres-ha.md` — Patroni + etcd + pgBouncer (S87)
- `03-data-replication.md` — Qdrant snapshots + MinIO mirror (S88)
- `04-entry-failover.md` — Traefik dual + DNS + page maintenance (S89)
- `05-degraded-mode.md` — feature flags par service (S90)
- `06-runbooks.md` — 12 runbooks de bascule + chaos drills (S91)

## Commandes utiles

```bash
make continuity-audit     # statut docker + alertes Prometheus + âge backups
make continuity-check     # promtool valide les règles
make continuity-reload    # POST /-/reload sur Prometheus (no downtime)
```

## Dashboards & alerting

- Grafana : http://localhost:3100 → dashboard **"Continuité d'activité"** (uid `continuity`)
- Prometheus : http://localhost:9090
- Alertmanager : http://localhost:9093 (Telegram/Discord en sortie, cf. S83)
