"""Pydantic request bodies shared across routers.

Schemas only — no business logic, no DB calls. Grouped by domain to keep imports
short in router modules.
"""

from pydantic import BaseModel


# ── Connections (legacy global table) ─────────────────────────────────────────

class ConnectionBody(BaseModel):
    id: str
    name: str
    url: str
    token: str
    app_type: str
    enabled: bool = True


# ── Vault / OAuth ─────────────────────────────────────────────────────────────

class VaultTokenBody(BaseModel):
    access_token: str
    refresh_token: str | None = None
    expires_at: str | None = None
    url: str | None = None


class VaultStoreBody(BaseModel):
    access_token: str
    refresh_token: str | None = None
    expires_at: str | None = None


class OAuthCallbackBody(BaseModel):
    code: str
    code_verifier: str
    redirect_uri: str
    keycloak_url: str
    realm: str
    client_id: str


# ── Gateway management ────────────────────────────────────────────────────────

class GatewayModelBody(BaseModel):
    model_name: str
    litellm_params: dict


class GatewayKeyBody(BaseModel):
    key_alias: str
    max_budget: float = 10
    budget_duration: str = "1mo"
    models: list[str] | str = "auto"


# ── MemPalace ────────────────────────────────────────────────────────────────

class MempalaceSearchBody(BaseModel):
    query: str
    wing: str | None = None
    n_results: int = 10


class MempalaceDrawerBody(BaseModel):
    content: str
    wing: str = "Input"
    room: str = "conversations"
    metadata: dict | None = None


class MempalaceImportBody(BaseModel):
    entries: list[dict]


# ── Conversations (S59) ───────────────────────────────────────────────────────

class ConversationSyncBody(BaseModel):
    id: str
    title: str
    messages: list[dict]
    created_at: str = ""


class ConversationSearchBody(BaseModel):
    query: str
    limit: int = 20


# ── Swarm ────────────────────────────────────────────────────────────────────

class SwarmTaskBody(BaseModel):
    title: str
    role: str
    instructions: str
    id: str | None = None


# ── Voice ────────────────────────────────────────────────────────────────────

class VoiceSettingsBody(BaseModel):
    stt_provider: str = "webspeech"
    tts_provider: str = "webspeech"
    stt_api_key: str | None = None
    tts_api_key: str | None = None
    language: str = "fr-FR"
    tts_voice: str = "alloy"


class SynthesizeBody(BaseModel):
    text: str
    voice: str | None = None


# ── Documents ────────────────────────────────────────────────────────────────

class ConfirmUploadBody(BaseModel):
    file_id: str | None = None
    filename: str
    wing: str
    room: str
    summary: str


# ── Proactive ────────────────────────────────────────────────────────────────

class ProactiveConfigBody(BaseModel):
    enabled: bool
    interval_minutes: int = 30
    reminder_hours: int = 0
    events_config: dict = {}
    channels_config: dict = {}


# ── WebPush ──────────────────────────────────────────────────────────────────

class PushSubscribeBody(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


class PushUnsubscribeBody(BaseModel):
    endpoint: str


# ── Summarizer ───────────────────────────────────────────────────────────────

class SummarizeBody(BaseModel):
    messages: list[dict]
    session_id: str = ""


# ── Admin ────────────────────────────────────────────────────────────────────

class UpdateBody(BaseModel):
    target_tag: str = "latest"


class DegradedToggleBody(BaseModel):
    component: str
    degraded: bool
    ttl: int | None = None


class AlertmanagerWebhookBody(BaseModel):
    alerts: list
    status: str = "firing"


# ── Chat ─────────────────────────────────────────────────────────────────────

class ChatBody(BaseModel):
    messages: list[dict]
    use_prompt_engineer: bool = False
    rag_enabled: bool = True
    model: str | None = None


# ── Persona (S66) ────────────────────────────────────────────────────────────

class PersonaBody(BaseModel):
    display_name: str | None = None
    role: str | None = None
    expertise_domains: list[str] | None = None
    tone: str | None = None
    language: str | None = None
    custom_instructions: str | None = None
    assistant_personality: str | None = None


# ── Scheduled prompts (S69) ──────────────────────────────────────────────────

class ScheduledBody(BaseModel):
    title: str
    prompt: str
    schedule: str


class ScheduledUpdateBody(BaseModel):
    title: str | None = None
    prompt: str | None = None
    schedule: str | None = None
    active: bool | None = None
