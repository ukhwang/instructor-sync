-- 10-session milestone report share links.
-- Source mapping: 20261114010000_milestone_reports.sql.
-- Audit NV-3: only the sha256 of the 24-hex report token is stored. The raw
-- token is shown to the trainer once when the link is created.

CREATE TABLE milestone_reports (
  id TEXT PRIMARY KEY NOT NULL,
  trainer_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  session_number INTEGER NOT NULL CHECK (session_number BETWEEN 1 AND 999),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  CHECK (expires_at > created_at),
  FOREIGN KEY (member_id, trainer_id) REFERENCES members(id, trainer_id) ON DELETE CASCADE
);
CREATE INDEX milestone_reports_member_idx ON milestone_reports(member_id, created_at DESC);
