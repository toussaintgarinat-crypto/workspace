-- Index sur les colonnes les plus filtrées pour éviter les seq scans

-- sessions
CREATE INDEX IF NOT EXISTS idx_sessions_user     ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_org      ON sessions (org_id);
CREATE INDEX IF NOT EXISTS idx_sessions_pole     ON sessions (pole_id);
CREATE INDEX IF NOT EXISTS idx_sessions_venture  ON sessions (venture_id);

-- messages
CREATE INDEX IF NOT EXISTS idx_messages_session  ON messages (session_id);

-- poles
CREATE INDEX IF NOT EXISTS idx_poles_venture     ON poles (venture_id);
CREATE INDEX IF NOT EXISTS idx_poles_org         ON poles (org_id);

-- incidents
CREATE INDEX IF NOT EXISTS idx_incidents_pole    ON incidents (pole_id);
CREATE INDEX IF NOT EXISTS idx_incidents_user    ON incidents (user_id);

-- crm_leads
CREATE INDEX IF NOT EXISTS idx_crm_leads_pole ON crm_leads (pole_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_user ON crm_leads (user_id);

-- sprints
CREATE INDEX IF NOT EXISTS idx_sprints_pole      ON sprints (pole_id);

-- tasks
CREATE INDEX IF NOT EXISTS idx_tasks_pole        ON tasks (pole_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user        ON tasks (user_id);

-- contrats
CREATE INDEX IF NOT EXISTS idx_contrats_pole     ON contrats (pole_id);
CREATE INDEX IF NOT EXISTS idx_contrats_user     ON contrats (user_id);

-- documents
CREATE INDEX IF NOT EXISTS idx_documents_pole    ON documents (pole_id);
CREATE INDEX IF NOT EXISTS idx_documents_user    ON documents (user_id);

-- kb_articles
CREATE INDEX IF NOT EXISTS idx_kb_articles_user  ON kb_articles (user_id);

-- veille_articles
CREATE INDEX IF NOT EXISTS idx_veille_articles_user   ON veille_articles (user_id);
CREATE INDEX IF NOT EXISTS idx_veille_articles_source ON veille_articles (source_id);

-- veille_sources
CREATE INDEX IF NOT EXISTS idx_veille_sources_user    ON veille_sources (user_id);

-- webhooks
CREATE INDEX IF NOT EXISTS idx_webhooks_user     ON webhooks (user_id);

-- blackboard_events
CREATE INDEX IF NOT EXISTS idx_blackboard_pole   ON blackboard_events (pole_id);
CREATE INDEX IF NOT EXISTS idx_blackboard_created ON blackboard_events (created_at DESC);

-- decisions_n0
CREATE INDEX IF NOT EXISTS idx_decisions_pole    ON decisions_n0 (pole_id);
CREATE INDEX IF NOT EXISTS idx_decisions_statut  ON decisions_n0 (statut);
