# Post-Mortem — [Titre de l'incident]

> Copier ce template, renommer le fichier : `POSTMORTEM_YYYY-MM-DD_<titre-court>.md`
> Compléter dans les 24h suivant la résolution.

---

## Résumé exécutif

| Champ | Valeur |
|-------|--------|
| **Date de début** | YYYY-MM-DD HH:MM UTC |
| **Date de fin** | YYYY-MM-DD HH:MM UTC |
| **Durée totale** | X heures Y minutes |
| **Sévérité** | P1 (critique) / P2 (dégradé) / P3 (mineur) |
| **Services impactés** | assistant / oria / mempalace / forge / keycloak / ... |
| **Utilisateurs impactés** | Tous / Partiel / Aucun (infra seule) |
| **Détecté par** | Prometheus / Telegram bot / Manuellement |
| **Résolu par** | Runbook XX / Action manuelle |

---

## Timeline

| Heure (UTC) | Événement |
|-------------|-----------|
| HH:MM | Première alerte déclenchée (`AlertName`) |
| HH:MM | Début investigation |
| HH:MM | Cause identifiée : [description courte] |
| HH:MM | Action de mitigation lancée : [description] |
| HH:MM | Services partiellement restaurés |
| HH:MM | Résolution complète confirmée |
| HH:MM | Post-mortem rédigé |

---

## Impact

### Services affectés
- **assistant** (port 8000) : indisponible / dégradé / non impacté
- **mempalace** (port 8100) : indisponible / dégradé / non impacté
- **oria** (port 8200) : indisponible / dégradé / non impacté
- **forge** : indisponible / dégradé / non impacté
- **keycloak** (port 8081) : indisponible / dégradé / non impacté
- **Qdrant** (port 6334) : indisponible / dégradé / non impacté
- **Postgres** (via pgBouncer 5432) : indisponible / dégradé / non impacté
- **MinIO** (ports 9000/9100) : indisponible / dégradé / non impacté

### Perte de données
- **Postgres** : aucune / X minutes de transactions (de HH:MM à HH:MM)
- **Qdrant** : aucune / vecteurs depuis [dernier snapshot] perdus
- **MinIO** : aucune / fichiers [liste] corrompus

---

## Cause racine

### Cause directe
> Ce qui a physiquement provoqué l'incident.

[Description précise — ex: "Disque NVMe du HP G4 SFF saturé à 100% suite à l'accumulation de WAL non archivés"]

### Cause contribuante
> Ce qui a permis à la cause directe d'avoir un impact.

[Description — ex: "Pas de monitoring sur la taille du répertoire wal_archive"]

### Cause systémique
> Pourquoi le système était vulnérable à cette cause.

[Description — ex: "Absence de rotation automatique des WAL archivés"]

---

## Ce qui a bien fonctionné

- [ ] Les alertes Prometheus ont détecté l'incident rapidement (< X min)
- [ ] Le runbook XX a permis une résolution structurée
- [ ] Le fallback [ILIKE / MinIO N2 / page maintenance] a limité l'impact utilisateur
- [ ] Le mode dégradé a été activé en < X min
- [ ] [Autre point positif]

---

## Ce qui a mal fonctionné

- [ ] Délai de détection trop long (X min entre incident et alerte)
- [ ] Le runbook XX était incomplet / ne couvrait pas ce cas
- [ ] La procédure de restore WAL a pris X min de plus que le RTO cible
- [ ] Absence de backup récent (dernier dump : J-X)
- [ ] [Autre point négatif]

---

## Actions correctives

| # | Action | Priorité | Owner | Deadline | Statut |
|---|--------|----------|-------|----------|--------|
| 1 | [Description précise de l'action] | P1 / P2 / P3 | soi-même | YYYY-MM-DD | A faire / En cours / Fait |
| 2 | Mettre à jour le runbook [XX] avec le cas [Y] | P2 | soi-même | YYYY-MM-DD | A faire |
| 3 | Ajouter alerte Prometheus pour [condition manquante] | P2 | soi-même | YYYY-MM-DD | A faire |
| 4 | Tester le drill [runbook XX] en conditions réelles | P3 | soi-même | YYYY-MM-DD | A faire |
| 5 | [Autre action corrective] | P3 | soi-même | YYYY-MM-DD | A faire |

---

## Métriques de performance

| Métrique | Cible | Réel |
|----------|-------|------|
| MTTD (détection) | < 5 min | X min |
| MTTA (accusé réception) | < 10 min | X min |
| MTTR (résolution) | < 30 min (P1) / 60 min (P2) | X min |
| RTO Postgres | < 30 min | X min |
| RTO Qdrant | < 10 min | X min |
| Perte de données | RPO < 1h | X min |

---

## Commandes utilisées (pour enrichir le runbook)

```bash
# Coller ici les commandes effectivement utilisées pendant l'incident
# Ces commandes peuvent enrichir ou corriger le runbook associé
```

---

## Notes additionnelles

> Observations libres, contexte supplémentaire, liens vers logs Grafana, screenshots, etc.

---

*Post-mortem rédigé le YYYY-MM-DD par toussaintgarinat.*
*Runbooks associés : voir `docs/runbooks/`.*
