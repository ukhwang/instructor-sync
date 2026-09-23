-- Member progress G3: additive, trainer-owned goals and observations.
-- Existing homework feedback tables and public token RPCs are intentionally unchanged.

CREATE TABLE IF NOT EXISTS public.member_progress_requests (
  trainer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  request_payload JSONB NOT NULL,
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (trainer_id, request_id)
);

CREATE TABLE IF NOT EXISTS public.member_progress_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  series_id UUID NOT NULL DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  condition TEXT NOT NULL CHECK (char_length(btrim(condition)) BETWEEN 1 AND 500),
  metric TEXT NOT NULL CHECK (metric IN ('duration', 'reps', 'distance', 'difficulty')),
  direction TEXT NOT NULL CHECK (direction IN ('increase', 'decrease', 'none')),
  unit TEXT NOT NULL CHECK (
    (metric = 'duration' AND unit = 'seconds') OR
    (metric = 'reps' AND unit = 'count') OR
    (metric = 'distance' AND unit = 'meters') OR
    (metric = 'difficulty' AND unit = 'score_0_10')
  ),
  target_value NUMERIC NOT NULL CHECK (target_value >= 0),
  definition_version INTEGER NOT NULL CHECK (definition_version >= 1),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  reassessment_due_on DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT member_progress_goals_series_version_unique UNIQUE (series_id, definition_version),
  CONSTRAINT member_progress_goals_difficulty_target CHECK (
    metric <> 'difficulty' OR target_value BETWEEN 0 AND 10
  )
);

CREATE TABLE IF NOT EXISTS public.member_progress_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES public.member_progress_goals(id) ON DELETE CASCADE,
  definition_version INTEGER NOT NULL CHECK (definition_version >= 1),
  metric TEXT NOT NULL CHECK (metric IN ('duration', 'reps', 'distance', 'difficulty')),
  unit TEXT NOT NULL CHECK (
    (metric = 'duration' AND unit = 'seconds') OR
    (metric = 'reps' AND unit = 'count') OR
    (metric = 'distance' AND unit = 'meters') OR
    (metric = 'difficulty' AND unit = 'score_0_10')
  ),
  measured_on DATE NOT NULL,
  value NUMERIC CHECK (value IS NULL OR value >= 0),
  unmeasured_reason TEXT CHECK (
    (value IS NOT NULL AND unmeasured_reason IS NULL) OR
    (value IS NULL AND unmeasured_reason IS NOT NULL AND char_length(btrim(unmeasured_reason)) BETWEEN 1 AND 200)
  ),
  source TEXT NOT NULL CHECK (source IN ('member_report', 'trainer_measurement')),
  actor TEXT NOT NULL CHECK (actor IN ('member', 'trainer')),
  memo TEXT CHECK (memo IS NULL OR char_length(memo) <= 1000),
  supersedes_observation_id UUID REFERENCES public.member_progress_observations(id),
  correction_reason TEXT CHECK (correction_reason IS NULL OR char_length(btrim(correction_reason)) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT member_progress_observations_difficulty_range CHECK (
    metric <> 'difficulty' OR value IS NULL OR value BETWEEN 0 AND 10
  ),
  CONSTRAINT member_progress_observations_correction_reason CHECK (
    (supersedes_observation_id IS NULL AND correction_reason IS NULL) OR
    (supersedes_observation_id IS NOT NULL AND correction_reason IS NOT NULL)
  ),
  CONSTRAINT member_progress_observations_one_correction UNIQUE (supersedes_observation_id)
);

