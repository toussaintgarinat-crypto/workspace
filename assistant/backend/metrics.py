from prometheus_client import Counter, Gauge

# Active SSE connections per stream type
sse_clients_active = Gauge(
    "assistant_sse_clients_active",
    "Nombre de connexions SSE actives",
    ["stream"],  # "alerts" | "swarm"
)

# Swarm tasks by status
swarm_tasks_active = Gauge(
    "assistant_swarm_tasks_active",
    "Nombre de tâches swarm par statut",
    ["status"],  # "pending" | "running" | "done"
)

# Proactive alerts dispatched
proactive_alerts_total = Counter(
    "assistant_proactive_alerts_total",
    "Nombre total d'alertes proactives créées",
)

# Chat requests
chat_requests_total = Counter(
    "assistant_chat_requests_total",
    "Nombre total de requêtes chat",
)

# RAG injections
rag_injections_total = Counter(
    "assistant_rag_injections_total",
    "Nombre total de souvenirs MemPalace injectés via RAG",
)

# Degraded components gauge (S90)
degraded_component_active = Gauge(
    "degraded_component_active",
    "Composant en mode dégradé (1=dégradé, 0=normal)",
    ["service", "component"],
)
