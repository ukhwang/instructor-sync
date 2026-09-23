-- Additive RPC replacement. Existing observations and request payloads are preserved.
-- Rollback: restore the two function definitions from 20260921000000;
-- no rows or tables should be deleted. New trainer actor values remain valid.
-- SECURITY DEFINER is retained for the existing RPC-only access model.
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
  SELECT * INTO v_member FROM public.members WHERE id = p_member_id AND trainer_id = v_trainer_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'member_not_found');
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

  IF NULLIF(btrim(p_name), '') IS NULL OR char_length(btrim(p_name)) > 100
     OR NULLIF(btrim(p_condition), '') IS NULL OR char_length(btrim(p_condition)) > 500 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_goal_text');
  END IF;
  IF p_metric IS NULL OR p_direction IS NULL OR p_definition_version IS NULL OR p_metric NOT IN ('duration', 'reps', 'distance', 'difficulty')
     OR p_direction NOT IN ('increase', 'decrease', 'none')
     OR p_definition_version < 1 OR p_target_value IS NULL OR (p_target_value < 0 OR p_target_value::text IN ('NaN', 'Infinity', '-Infinity')) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_goal');
  END IF;
  IF p_unit IS NULL OR (p_metric, p_unit) NOT IN (('duration', 'seconds'), ('reps', 'count'), ('distance', 'meters'), ('difficulty', 'score_0_10')) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_unit');
  END IF;
  IF p_metric = 'difficulty' AND (p_target_value > 10 OR p_target_value <> trunc(p_target_value)) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_target_value');
  END IF;
  IF p_measured_on IS NULL THEN RETURN jsonb_build_object('success', false, 'reason', 'measured_on_required'); END IF;
  IF p_measured_on > ((now() AT TIME ZONE 'Asia/Seoul')::date) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'measured_on_future');
  END IF;
  IF p_value IS NULL AND NULLIF(btrim(p_unmeasured_reason), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unmeasured_reason_required');
  END IF;
  IF p_value IS NOT NULL AND (p_value::text IN ('NaN', 'Infinity', '-Infinity') OR p_value < 0 OR (p_metric = 'difficulty' AND (p_value > 10 OR p_value <> trunc(p_value)))) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_value');
  END IF;
  IF p_source IS NULL OR p_actor IS NULL OR p_source NOT IN ('member_report', 'trainer_measurement') OR p_actor NOT IN ('member', 'trainer') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_source');
  END IF;
  IF p_value IS NOT NULL AND NULLIF(btrim(p_unmeasured_reason), '') IS NOT NULL THEN RETURN jsonb_build_object('success', false, 'reason', 'value_reason_conflict'); END IF;
  IF char_length(btrim(p_unmeasured_reason)) > 200 OR char_length(p_memo) > 1000 THEN RETURN jsonb_build_object('success', false, 'reason', 'text_too_long'); END IF;
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
    p_measured_on, p_value, NULLIF(btrim(p_unmeasured_reason), ''), p_source, 'trainer', NULLIF(btrim(p_memo), '')
  ) RETURNING * INTO v_observation;

  IF p_opinion IS NOT NULL THEN
    INSERT INTO public.member_progress_opinions(trainer_id, member_id, observation_id, opinion, actor)
      VALUES (v_trainer_id, p_member_id, v_observation.id, p_opinion, 'trainer');
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
  v_original public.member_progress_observations%ROWTYPE;
