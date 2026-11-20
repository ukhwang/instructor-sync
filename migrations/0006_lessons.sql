-- Weekly lesson scheduler.
-- Source mapping: 20261114000000_lessons_scheduler.sql.
-- The Postgres EXCLUDE USING gist (no overlapping non-cancelled lessons per
-- trainer) becomes BEFORE INSERT/UPDATE triggers. Timestamps are fixed-width
-- ISO-8601 UTC strings (CHECKed below), so string comparison is chronological.

CREATE TABLE lessons (
  id TEXT PRIMARY KEY NOT NULL,
  trainer_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  series_id TEXT NOT NULL,
  starts_at TEXT NOT NULL CHECK (starts_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
  ends_at TEXT NOT NULL CHECK (ends_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'no_show', 'cancelled')),
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (round((julianday(ends_at) - julianday(starts_at)) * 1440) BETWEEN 10 AND 180),
  CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
  UNIQUE (trainer_id, series_id, starts_at),
  FOREIGN KEY (member_id, trainer_id) REFERENCES members(id, trainer_id) ON DELETE CASCADE
);
CREATE INDEX lessons_trainer_time_idx ON lessons(trainer_id, starts_at);
CREATE INDEX lessons_member_time_idx ON lessons(member_id, starts_at DESC);

-- Rows for the same (trainer, series, starts_at) slot are excluded so that an
-- idempotent replay (INSERT ... ON CONFLICT DO NOTHING) is not reported as a conflict.
CREATE TRIGGER lessons_no_overlap_insert
BEFORE INSERT ON lessons
WHEN NEW.status <> 'cancelled' AND EXISTS (
  SELECT 1 FROM lessons l
  WHERE l.trainer_id = NEW.trainer_id
    AND l.status <> 'cancelled'
    AND NOT (l.series_id = NEW.series_id AND l.starts_at = NEW.starts_at)
    AND l.starts_at < NEW.ends_at
    AND l.ends_at > NEW.starts_at
)
BEGIN
  SELECT RAISE(ABORT, 'lesson_time_conflict');
END;

CREATE TRIGGER lessons_no_overlap_update
BEFORE UPDATE OF starts_at, ends_at, status ON lessons
WHEN NEW.status <> 'cancelled' AND EXISTS (
  SELECT 1 FROM lessons l
  WHERE l.trainer_id = NEW.trainer_id
    AND l.id <> NEW.id
    AND l.status <> 'cancelled'
    AND l.starts_at < NEW.ends_at
    AND l.ends_at > NEW.starts_at
)
BEGIN
  SELECT RAISE(ABORT, 'lesson_time_conflict');
END;

CREATE TRIGGER lessons_owner_immutable
BEFORE UPDATE OF trainer_id, member_id, series_id ON lessons
WHEN NEW.trainer_id IS NOT OLD.trainer_id OR NEW.member_id IS NOT OLD.member_id OR NEW.series_id IS NOT OLD.series_id
BEGIN
  SELECT RAISE(ABORT, 'lesson_owner_immutable');
END;

-- Package counter follows the lesson status transition exactly once.
-- (Postgres did this inside complete_lesson / revert_lesson_completion with row
-- locks; in D1 the transition UPDATE is a single statement and these triggers run
-- inside it, so a concurrent duplicate request changes 0 rows and 0 counters.)
CREATE TRIGGER lessons_complete_consumes_package
AFTER UPDATE OF status ON lessons
WHEN OLD.status = 'scheduled' AND NEW.status = 'completed'
BEGIN
  UPDATE members
     SET package_remaining = max(package_remaining - 1, 0),
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
   WHERE id = NEW.member_id AND trainer_id = NEW.trainer_id;
END;

CREATE TRIGGER lessons_revert_restores_package
AFTER UPDATE OF status ON lessons
WHEN OLD.status = 'completed' AND NEW.status = 'scheduled'
BEGIN
  UPDATE members
     SET package_remaining = min(package_remaining + 1, package_total),
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
   WHERE id = NEW.member_id AND trainer_id = NEW.trainer_id;
END;

-- Homework ↔ lesson link (same trainer and member enforced by trigger).
ALTER TABLE homework ADD COLUMN lesson_id TEXT REFERENCES lessons(id) ON DELETE SET NULL;
CREATE INDEX homework_lesson_idx ON homework(lesson_id) WHERE lesson_id IS NOT NULL;

CREATE TRIGGER homework_lesson_same_owner
BEFORE UPDATE OF lesson_id ON homework
WHEN NEW.lesson_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM lessons l
  WHERE l.id = NEW.lesson_id AND l.trainer_id = NEW.trainer_id AND l.member_id = NEW.member_id
)
BEGIN
  SELECT RAISE(ABORT, 'lesson_not_found');
END;
