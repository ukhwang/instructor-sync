-- Member registration idempotency + imported history records.
-- Source mapping: 20260920115204_member_onboarding_imports.sql.

CREATE TABLE member_import_records (
  id TEXT PRIMARY KEY NOT NULL,
  trainer_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'existing_note'
    CHECK (source_type IN ('direct_entry', 'existing_note', 'conversation', 'other')),
  raw_text TEXT NOT NULL CHECK (length(trim(raw_text)) BETWEEN 1 AND 20000),
  summary TEXT CHECK (summary IS NULL OR length(summary) <= 2000),
  recorded_from TEXT,
  recorded_to TEXT,
  imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (recorded_from IS NULL OR recorded_to IS NULL OR recorded_from <= recorded_to),
  UNIQUE (trainer_id, request_id),
  FOREIGN KEY (member_id, trainer_id) REFERENCES members(id, trainer_id) ON DELETE CASCADE
);
CREATE INDEX member_import_records_member_idx ON member_import_records(member_id, imported_at DESC);

CREATE TABLE member_onboarding_requests (
  trainer_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  request_payload TEXT NOT NULL CHECK (json_valid(request_payload)),
  member_id TEXT REFERENCES members(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (trainer_id, request_id)
);
CREATE INDEX member_onboarding_requests_member_idx ON member_onboarding_requests(member_id);