BEGIN
  IF v_trainer_id IS NULL THEN RETURN jsonb_build_object('success', false, 'reason', 'unauthorized'); END IF;
  IF p_request_id IS NULL THEN RETURN jsonb_build_object('success', false, 'reason', 'request_id_required'); END IF;
  SELECT g.* INTO v_goal FROM public.member_progress_goals g
    JOIN public.members m ON m.id = g.member_id AND m.trainer_id = v_trainer_id
    WHERE g.id = p_goal_id AND g.trainer_id = v_trainer_id FOR UPDATE OF g;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'reason', 'goal_not_found'); END IF;
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
  IF p_definition_version IS DISTINCT FROM v_goal.definition_version OR p_metric IS DISTINCT FROM v_goal.metric OR p_unit IS DISTINCT FROM v_goal.unit THEN
    RETURN jsonb_build_object('success', false, 'reason', 'goal_definition_mismatch');
  END IF;
  IF p_measured_on IS NULL THEN RETURN jsonb_build_object('success', false, 'reason', 'measured_on_required'); END IF;
  IF p_measured_on > ((now() AT TIME ZONE 'Asia/Seoul')::date) THEN RETURN jsonb_build_object('success', false, 'reason', 'measured_on_future'); END IF;
  IF p_value IS NULL AND NULLIF(btrim(p_unmeasured_reason), '') IS NULL THEN RETURN jsonb_build_object('success', false, 'reason', 'unmeasured_reason_required'); END IF;
  IF p_value IS NOT NULL AND (p_value::text IN ('NaN', 'Infinity', '-Infinity') OR p_value < 0 OR (p_metric = 'difficulty' AND (p_value > 10 OR p_value <> trunc(p_value)))) THEN RETURN jsonb_build_object('success', false, 'reason', 'invalid_value'); END IF;
  IF p_source IS NULL OR p_actor IS NULL OR p_source NOT IN ('member_report', 'trainer_measurement') OR p_actor NOT IN ('member', 'trainer') THEN RETURN jsonb_build_object('success', false, 'reason', 'invalid_source'); END IF;
  IF p_value IS NOT NULL AND NULLIF(btrim(p_unmeasured_reason), '') IS NOT NULL THEN RETURN jsonb_build_object('success', false, 'reason', 'value_reason_conflict'); END IF;
  IF char_length(btrim(p_unmeasured_reason)) > 200 OR char_length(p_memo) > 1000 THEN RETURN jsonb_build_object('success', false, 'reason', 'text_too_long'); END IF;
  IF p_opinion IS NOT NULL AND p_opinion NOT IN ('better', 'same', 'worse', 'unknown') THEN RETURN jsonb_build_object('success', false, 'reason', 'invalid_opinion'); END IF;
  IF p_supersedes_observation_id IS NOT NULL THEN
    IF NULLIF(btrim(p_correction_reason), '') IS NULL THEN RETURN jsonb_build_object('success', false, 'reason', 'correction_reason_required'); END IF;
    IF char_length(btrim(p_correction_reason)) > 500 THEN RETURN jsonb_build_object('success', false, 'reason', 'correction_reason_too_long'); END IF;
    SELECT * INTO v_original FROM public.member_progress_observations
      WHERE id = p_supersedes_observation_id AND goal_id = p_goal_id AND member_id = v_goal.member_id AND trainer_id = v_trainer_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'reason', 'superseded_observation_not_found'); END IF;
    IF v_original.measured_on IS DISTINCT FROM p_measured_on OR v_original.source IS DISTINCT FROM p_source
       OR v_original.definition_version IS DISTINCT FROM p_definition_version THEN
      RETURN jsonb_build_object('success', false, 'reason', 'correction_context_mismatch');
    END IF;
    IF EXISTS (SELECT 1 FROM public.member_progress_observations WHERE supersedes_observation_id = p_supersedes_observation_id) THEN
      RETURN jsonb_build_object('success', false, 'reason', 'observation_already_corrected');
    END IF;
  ELSIF NULLIF(btrim(p_correction_reason), '') IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'superseded_observation_required');
  END IF;
  INSERT INTO public.member_progress_observations(
    trainer_id, member_id, goal_id, definition_version, metric, unit, measured_on, value,
    unmeasured_reason, source, actor, memo, supersedes_observation_id, correction_reason
  ) VALUES (
    v_trainer_id, v_goal.member_id, p_goal_id, p_definition_version, p_metric, p_unit, p_measured_on,
    p_value, NULLIF(btrim(p_unmeasured_reason), ''), p_source, 'trainer', NULLIF(btrim(p_memo), ''),
    p_supersedes_observation_id, NULLIF(btrim(p_correction_reason), '')
  ) RETURNING * INTO v_observation;
  IF p_opinion IS NOT NULL THEN
    INSERT INTO public.member_progress_opinions(trainer_id, member_id, observation_id, opinion, actor)
      VALUES (v_trainer_id, v_goal.member_id, v_observation.id, p_opinion, 'trainer');
  END IF;
  v_response := jsonb_build_object('success', true, 'observation_id', v_observation.id);
  UPDATE public.member_progress_requests SET response = v_response WHERE trainer_id = v_trainer_id AND request_id = p_request_id;
  RETURN v_response;
END;
$$;


REVOKE ALL ON FUNCTION public.create_member_progress_goal(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, INTEGER, DATE, DATE, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_member_progress_observation(UUID, UUID, INTEGER, TEXT, TEXT, DATE, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_member_progress_goal(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, INTEGER, DATE, DATE, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_member_progress_observation(UUID, UUID, INTEGER, TEXT, TEXT, DATE, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated;
