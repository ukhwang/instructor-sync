-- Immutable member submissions, per-item results and idempotency keys.
--
-- Source mapping: 20260417000000_atomic_homework_submission.sql,
-- 20260919000000_discomfort_level_feedback.sql, 20260919010000_immutable_homework_submission.sql,
-- 20260921171403_homework_assignment_v2.sql (homework_assignment_requests),
-- 20260921173014_homework_submission_v2.sql, 20260922100000_homework_public_item_requirements.sql.
--
-- Atomicity: D1 has no interactive transactions. A submission is written by ONE
-- db.batch() (implicit transaction): submission + item results + logs + homework
-- status + idempotency row. UNIQUE(homework_id) on homework_submissions makes a
-- concurrent second submission fail the whole batch, which is then reported as
-- a replay or already_submitted (see lib/server/db/repositories/public-homework.ts).

CREATE TABLE homework_submissions (
  id TEXT PRIMARY KEY NOT NULL,
  homework_id TEXT NOT NULL UNIQUE REFERENCES homework(id) ON DELETE CASCADE,
  snapshot TEXT NOT NULL CHECK (json_valid(snapshot) AND json_type(snapshot) = 'object'),
  snapshot_hash TEXT NOT NULL CHECK (length(snapshot_hash) = 64 AND snapshot_hash NOT GLOB '*[^0-9a-f]*'),
  submitted_at TEXT NOT NULL,
  UNIQUE (id, homework_id)
);

-- Submissions are append-only.
CREATE TRIGGER homework_submissions_immutable
BEFORE UPDATE ON homework_submissions
BEGIN
  SELECT RAISE(ABORT, 'submission_immutable');
END;

CREATE TABLE homework_item_results (
  submission_id TEXT NOT NULL,
  homework_id TEXT NOT NULL,
  homework_item_id TEXT NOT NULL,
  requirement TEXT NOT NULL CHECK (requirement IN ('required', 'optional')),
  completed INTEGER NOT NULL CHECK (completed IN (0, 1)),
  PRIMARY KEY (submission_id, homework_item_id),
  FOREIGN KEY (submission_id, homework_id) REFERENCES homework_submissions(id, homework_id) ON DELETE CASCADE,
  FOREIGN KEY (homework_item_id, homework_id) REFERENCES homework_items(id, homework_id) ON DELETE CASCADE
);
CREATE INDEX homework_item_results_homework_idx ON homework_item_results(homework_id);
CREATE INDEX homework_item_results_item_idx ON homework_item_results(homework_item_id, homework_id);

CREATE TABLE homework_submission_requests (
  homework_id TEXT NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  request_payload TEXT NOT NULL CHECK (json_valid(request_payload)),
  response TEXT NOT NULL CHECK (json_valid(response)),
  PRIMARY KEY (homework_id, request_id)
);

CREATE TABLE homework_assignment_requests (
  trainer_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  request_payload TEXT NOT NULL CHECK (json_valid(request_payload)),
  homework_id TEXT REFERENCES homework(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (trainer_id, request_id)
);
CREATE INDEX homework_assignment_requests_homework_idx ON homework_assignment_requests(homework_id);
