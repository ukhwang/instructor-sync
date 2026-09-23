-- Additive item-level confirmation. The v1 RPC, snapshots and hash format stay
-- unchanged; legacy assignments can use v2 with their default required items.
ALTER TABLE public.homework_logs DROP CONSTRAINT homework_logs_kind_check;
ALTER TABLE public.homework_logs ADD CONSTRAINT homework_logs_kind_check
  CHECK (kind IN ('complete', 'partial', 'cant', 'pain', 'note'));

ALTER TABLE public.homework_submissions ADD CONSTRAINT homework_submissions_id_homework_key
  UNIQUE (id, homework_id);
ALTER TABLE public.homework_items ADD CONSTRAINT homework_items_id_homework_key
  UNIQUE (id, homework_id);

CREATE TABLE public.homework_item_results (
  submission_id UUID NOT NULL,
  homework_id UUID NOT NULL,
  homework_item_id UUID NOT NULL,
  requirement TEXT NOT NULL CHECK (requirement IN ('required', 'optional')),
  completed BOOLEAN NOT NULL,
  PRIMARY KEY (submission_id, homework_item_id),
  FOREIGN KEY (submission_id, homework_id)
    REFERENCES public.homework_submissions(id, homework_id) ON DELETE CASCADE,
  FOREIGN KEY (homework_item_id, homework_id)
    REFERENCES public.homework_items(id, homework_id)
);
CREATE INDEX idx_homework_item_results_homework ON public.homework_item_results(homework_id);
CREATE INDEX idx_homework_item_results_item ON public.homework_item_results(homework_item_id, homework_id);
ALTER TABLE public.homework_item_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Trainers can view own item results" ON public.homework_item_results
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.homework h
    WHERE h.id = homework_item_results.homework_id AND h.trainer_id = (SELECT auth.uid())
  ));
REVOKE ALL ON public.homework_item_results FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.homework_item_results TO authenticated;

