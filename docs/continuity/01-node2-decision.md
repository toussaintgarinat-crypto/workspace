# Node 2 — décision

**Statut** : 🟡 **à figer** (S86, repoussé volontairement par l'utilisateur le 2026-05-21).

## Options comparées

| Option | Coût mensuel | Géo-redondance | Hot standby app | Complexité réseau | Verdict |
|---|---|---|---|---|---|
| **Hetzner CX32** (4 vCPU / 8 Go RAM / 80 Go NVMe) | ~7 € | ✅ DC distant | ❌ data-only | Faible (IP publique) | 👍 recommandé pour démarrer |
| **2e mini-PC famille** + NetBird | 0 € | ✅ site distant | ⚠️ selon HW | Moyenne (NAT, NetBird) | Si HW + hôte trouvé |
| **Hetzner AX42** (8 cœurs dédiés / 64 Go) | ~40 € | ✅ DC distant | ✅ mirror complet | Faible | Si ambition prod |

## Critères de décision

1. **Budget mensuel acceptable**
   - 0 € si solution famille
   - 7 € pour démarrer sereinement (recommandé)
   - 40 € si projet bascule en "prod sérieux"

2. **HW disponible chez un proche** ? (poser la question avant de payer)

3. **Tolérance complexité réseau** : NetBird (déjà déployé via Forge) gère bien le mesh, mais multiplie les points de friction lors d'un debug réseau.

4. **Quorum etcd** (3e témoin requis pour Patroni S87) :
   - ✅ **Raspberry Pi maison** (choisi 2026-05-21) — sur LAN, faible coût électrique, joint à NetBird

## Décision (à compléter)

- [ ] Option retenue : `___________`
- [ ] Date provisioning : `___________`
- [ ] Nom NetBird node 2 : `___________`
- [ ] IP NetBird interne node 2 : `___________`
- [ ] Hostname public (si applicable) : `___________`

## Provisioning checklist (post-décision)

- [ ] OS minimal installé (Debian 12 — ou Proxmox si AX42)
- [ ] NetBird client joint au réseau existant (`netbird up --setup-key ...`)
- [ ] Docker + Docker Compose installés
- [ ] User `claude-deploy` créé avec SSH key
- [ ] GitHub Actions `SERVER_HOST_SECONDARY` ajouté (étend S40)
- [ ] Test : depuis HP G4, `ssh claude-deploy@<netbird-ip-node2>` OK
- [ ] Test : `docker pull` depuis GHCR OK
- [ ] Volume `/backup/data` monté ou bind mount NFS prêt
- [ ] Raspberry Pi witness joint à NetBird (étape S87)
