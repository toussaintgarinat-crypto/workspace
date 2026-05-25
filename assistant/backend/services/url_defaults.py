"""Default backend URLs for connected apps (used by vault-based auth flow)."""


def default_url(app_type: str) -> str:
    defaults = {
        "forge":     "http://localhost:8000",
        "oria":      "http://localhost:8000",
        "mempalace": "http://localhost:8100",
        "calendar":  "http://localhost:8400",
    }
    return defaults.get(app_type, "http://localhost:8000")