-- Private replay ledger, scoped to a homework. Neither payload nor response
-- contains a raw token. Current token validity is checked before every replay.
CREATE TABLE public.homework_submission_requests (
  homework_id UUID NOT NULL REFERENCES public.homework(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  request_payload JSONB NOT NULL,
  response JSONB NOT NULL,
  PRIMARY KEY (homework_id, request_id)
);
ALTER TABLE public.homework_submission_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.homework_submission_requests FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.submit_homework_feedback_v2(
  p_token TEXT,
  p_completed_item_ids UUID[],
  p_discomfort_level INTEGER,
  p_note TEXT,
  p_request_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_hw public.homework%ROWTYPE;
  v_existing public.homework_submission_requests%ROWTYPE;
  v_completed UUID[];
  v_note TEXT := NULLIF(btrim(p_note), '');
  v_payload JSONB;
  v_result TEXT;
  v_exercises JSONB;
  v_snapshot JSONB;
  v_hash TEXT;
  v_submitted_at TIMESTAMPTZ;
  v_submission_id UUID;
  v_log_id UUID;
  v_pain_log_id UUID;
  v_opening TEXT;
  v_response JSONB;
BEGIN
  SELECT * INTO v_hw FROM public.homework WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found');
  END IF;
  IF v_hw.revoked_at IS NOT NULL OR v_hw.status = 'revoked' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'revoked');
  END IF;
  IF v_hw.token_expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('success', false, 'reason', 'expired');
  END IF;
  IF p_request_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_request_id');
  END IF;
  IF p_discomfort_level IS NULL OR p_discomfort_level NOT BETWEEN 1 AND 10 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_discomfort_level');
  END IF;
  -- Reject duplicate/null members and multidimensional input instead of silently
  -- flattening/deduplicating an ambiguous client payload. Empty means none done.
  IF p_completed_item_ids IS NULL OR COALESCE(array_ndims(p_completed_item_ids), 1) <> 1
    OR EXISTS (SELECT 1 FROM unnest(p_completed_item_ids) AS x(id) WHERE id IS NULL)
    OR cardinality(p_completed_item_ids) <> (SELECT count(DISTINCT id) FROM unnest(p_completed_item_ids) AS x(id)) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_completed_item_ids');
  END IF;
  SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO v_completed
  FROM unnest(p_completed_item_ids) AS x(id);
  v_payload := jsonb_build_object('completed_item_ids', v_completed,
    'discomfort_level', p_discomfort_level, 'note', v_note);

  SELECT * INTO v_existing FROM public.homework_submission_requests
  WHERE homework_id = v_hw.id AND request_id = p_request_id;
  IF FOUND THEN
    IF v_existing.request_payload IS DISTINCT FROM v_payload THEN
      RETURN jsonb_build_object('success', false, 'reason', 'request_payload_conflict');
    END IF;
    RETURN v_existing.response;
  END IF;
  IF EXISTS (SELECT 1 FROM public.homework_submissions WHERE homework_id = v_hw.id) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_submitted');
  END IF;

  -- Freeze existing item content while constructing snapshot and result rows.
  PERFORM 1 FROM public.homework_items WHERE homework_id = v_hw.id ORDER BY id FOR SHARE;
  IF NOT EXISTS (SELECT 1 FROM public.homework_items WHERE homework_id = v_hw.id AND requirement = 'required') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_homework_items');
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_completed) AS x(id) WHERE NOT EXISTS (
    SELECT 1 FROM public.homework_items i WHERE i.id = x.id AND i.homework_id = v_hw.id
  )) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_completed_item_ids');
  END IF;

  IF cardinality(v_completed) = 0 THEN v_result := 'cant';
  ELSIF NOT EXISTS (SELECT 1 FROM public.homework_items
    WHERE homework_id = v_hw.id AND requirement = 'required' AND NOT (id = ANY(v_completed))) THEN
    v_result := 'complete';
  ELSE v_result := 'partial';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'id', id, 'order_index', order_index, 'name', name, 'cue', cue,
    'target_sets', target_sets, 'target_reps', target_reps, 'effort_kind', effort_kind,
    'reps', reps, 'hold_seconds', hold_seconds, 'seconds_per_rep', seconds_per_rep,
    'rest_seconds', rest_seconds, 'per_side', per_side,
    'exercise_snapshot', exercise_snapshot, 'requirement', requirement,
    'completed', id = ANY(v_completed)
  ) ORDER BY order_index, id) INTO v_exercises
  FROM public.homework_items WHERE homework_id = v_hw.id;
  v_submitted_at := clock_timestamp();
  v_snapshot := jsonb_build_object('version', 2, 'homework_id', v_hw.id,
    'result', v_result, 'discomfort_level', p_discomfort_level, 'note', v_note,
    'exercises', v_exercises, 'submitted_at', v_submitted_at);
  v_hash := encode(extensions.digest(convert_to(v_snapshot::text, 'UTF8'), 'sha256'), 'hex');
  INSERT INTO public.homework_submissions(homework_id, snapshot, snapshot_hash, submitted_at)
  VALUES(v_hw.id, v_snapshot, v_hash, v_submitted_at) RETURNING id INTO v_submission_id;
  INSERT INTO public.homework_item_results(submission_id, homework_id, homework_item_id, requirement, completed)
  SELECT v_submission_id, v_hw.id, id, requirement, id = ANY(v_completed)
  FROM public.homework_items WHERE homework_id = v_hw.id;
  INSERT INTO public.homework_logs(homework_id, kind, payload)
  VALUES(v_hw.id, v_result, jsonb_strip_nulls(jsonb_build_object('note', v_note, 'completed_items', v_completed)))
  RETURNING id INTO v_log_id;
  INSERT INTO public.homework_logs(homework_id, kind, payload)
  VALUES(v_hw.id, 'pain', jsonb_build_object('pain_area', '현재 느끼는 불편함', 'pain_level', p_discomfort_level))
  RETURNING id INTO v_pain_log_id;
  v_opening := CASE v_result
    WHEN 'complete' THEN '지난 숙제의 필수 동작을 완료하셨어요. 수행 기록과 불편함을 확인하고 오늘 수업을 이어갈게요.'
    WHEN 'partial' THEN '지난 숙제 중 일부 동작을 수행하셨어요. 어려웠던 동작과 불편함부터 확인할게요.'
    ELSE '지난 숙제 수행이 어려우셨어요. 이유와 불편함을 확인하고 오늘 할 수 있는 동작부터 맞춰볼게요.' END;
  UPDATE public.homework SET status = 'logged', opening_line = v_opening, updated_at = v_submitted_at
  WHERE id = v_hw.id;
  v_response := jsonb_build_object('success', true, 'submission_id', v_submission_id,
    'log_id', v_log_id, 'pain_log_id', v_pain_log_id, 'status', 'logged',
    'result', v_result, 'opening_line', v_opening, 'submitted_at', v_submitted_at, 'snapshot_hash', v_hash);
  INSERT INTO public.homework_submission_requests(homework_id, request_id, request_payload, response)
  VALUES(v_hw.id, p_request_id, v_payload, v_response);
  RETURN v_response;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_homework_feedback_v2(text, uuid[], integer, text, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_homework_feedback_v2(text, uuid[], integer, text, uuid)
TO anon, authenticated;

-- Rollback: revoke v2 EXECUTE and stop its caller; preserve v2 records, the
-- partial log constraint and new tables. Legacy writers/readers still operate.
-- Never down-convert v2 hashes/snapshots or drop confirmed member feedback.
