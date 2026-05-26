-- Sprint 112: Sub-agent depth guard + call tracing

CREATE TABLE IF NOT EXISTS "agent_executions" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "parent_id"   uuid,
  "agent_id"    uuid,
  "agent_name"  text NOT NULL DEFAULT 'Forge',
  "session_id"  text NOT NULL,
  "user_id"     text NOT NULL,
  "depth"       integer NOT NULL DEFAULT 0,
  "input"       text NOT NULL,
  "output"      text DEFAULT '',
  "duration_ms" integer,
  "status"      text DEFAULT 'running',
  "created_at"  timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_agent_executions_session" ON "agent_executions"("session_id");
CREATE INDEX IF NOT EXISTS "idx_agent_executions_parent" ON "agent_executions"("parent_id");
