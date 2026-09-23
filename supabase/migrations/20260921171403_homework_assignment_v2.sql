-- Additive assignment metadata only. Public reading/submission RPCs and the
-- existing create_homework signature and snapshot validation stay unchanged.
ALTER TABLE public.homework
  ADD COLUMN assignment_purpose TEXT
    CHECK (assignment_purpose IN ('routine', 'focus', 'review')),
  ADD COLUMN burden_budget_seconds INTEGER CHECK (burden_budget_seconds > 0),
  ADD COLUMN source_homework_id UUID REFERENCES public.homework(id) ON DELETE SET NULL;
CREATE INDEX idx_homework_source ON public.homework(source_homework_id);

ALTER TABLE public.homework_items
  ADD COLUMN requirement TEXT NOT NULL DEFAULT 'required'
    CHECK (requirement IN ('required', 'optional'));

-- Internal reservation/result ledger. No policies or Data API grants: only the
-- authenticated SECURITY DEFINER RPC below may use it. Never cache raw tokens.
CREATE TABLE public.homework_assignment_requests (
  trainer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  request_payload JSONB NOT NULL,
  homework_id UUID REFERENCES public.homework(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (trainer_id, request_id)
);
CREATE INDEX idx_homework_assignment_requests_homework
  ON public.homework_assignment_requests(homework_id);
ALTER TABLE public.homework_assignment_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.homework_assignment_requests FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.create_homework_v2(
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
      OR COALESCE(item->>'order_index', '') !~ '^[1-3]$'
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

REVOKE ALL ON FUNCTION public.create_homework_v2(uuid, uuid, text, text, timestamptz, jsonb, text, integer, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_homework_v2(uuid, uuid, text, text, timestamptz, jsonb, text, integer, uuid)
TO authenticated;

-- Operational rollback is additive: stop using/revoke v2 and keep these columns
-- and ledger rows. Legacy create_homework still works; do not drop saved data.
