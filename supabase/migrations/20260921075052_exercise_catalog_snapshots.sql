-- Additive release: keep existing homework and submission snapshots unchanged.
ALTER TABLE public.exercise_catalog
  ADD COLUMN reviewed_by TEXT,
  ADD COLUMN reviewed_at TIMESTAMPTZ;
ALTER TABLE public.homework_items
  ADD COLUMN exercise_snapshot JSONB CHECK (exercise_snapshot IS NULL OR jsonb_typeof(exercise_snapshot) = 'object');

-- Published versions may be archived; content edits require a new row/version.
CREATE FUNCTION public.guard_exercise_catalog_version()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IN ('published', 'archived')
     AND (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at') THEN
    RAISE EXCEPTION 'Create a new exercise content version instead of editing a published version';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('published', 'archived') AND NEW.status = 'draft' THEN
    RAISE EXCEPTION 'Published exercise versions cannot become drafts';
  END IF;
  IF NEW.status = 'published' AND (
    NULLIF(btrim(NEW.source_note), '') IS NULL OR NULLIF(btrim(NEW.reviewed_by), '') IS NULL
    OR NEW.reviewed_at IS NULL OR NEW.reviewed_at > now()
    OR (NEW.media_url IS NOT NULL AND (NEW.media_url !~ '^https://' OR NULLIF(btrim(NEW.media_alt), '') IS NULL))
  ) THEN
    RAISE EXCEPTION 'Exercise publication requires source, reviewer, review date and media description';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_exercise_catalog_version() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER exercise_catalog_version_guard BEFORE INSERT OR UPDATE ON public.exercise_catalog
FOR EACH ROW EXECUTE FUNCTION public.guard_exercise_catalog_version();

-- Called only by create_homework. Never trust client-supplied DB content.
CREATE FUNCTION public.capture_exercise_snapshot(p_snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_record public.exercise_catalog%ROWTYPE;
BEGIN
  IF p_snapshot IS NULL OR p_snapshot = 'null'::jsonb THEN RETURN NULL; END IF;
  IF jsonb_typeof(p_snapshot) <> 'object' THEN RAISE EXCEPTION 'Invalid exercise snapshot'; END IF;
  IF p_snapshot->>'source' = 'database' THEN
    SELECT * INTO v_record FROM public.exercise_catalog
    WHERE id::text = p_snapshot->>'exercise_id'
      AND content_version::text = p_snapshot->>'content_version' AND status = 'published'
      AND reviewed_at IS NOT NULL AND NULLIF(btrim(reviewed_by), '') IS NOT NULL
      AND NULLIF(btrim(source_note), '') IS NOT NULL
    FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Exercise version is no longer available'; END IF;
    RETURN jsonb_build_object('exercise_id', v_record.id, 'content_version', v_record.content_version,
      'source', 'database', 'name', v_record.name, 'default_cue', v_record.default_cue,
      'media_url', v_record.media_url, 'media_alt', v_record.media_alt, 'source_note', v_record.source_note);
  ELSIF p_snapshot->>'source' = 'seed'
      AND p_snapshot->>'exercise_id' ~ '^seed-[1-9][0-9]*$'
      AND p_snapshot->>'content_version' = '1'
      AND char_length(p_snapshot::text) <= 4000 THEN
    -- Legacy seed content is an input snapshot, not certified DB content.
    RETURN jsonb_build_object('exercise_id', p_snapshot->>'exercise_id', 'content_version', 1,
      'source', 'seed', 'name', p_snapshot->>'name', 'default_cue', p_snapshot->>'default_cue',
      'media_url', NULL, 'media_alt', NULL, 'source_note', '기존 기본 운동 목록');
  END IF;
  RAISE EXCEPTION 'Invalid exercise snapshot source';
END;
$$;
REVOKE ALL ON FUNCTION public.capture_exercise_snapshot(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_homework(
  p_member_id uuid,
  p_why text,
  p_token text,
  p_token_expires_at timestamptz,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trainer_id uuid := auth.uid();
  v_homework public.homework%ROWTYPE;
  v_item_count integer;
BEGIN
  IF v_trainer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.members
    WHERE id = p_member_id AND trainer_id = v_trainer_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'member_not_found');
  END IF;
  IF NULLIF(BTRIM(p_why), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_why');
  END IF;
  IF p_token IS NULL OR p_token !~ '^[A-Za-z0-9_-]{21,}$' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_token');
  END IF;
  IF p_token_expires_at IS NULL OR p_token_expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_expiry');
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_items');
  END IF;

  v_item_count := jsonb_array_length(p_items);
  IF v_item_count NOT BETWEEN 1 AND 3
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(p_items) AS item
       WHERE jsonb_typeof(item) IS DISTINCT FROM 'object'
         OR NULLIF(BTRIM(item->>'name'), '') IS NULL
         OR NULLIF(BTRIM(item->>'target_reps'), '') IS NULL
         OR (item->>'order_index') !~ '^[1-3]$'
         OR (item->>'target_sets') !~ '^[1-9][0-9]?$'
         OR COALESCE(item->>'effort_kind', 'reps') NOT IN ('reps', 'hold')
     )
     OR (
       SELECT count(DISTINCT item->>'order_index')
       FROM jsonb_array_elements(p_items) AS item
     ) <> v_item_count THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_items');
  END IF;

  INSERT INTO public.homework (
    trainer_id, member_id, token, token_expires_at, why, status
  ) VALUES (
    v_trainer_id, p_member_id, p_token, p_token_expires_at, BTRIM(p_why), 'sent'
  )
  RETURNING * INTO v_homework;

  INSERT INTO public.homework_items (
    homework_id, order_index, name, cue, target_sets, target_reps,
    effort_kind, reps, hold_seconds, seconds_per_rep, rest_seconds, per_side, exercise_snapshot
  )
  SELECT
    v_homework.id,
    (item->>'order_index')::integer,
    BTRIM(item->>'name'),
    COALESCE(item->>'cue', ''),
    (item->>'target_sets')::integer,
    BTRIM(item->>'target_reps'),
    COALESCE(item->>'effort_kind', 'reps'),
    NULLIF(item->>'reps', '')::integer,
    NULLIF(item->>'hold_seconds', '')::integer,
    COALESCE(NULLIF(item->>'seconds_per_rep', '')::numeric, 3.0),
    COALESCE(NULLIF(item->>'rest_seconds', '')::integer, 20),
    COALESCE(NULLIF(item->>'per_side', '')::boolean, false),
    public.capture_exercise_snapshot(item->'exercise_snapshot')
  FROM jsonb_array_elements(p_items) AS item;

  RETURN jsonb_build_object('success', true, 'id', v_homework.id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_homework(uuid, text, text, timestamptz, jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_homework(uuid, text, text, timestamptz, jsonb)
TO authenticated;
