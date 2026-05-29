"""Leader election partagée pour les boucles planificatrices (S123).

Auparavant `proactive.py` portait sa propre logique d'élection de leader
(Redis ``SET NX`` + renouvellement Lua). On la factorise ici pour que
``scheduled.py`` (prompts planifiés) la réutilise et ne se déclenche que sur
un seul réplica, sinon chaque prompt partirait N fois au ``make
scale-assistant N>=2``.

Choix : **une seule clé partagée** (``assistant:scheduler:leader``) pour
toutes les boucles du process. Un seul réplica devient leader et porte alors
tous les schedulers — plus simple et cohérent qu'un leader par boucle.

Sans Redis (mono-instance), ``is_leader`` renvoie toujours ``True``.
"""

import logging
import uuid as _uuid

logger = logging.getLogger(__name__)

# Identifiant unique de ce process — partagé par toutes les boucles.
REPLICA_ID = str(_uuid.uuid4())[:8]

# Clé Redis unique pour l'élection (cf. namespacing S101 : déjà préfixée).
DEFAULT_KEY = "assistant:scheduler:leader"
LEADER_TTL = 90  # secondes

# Renouvelle le bail uniquement si on en est toujours le détenteur.
_RENEW_SCRIPT = """
if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('expire', KEYS[1], ARGV[2])
else
    return 0
end
"""


async def is_leader(key: str = DEFAULT_KEY, ttl: int = LEADER_TTL) -> bool:
    """Renvoie True si ce réplica détient (ou vient d'acquérir) le bail.

    Sans Redis : toujours True (mono-instance).
    Avec Redis : ``SET NX`` élit exactement un leader ; le détenteur
    renouvelle son bail via le script Lua à chaque appel.
    """
    from redis_client import redis_client
    if not redis_client:
        return True
    acquired = await redis_client.set(key, REPLICA_ID, nx=True, ex=ttl)
    if acquired:
        return True
    renewed = await redis_client.eval(_RENEW_SCRIPT, 1, key, REPLICA_ID, str(ttl))
    return bool(renewed)


async def release_leader(key: str = DEFAULT_KEY):
    """Libère le bail si on en est le détenteur (best-effort au shutdown)."""
    from redis_client import redis_client
    if not redis_client:
        return
    current = await redis_client.get(key)
    if current == REPLICA_ID:
        await redis_client.delete(key)
