-- Reviewed exercise catalog (published versions are immutable).
-- Source mapping: 20260921010000_exercise_catalog.sql, 20260921075052_exercise_catalog_snapshots.sql.
-- TEXT[] columns become JSON arrays. The 1,334-item master DB is NOT stored here;
-- it ships as code + a static JSON asset (see docs/CLOUDFLARE_MIGRATION.md).

CREATE TABLE exercise_catalog (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  aliases TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(aliases) AND json_type(aliases) = 'array'),
  category TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags) AND json_type(tags) = 'array'),
  equipment TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(equipment) AND json_type(equipment) = 'array'),
  default_cue TEXT NOT NULL DEFAULT '',
  default_effort_kind TEXT CHECK (default_effort_kind IS NULL OR default_effort_kind IN ('reps', 'hold')),
  default_rep_count INTEGER CHECK (default_rep_count IS NULL OR default_rep_count >= 0),
  default_hold_seconds INTEGER CHECK (default_hold_seconds IS NULL OR default_hold_seconds >= 0),
  media_url TEXT,
  media_alt TEXT,
  source_note TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  content_version INTEGER NOT NULL DEFAULT 1 CHECK (content_version >= 1),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (name, content_version)
);
CREATE INDEX exercise_catalog_status_name_idx ON exercise_catalog(status, name);

CREATE TRIGGER exercise_catalog_publish_requirements_insert
BEFORE INSERT ON exercise_catalog
WHEN NEW.status = 'published' AND (
  trim(COALESCE(NEW.source_note, '')) = '' OR trim(COALESCE(NEW.reviewed_by, '')) = ''
  OR NEW.reviewed_at IS NULL OR NEW.reviewed_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  OR (NEW.media_url IS NOT NULL AND (NEW.media_url NOT LIKE 'https://%' OR trim(COALESCE(NEW.media_alt, '')) = ''))
)
BEGIN
  SELECT RAISE(ABORT, 'exercise_publication_requirements');
END;

CREATE TRIGGER exercise_catalog_publish_requirements_update
BEFORE UPDATE ON exercise_catalog
WHEN NEW.status = 'published' AND (
  trim(COALESCE(NEW.source_note, '')) = '' OR trim(COALESCE(NEW.reviewed_by, '')) = ''
  OR NEW.reviewed_at IS NULL OR NEW.reviewed_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  OR (NEW.media_url IS NOT NULL AND (NEW.media_url NOT LIKE 'https://%' OR trim(COALESCE(NEW.media_alt, '')) = ''))
)
BEGIN
  SELECT RAISE(ABORT, 'exercise_publication_requirements');
END;

-- Published/archived versions: only status (and updated_at) may change, and never back to draft.
CREATE TRIGGER exercise_catalog_version_guard
BEFORE UPDATE ON exercise_catalog
WHEN OLD.status IN ('published', 'archived') AND (
  NEW.status = 'draft'
  OR NEW.id IS NOT OLD.id OR NEW.name IS NOT OLD.name OR NEW.aliases IS NOT OLD.aliases
  OR NEW.category IS NOT OLD.category OR NEW.tags IS NOT OLD.tags OR NEW.equipment IS NOT OLD.equipment
  OR NEW.default_cue IS NOT OLD.default_cue OR NEW.default_effort_kind IS NOT OLD.default_effort_kind
  OR NEW.default_rep_count IS NOT OLD.default_rep_count OR NEW.default_hold_seconds IS NOT OLD.default_hold_seconds
  OR NEW.media_url IS NOT OLD.media_url OR NEW.media_alt IS NOT OLD.media_alt
  OR NEW.source_note IS NOT OLD.source_note OR NEW.reviewed_by IS NOT OLD.reviewed_by
  OR NEW.reviewed_at IS NOT OLD.reviewed_at OR NEW.content_version IS NOT OLD.content_version
  OR NEW.created_at IS NOT OLD.created_at
)
BEGIN
  SELECT RAISE(ABORT, 'exercise_version_immutable');
END;
