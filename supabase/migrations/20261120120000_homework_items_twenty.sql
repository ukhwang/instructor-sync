-- 숙제 동작 개수 상한 3 → 20.
-- 원장이 한 번에 최대 20개 동작을 출제할 수 있게 범위만 넓힌다. 기존 행·토큰·정책은 그대로 둔다.
-- 적용 순서: (1) homework_items.order_index CHECK, (2) 레거시 create_homework, (3) create_homework_v2.
-- 롤백: 아래 두 RPC 를 이전 정의(20260921075052 / 20260921171403)로 되돌리고
--        order_index CHECK 를 (order_index BETWEEN 1 AND 3) 으로 복구한다.
--        단, 이미 저장된 4개 이상 숙제 행이 있으면 CHECK 복구는 실패하므로 되돌리지 않는다.

ALTER TABLE public.homework_items
  DROP CONSTRAINT IF EXISTS homework_items_order_index_check;

ALTER TABLE public.homework_items
  ADD CONSTRAINT homework_items_order_index_check
  CHECK (order_index BETWEEN 1 AND 20);

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
  IF v_item_count NOT BETWEEN 1 AND 20
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(p_items) AS item
       WHERE jsonb_typeof(item) IS DISTINCT FROM 'object'
         OR NULLIF(BTRIM(item->>'name'), '') IS NULL
         OR NULLIF(BTRIM(item->>'target_reps'), '') IS NULL
         OR (item->>'order_index') !~ '^([1-9]|1[0-9]|20)$'
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

CREATE OR REPLACE FUNCTION public.create_homework_v2(
  p_request_id UUID,
  p_member_id UUID,
  p_why TEXT,
  p_token TEXT,
  p_token_expires_at TIMESTAMPTZ,
  p_items JSONB,
  p_assignment_purpose TEXT DEFAULT NULL,
  p_burden_budget_seconds INTEGER DEFAULT NULL,
  p_source_homework_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trainer_id UUID := (SELECT auth.uid());
  v_payload JSONB;
  v_existing public.homework_assignment_requests%ROWTYPE;
  v_won_request BOOLEAN := FALSE;
  v_result JSONB;
  v_homework_id UUID;
BEGIN
  IF v_trainer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
  END IF;
  IF p_request_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_request_id');
  END IF;

  -- Lock ownership before both fresh writes and replay; ownership changes and
  -- deletes cannot race this transaction's authorization checks.
  PERFORM 1 FROM public.members
  WHERE id = p_member_id AND trainer_id = v_trainer_id FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'member_not_found');
  END IF;
  IF p_source_homework_id IS NOT NULL THEN
    PERFORM 1 FROM public.homework
    WHERE id = p_source_homework_id AND trainer_id = v_trainer_id
      AND member_id = p_member_id FOR SHARE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'reason', 'source_homework_not_found');
    END IF;
  END IF;

  IF p_assignment_purpose IS NOT NULL AND p_assignment_purpose NOT IN ('routine', 'focus', 'review') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_assignment_purpose');
  END IF;
  IF p_burden_budget_seconds IS NOT NULL AND p_burden_budget_seconds <= 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_burden_budget');
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_items');
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS item
    WHERE jsonb_typeof(item) IS DISTINCT FROM 'object'
      OR (item ? 'requirement' AND (
        jsonb_typeof(item->'requirement') IS DISTINCT FROM 'string'
        OR item->>'requirement' NOT IN ('required', 'optional')
      ))
      OR COALESCE(item->>'target_sets', '') !~ '^[1-9][0-9]?$'
      OR COALESCE(item->>'order_index', '') !~ '^([1-9]|1[0-9]|20)$'
  ) OR NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS item
    WHERE COALESCE(item->>'requirement', 'required') = 'required'
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_items');
  END IF;

  -- Replays use identical typed arguments and JSONB item content (object key
  -- order is irrelevant); why is trimmed as in the legacy RPC. Token changes,
  -- even with otherwise identical input, conflict. Only a SHA-256 fingerprint
  -- is retained here. Successful replay does not reselect archived exercises.
  v_payload := jsonb_build_object(
    'member_id', p_member_id, 'why', btrim(p_why),
    'token_sha256', encode(sha256(convert_to(p_token, 'UTF8')), 'hex'),
    'token_expires_at_epoch', extract(epoch FROM p_token_expires_at), 'items', p_items,
    'assignment_purpose', p_assignment_purpose,
    'burden_budget_seconds', p_burden_budget_seconds,
    'source_homework_id', p_source_homework_id
  );
  INSERT INTO public.homework_assignment_requests(trainer_id, request_id, request_payload)
  VALUES (v_trainer_id, p_request_id, v_payload)
  ON CONFLICT (trainer_id, request_id) DO NOTHING
  RETURNING TRUE INTO v_won_request;

  IF NOT COALESCE(v_won_request, FALSE) THEN
    SELECT * INTO v_existing FROM public.homework_assignment_requests
    WHERE trainer_id = v_trainer_id AND request_id = p_request_id;
    IF v_existing.request_payload IS DISTINCT FROM v_payload THEN
      RETURN jsonb_build_object('success', false, 'reason', 'request_payload_conflict');
    END IF;
    PERFORM 1 FROM public.homework
    WHERE id = v_existing.homework_id AND trainer_id = v_trainer_id
      AND member_id = p_member_id FOR SHARE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'reason', 'homework_not_found');
    END IF;
    RETURN jsonb_build_object('success', true, 'id', v_existing.homework_id, 'replayed', true);
  END IF;

  -- Reuse the latest canonical exercise snapshot checks and all existing item
  -- constraints. Exceptions abort the ledger, homework and items together.
  v_result := public.create_homework(p_member_id, p_why, p_token, p_token_expires_at, p_items);
  IF v_result->>'success' = 'false' THEN
    DELETE FROM public.homework_assignment_requests
    WHERE trainer_id = v_trainer_id AND request_id = p_request_id;
    RETURN v_result;
  END IF;
  IF v_result->>'success' IS DISTINCT FROM 'true' OR v_result->>'id' IS NULL THEN
    RAISE EXCEPTION 'Unexpected create_homework result';
  END IF;
  v_homework_id := (v_result->>'id')::uuid;
  UPDATE public.homework
  SET assignment_purpose = p_assignment_purpose,
      burden_budget_seconds = p_burden_budget_seconds,
      source_homework_id = p_source_homework_id
  WHERE id = v_homework_id;
  UPDATE public.homework_items AS saved
  SET requirement = COALESCE(item->>'requirement', 'required')
  FROM jsonb_array_elements(p_items) AS item
  WHERE saved.homework_id = v_homework_id
    AND saved.order_index = (item->>'order_index')::integer;
  UPDATE public.homework_assignment_requests SET homework_id = v_homework_id
  WHERE trainer_id = v_trainer_id AND request_id = p_request_id;
  RETURN jsonb_build_object('success', true, 'id', v_homework_id, 'replayed', false);
END;
$$;

-- CREATE OR REPLACE 는 기존 GRANT/OWNER 를 유지하므로 별도 GRANT 는 필요 없다.
