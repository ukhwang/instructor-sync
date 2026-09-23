-- Keep every trainer-owned graph inside the same trainer boundary and make
-- homework plus its 1-3 items one all-or-nothing authenticated operation.

DROP POLICY IF EXISTS "Trainers can update own profile" ON public.profiles;
CREATE POLICY "Trainers can update own profile" ON public.profiles
FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = id)
WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Trainers can update own members" ON public.members;
CREATE POLICY "Trainers can update own members" ON public.members
FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = trainer_id)
WITH CHECK ((SELECT auth.uid()) = trainer_id);

DROP POLICY IF EXISTS "Trainers can insert own homework" ON public.homework;
CREATE POLICY "Trainers can insert own homework" ON public.homework
FOR INSERT TO authenticated
WITH CHECK (
  trainer_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.members
    WHERE public.members.id = public.homework.member_id
      AND public.members.trainer_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Trainers can update own homework" ON public.homework;
CREATE POLICY "Trainers can update own homework" ON public.homework
FOR UPDATE TO authenticated
USING (trainer_id = (SELECT auth.uid()))
WITH CHECK (
  trainer_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.members
    WHERE public.members.id = public.homework.member_id
      AND public.members.trainer_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Trainers can update own homework items" ON public.homework_items;
CREATE POLICY "Trainers can update own homework items" ON public.homework_items
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.homework
    WHERE public.homework.id = public.homework_items.homework_id
      AND public.homework.trainer_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.homework
    WHERE public.homework.id = public.homework_items.homework_id
      AND public.homework.trainer_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Trainers can insert own session notes" ON public.session_notes;
CREATE POLICY "Trainers can insert own session notes" ON public.session_notes
FOR INSERT TO authenticated
WITH CHECK (
  trainer_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.members
    WHERE public.members.id = public.session_notes.member_id
      AND public.members.trainer_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Trainers can update own session notes" ON public.session_notes;
CREATE POLICY "Trainers can update own session notes" ON public.session_notes
FOR UPDATE TO authenticated
USING (trainer_id = (SELECT auth.uid()))
WITH CHECK (
  trainer_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.members
    WHERE public.members.id = public.session_notes.member_id
      AND public.members.trainer_id = (SELECT auth.uid())
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS homework_items_homework_order_key
ON public.homework_items (homework_id, order_index);

-- The anonymous token reader already fully qualifies application objects, so
-- remove the mutable public schema from its SECURITY DEFINER search path.
ALTER FUNCTION public.open_homework(text) SET search_path = '';

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
    effort_kind, reps, hold_seconds, seconds_per_rep, rest_seconds, per_side
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
    COALESCE(NULLIF(item->>'per_side', '')::boolean, false)
  FROM jsonb_array_elements(p_items) AS item;

  RETURN jsonb_build_object('success', true, 'id', v_homework.id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_homework(uuid, text, text, timestamptz, jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_homework(uuid, text, text, timestamptz, jsonb)
TO authenticated;
