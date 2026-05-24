"""Utilitaires partagés du projet Agent Personnel de Création.

Modules :
- redis_client    : wrapper async paramétrable + namespace + lock + publish
- keycloak_auth   : verify_token (JWKS cache TTL) + dependency require_role
- fastapi_setup   : setup_cors (CSV) + setup_logging (JSON optionnel)
- health          : HealthBuilder — schéma JSON `/health` commun (S101)
- http_client     : S2SClient — wrapper httpx async retry + circuit breaker (S99)
"""

__version__ = "0.3.0"
