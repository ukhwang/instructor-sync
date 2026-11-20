-- Member progress goals / observations / opinions with idempotent requests.
-- Source mapping: 20260921000000_member_progress_measurements.sql,
-- 20260921074826_member_progress_correctness.sql.

CREATE TABLE member_progress_requests (
  trainer_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  request_payload TEXT NOT NULL CHECK (json_valid(request_payload)),
  response TEXT CHECK (response IS NULL OR json_valid(response)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (trainer_id, request_id)
);

CREATE TABLE member_progress_goals (
  id TEXT PRIMARY KEY NOT NULL,
  trainer_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  series_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  condition TEXT NOT NULL CHECK (length(trim(condition)) BETWEEN 1 AND 500),
  metric TEXT NOT NULL CHECK (metric IN ('duration', 'reps', 'distance', 'difficulty')),
  direction TEXT NOT NULL CHECK (direction IN ('increase', 'decrease', 'none')),
  unit TEXT NOT NULL CHECK (
    (metric = 'duration' AND unit = 'seconds') OR
    (metric = 'reps' AND unit = 'count') OR
    (metric = 'distance' AND unit = 'meters') OR
    (metric = 'difficulty' AND unit = 'score_0_10')
  ),
  target_value REAL NOT NULL CHECK (target_value >= 0),
  definition_version INTEGER NOT NULL CHECK (definition_version >= 1),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  reassessment_due_on TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (series_id, definition_version),
  UNIQUE (id, trainer_id),
  CHECK (metric <> 'difficulty' OR (target_value BETWEEN 0 AND 10 AND target_value = CAST(target_value AS INTEGER))),
  FOREIGN KEY (member_id, trainer_id) REFERENCES members(id, trainer_id) ON DELETE CASCADE
);
CREATE INDEX member_progress_goals_member_idx ON member_progress_goals(member_id, is_active, created_at DESC);

-- At most 3 active goals per member (was checked inside the RPC).
CREATE TRIGGER member_progress_goals_active_limit
BEFORE INSERT ON member_progress_goals
WHEN NEW.is_active = 1
 AND (SELECT count(*) FROM member_progress_goals WHERE member_id = NEW.member_id AND is_active = 1) >= 3
BEGIN
  SELECT RAISE(ABORT, 'active_goal_limit');
END;

CREATE TABLE member_progress_observations (
  id TEXT PRIMARY KEY NOT NULL,
  trainer_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  goal_id TEXT NOT NULL,
  definition_version INTEGER NOT NULL CHECK (definition_version >= 1),
  metric TEXT NOT NULL CHECK (metric IN ('duration', 'reps', 'distance', 'difficulty')),
  unit TEXT NOT NULL CHECK (
    (metric = 'duration' AND unit = 'seconds') OR
    (metric = 'reps' AND unit = 'count') OR
    (metric = 'distance' AND unit = 'meters') OR
    (metric = 'difficulty' AND unit = 'score_0_10')
  ),
  measured_on TEXT NOT NULL,
  value REAL CHECK (value IS NULL OR value >= 0),
  unmeasured_reason TEXT CHECK (
    (value IS NOT NULL AND unmeasured_reason IS NULL) OR
    (value IS NULL AND unmeasured_reason IS NOT NULL AND length(trim(unmeasured_reason)) BETWEEN 1 AND 200)
  ),
  source TEXT NOT NULL CHECK (source IN ('member_report', 'trainer_measurement')),
  actor TEXT NOT NULL CHECK (actor IN ('member', 'trainer')),
  memo TEXT CHECK (memo IS NULL OR length(memo) <= 1000),
  supersedes_observation_id TEXT UNIQUE REFERENCES member_progress_observations(id),
  correction_reason TEXT CHECK (correction_reason IS NULL OR length(trim(correction_reason)) BETWEEN 1 AND 500),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (metric <> 'difficulty' OR value IS NULL OR (value BETWEEN 0 AND 10 AND value = CAST(value AS INTEGER))),
  CHECK (
    (supersedes_observation_id IS NULL AND correction_reason IS NULL) OR
    (supersedes_observation_id IS NOT NULL AND correction_reason IS NOT NULL)
  ),
  FOREIGN KEY (goal_id, trainer_id) REFERENCES member_progress_goals(id, trainer_id) ON DELETE CASCADE,
  FOREIGN KEY (member_id, trainer_id) REFERENCES members(id, trainer_id) ON DELETE CASCADE
);
CREATE INDEX member_progress_observations_goal_idx ON member_progress_observations(goal_id, measured_on, created_at);
CREATE INDEX member_progress_observations_member_idx ON member_progress_observations(member_id, measured_on DESC);

CREATE TABLE member_progress_opinions (
  id TEXT PRIMARY KEY NOT NULL,
  trainer_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  observation_id TEXT NOT NULL UNIQUE REFERENCES member_progress_observations(id) ON DELETE CASCADE,
  opinion TEXT NOT NULL CHECK (opinion IN ('better', 'same', 'worse', 'unknown')),
  actor TEXT NOT NULL CHECK (actor IN ('member', 'trainer')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (member_id, trainer_id) REFERENCES members(id, trainer_id) ON DELETE CASCADE
);
CREATE INDEX member_progress_opinions_member_idx ON member_progress_opinions(member_id, created_at DESC);
