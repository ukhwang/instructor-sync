-- Exercise catalog foundation. Unreviewed rows remain draft and are not searchable.
CREATE TABLE IF NOT EXISTS public.exercise_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  aliases TEXT[] NOT NULL DEFAULT '{}',
  category TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  equipment TEXT[] NOT NULL DEFAULT '{}',
  default_cue TEXT NOT NULL DEFAULT '',
  default_effort_kind TEXT CHECK (default_effort_kind IS NULL OR default_effort_kind IN ('reps', 'hold')),
  default_rep_count INTEGER CHECK (default_rep_count IS NULL OR default_rep_count >= 0),
  default_hold_seconds INTEGER CHECK (default_hold_seconds IS NULL OR default_hold_seconds >= 0),
  media_url TEXT,
  media_alt TEXT,
  source_note TEXT,
  content_version INTEGER NOT NULL DEFAULT 1 CHECK (content_version >= 1),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (name, content_version)
);

CREATE INDEX IF NOT EXISTS idx_exercise_catalog_status_name ON public.exercise_catalog(status, name);
CREATE INDEX IF NOT EXISTS idx_exercise_catalog_tags ON public.exercise_catalog USING GIN(tags);
ALTER TABLE public.exercise_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.exercise_catalog FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.exercise_catalog TO authenticated;
DROP POLICY IF EXISTS "Authenticated trainers can view published exercises" ON public.exercise_catalog;
CREATE POLICY "Authenticated trainers can view published exercises"
  ON public.exercise_catalog FOR SELECT TO authenticated
  USING (status = 'published');