CREATE TABLE IF NOT EXISTS public.member_progress_opinions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  observation_id UUID NOT NULL REFERENCES public.member_progress_observations(id) ON DELETE CASCADE,
  opinion TEXT NOT NULL CHECK (opinion IN ('better', 'same', 'worse', 'unknown')),
  actor TEXT NOT NULL CHECK (actor IN ('member', 'trainer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT member_progress_opinions_observation_unique UNIQUE (observation_id)
);

CREATE INDEX IF NOT EXISTS idx_member_progress_goals_member_active
  ON public.member_progress_goals(member_id, is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_progress_observations_goal_date
  ON public.member_progress_observations(goal_id, measured_on, created_at);
CREATE INDEX IF NOT EXISTS idx_member_progress_observations_member
  ON public.member_progress_observations(member_id, measured_on DESC);
CREATE INDEX IF NOT EXISTS idx_member_progress_opinions_member
  ON public.member_progress_opinions(member_id, created_at DESC);

ALTER TABLE public.member_progress_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_progress_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_progress_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_progress_opinions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.member_progress_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.member_progress_goals FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.member_progress_observations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.member_progress_opinions FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_member_progress_goal(
  p_request_id UUID,
  p_member_id UUID,
  p_name TEXT,
  p_condition TEXT,
  p_metric TEXT,
  p_direction TEXT,
  p_unit TEXT,
  p_target_value NUMERIC,
  p_definition_version INTEGER,
  p_reassessment_due_on DATE,
  p_measured_on DATE,
  p_value NUMERIC,
  p_unmeasured_reason TEXT,
  p_source TEXT,
  p_actor TEXT,
  p_memo TEXT,
  p_opinion TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trainer_id UUID := auth.uid();
  v_payload JSONB;
  v_existing_payload JSONB;
  v_response JSONB;
  v_member public.members%ROWTYPE;
  v_goal public.member_progress_goals%ROWTYPE;
  v_observation public.member_progress_observations%ROWTYPE;
BEGIN
  IF v_trainer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
  END IF;
  IF p_request_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'request_id_required');
  END IF;
  v_payload := jsonb_build_object(
    'member_id', p_member_id, 'name', p_name, 'condition', p_condition,
    'metric', p_metric, 'direction', p_direction, 'unit', p_unit,
    'target_value', p_target_value, 'definition_version', p_definition_version,
    'reassessment_due_on', p_reassessment_due_on, 'measured_on', p_measured_on,
    'value', p_value, 'unmeasured_reason', p_unmeasured_reason,
    'source', p_source, 'actor', p_actor, 'memo', p_memo, 'opinion', p_opinion
  );
  INSERT INTO public.member_progress_requests(trainer_id, request_id, request_payload)
    VALUES (v_trainer_id, p_request_id, v_payload)
    ON CONFLICT (trainer_id, request_id) DO NOTHING;
  SELECT request_payload, response INTO v_existing_payload, v_response
    FROM public.member_progress_requests
    WHERE trainer_id = v_trainer_id AND request_id = p_request_id
    FOR UPDATE;
  IF v_existing_payload IS DISTINCT FROM v_payload THEN
    RETURN jsonb_build_object('success', false, 'reason', 'request_conflict');
  END IF;
  IF v_response IS NOT NULL THEN
    RETURN v_response;
  END IF;

  SELECT * INTO v_member FROM public.members WHERE id = p_member_id AND trainer_id = v_trainer_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'member_not_found');
  END IF;
  IF NULLIF(btrim(p_name), '') IS NULL OR char_length(btrim(p_name)) > 100
     OR NULLIF(btrim(p_condition), '') IS NULL OR char_length(btrim(p_condition)) > 500 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_goal_text');
  END IF;
  IF p_metric NOT IN ('duration', 'reps', 'distance', 'difficulty')
     OR p_direction NOT IN ('increase', 'decrease', 'none')
     OR p_definition_version < 1 OR p_target_value IS NULL OR p_target_value < 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_goal');
  END IF;
  IF (p_metric, p_unit) NOT IN (('duration', 'seconds'), ('reps', 'count'), ('distance', 'meters'), ('difficulty', 'score_0_10')) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_unit');
  END IF;
  IF p_metric = 'difficulty' AND p_target_value > 10 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_target_value');
  END IF;
  IF p_measured_on > ((now() AT TIME ZONE 'Asia/Seoul')::date) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'measured_on_future');
  END IF;
  IF p_value IS NULL AND NULLIF(btrim(p_unmeasured_reason), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unmeasured_reason_required');
  END IF;
  IF p_value IS NOT NULL AND (p_value < 0 OR (p_metric = 'difficulty' AND p_value > 10)) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_value');
  END IF;
  IF p_source NOT IN ('member_report', 'trainer_measurement') OR p_actor NOT IN ('member', 'trainer') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_source');
  END IF;
  IF p_opinion IS NOT NULL AND p_opinion NOT IN ('better', 'same', 'worse', 'unknown') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_opinion');
  END IF;
  IF (SELECT count(*) FROM public.member_progress_goals WHERE member_id = p_member_id AND is_active) >= 3 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'active_goal_limit');
  END IF;

  INSERT INTO public.member_progress_goals(
    trainer_id, member_id, name, condition, metric, direction, unit, target_value,
    definition_version, reassessment_due_on
  ) VALUES (
    v_trainer_id, p_member_id, btrim(p_name), btrim(p_condition), p_metric, p_direction,
    p_unit, p_target_value, p_definition_version, p_reassessment_due_on
  ) RETURNING * INTO v_goal;

  INSERT INTO public.member_progress_observations(
    trainer_id, member_id, goal_id, definition_version, metric, unit, measured_on,
    value, unmeasured_reason, source, actor, memo
  ) VALUES (
    v_trainer_id, p_member_id, v_goal.id, v_goal.definition_version, p_metric, p_unit,
    p_measured_on, p_value, NULLIF(btrim(p_unmeasured_reason), ''), p_source, p_actor, NULLIF(btrim(p_memo), '')
  ) RETURNING * INTO v_observation;

  IF p_opinion IS NOT NULL THEN
    INSERT INTO public.member_progress_opinions(trainer_id, member_id, observation_id, opinion, actor)
      VALUES (v_trainer_id, p_member_id, v_observation.id, p_opinion, p_actor);
  END IF;
  v_response := jsonb_build_object('success', true, 'goal_id', v_goal.id, 'observation_id', v_observation.id);
  UPDATE public.member_progress_requests SET response = v_response WHERE trainer_id = v_trainer_id AND request_id = p_request_id;
  RETURN v_response;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_member_progress_observation(
  p_request_id UUID,
  p_goal_id UUID,
  p_definition_version INTEGER,
  p_metric TEXT,
  p_unit TEXT,
  p_measured_on DATE,
  p_value NUMERIC,
  p_unmeasured_reason TEXT,
  p_source TEXT,
  p_actor TEXT,
  p_memo TEXT,
  p_opinion TEXT DEFAULT NULL,
  p_supersedes_observation_id UUID DEFAULT NULL,
  p_correction_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trainer_id UUID := auth.uid();
  v_goal public.member_progress_goals%ROWTYPE;
  v_observation public.member_progress_observations%ROWTYPE;
  v_existing_payload JSONB;
  v_response JSONB;
  v_payload JSONB;
BEGIN
  IF v_trainer_id IS NULL THEN RETURN jsonb_build_object('success', false, 'reason', 'unauthorized'); END IF;
  IF p_request_id IS NULL THEN RETURN jsonb_build_object('success', false, 'reason', 'request_id_required'); END IF;
  v_payload := jsonb_build_object(
    'goal_id', p_goal_id, 'definition_version', p_definition_version, 'metric', p_metric,
    'unit', p_unit, 'measured_on', p_measured_on, 'value', p_value,
    'unmeasured_reason', p_unmeasured_reason, 'source', p_source, 'actor', p_actor,
    'memo', p_memo, 'opinion', p_opinion, 'supersedes_observation_id', p_supersedes_observation_id,
    'correction_reason', p_correction_reason
  );
  INSERT INTO public.member_progress_requests(trainer_id, request_id, request_payload)
    VALUES (v_trainer_id, p_request_id, v_payload)
    ON CONFLICT (trainer_id, request_id) DO NOTHING;
  SELECT request_payload, response INTO v_existing_payload, v_response
    FROM public.member_progress_requests WHERE trainer_id = v_trainer_id AND request_id = p_request_id FOR UPDATE;
  IF v_existing_payload IS DISTINCT FROM v_payload THEN RETURN jsonb_build_object('success', false, 'reason', 'request_conflict'); END IF;
  IF v_response IS NOT NULL THEN
    RETURN v_response;
  END IF;
  SELECT * INTO v_goal FROM public.member_progress_goals WHERE id = p_goal_id AND trainer_id = v_trainer_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'reason', 'goal_not_found'); END IF;
  IF p_definition_version <> v_goal.definition_version OR p_metric <> v_goal.metric OR p_unit <> v_goal.unit THEN
    RETURN jsonb_build_object('success', false, 'reason', 'goal_definition_mismatch');
  END IF;
  IF p_measured_on > ((now() AT TIME ZONE 'Asia/Seoul')::date) THEN RETURN jsonb_build_object('success', false, 'reason', 'measured_on_future'); END IF;
  IF p_value IS NULL AND NULLIF(btrim(p_unmeasured_reason), '') IS NULL THEN RETURN jsonb_build_object('success', false, 'reason', 'unmeasured_reason_required'); END IF;
  IF p_value IS NOT NULL AND (p_value < 0 OR (p_metric = 'difficulty' AND p_value > 10)) THEN RETURN jsonb_build_object('success', false, 'reason', 'invalid_value'); END IF;
  IF p_source NOT IN ('member_report', 'trainer_measurement') OR p_actor NOT IN ('member', 'trainer') THEN RETURN jsonb_build_object('success', false, 'reason', 'invalid_source'); END IF;
  IF p_opinion IS NOT NULL AND p_opinion NOT IN ('better', 'same', 'worse', 'unknown') THEN RETURN jsonb_build_object('success', false, 'reason', 'invalid_opinion'); END IF;
  IF p_supersedes_observation_id IS NOT NULL THEN
    IF NULLIF(btrim(p_correction_reason), '') IS NULL THEN RETURN jsonb_build_object('success', false, 'reason', 'correction_reason_required'); END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.member_progress_observations
      WHERE id = p_supersedes_observation_id AND goal_id = p_goal_id AND member_id = v_goal.member_id AND trainer_id = v_trainer_id
    ) THEN RETURN jsonb_build_object('success', false, 'reason', 'superseded_observation_not_found'); END IF;
  END IF;
  INSERT INTO public.member_progress_observations(
    trainer_id, member_id, goal_id, definition_version, metric, unit, measured_on, value,
    unmeasured_reason, source, actor, memo, supersedes_observation_id, correction_reason
  ) VALUES (
    v_trainer_id, v_goal.member_id, p_goal_id, p_definition_version, p_metric, p_unit, p_measured_on,
    p_value, NULLIF(btrim(p_unmeasured_reason), ''), p_source, p_actor, NULLIF(btrim(p_memo), ''),
    p_supersedes_observation_id, NULLIF(btrim(p_correction_reason), '')
  ) RETURNING * INTO v_observation;
  IF p_opinion IS NOT NULL THEN
    INSERT INTO public.member_progress_opinions(trainer_id, member_id, observation_id, opinion, actor)
      VALUES (v_trainer_id, v_goal.member_id, v_observation.id, p_opinion, p_actor);
  END IF;
  v_response := jsonb_build_object('success', true, 'observation_id', v_observation.id);
  UPDATE public.member_progress_requests SET response = v_response WHERE trainer_id = v_trainer_id AND request_id = p_request_id;
  RETURN v_response;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_member_progress(p_member_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_trainer_id UUID := auth.uid();
BEGIN
  IF v_trainer_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.members WHERE id = p_member_id AND trainer_id = v_trainer_id) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'member_not_found');
  END IF;
  RETURN jsonb_build_object(
    'success', true,
    'goals', COALESCE((SELECT jsonb_agg(to_jsonb(g) ORDER BY g.created_at) FROM public.member_progress_goals g WHERE g.member_id = p_member_id AND g.trainer_id = v_trainer_id), '[]'::jsonb),
    'observations', COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.measured_on, o.created_at) FROM public.member_progress_observations o WHERE o.member_id = p_member_id AND o.trainer_id = v_trainer_id), '[]'::jsonb),
    'opinions', COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.created_at) FROM public.member_progress_opinions i WHERE i.member_id = p_member_id AND i.trainer_id = v_trainer_id), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_member_progress_goal(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, INTEGER, DATE, DATE, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_member_progress_observation(UUID, UUID, INTEGER, TEXT, TEXT, DATE, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_member_progress(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_member_progress_goal(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, INTEGER, DATE, DATE, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_member_progress_observation(UUID, UUID, INTEGER, TEXT, TEXT, DATE, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_progress(UUID) TO authenticated;
