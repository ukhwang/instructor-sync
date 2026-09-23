-- Additive public projection for item-level member confirmation.
-- Existing open_homework callers keep the same response shape; each item gains
-- a requirement field so the member can distinguish required and optional work.
CREATE OR REPLACE FUNCTION public.open_homework(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hw public.homework%ROWTYPE;
  v_member RECORD;
  v_items jsonb;
  v_logs jsonb;
BEGIN
  SELECT * INTO v_hw
  FROM public.homework
  WHERE token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found');
  END IF;
  IF v_hw.revoked_at IS NOT NULL OR v_hw.status = 'revoked' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'revoked');
  END IF;
  IF v_hw.token_expires_at < timezone('utc', now()) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'expired');
  END IF;

  IF v_hw.status IN ('draft', 'sent') THEN
    UPDATE public.homework
    SET status = 'opened', updated_at = timezone('utc', now())
    WHERE id = v_hw.id;
    v_hw.status := 'opened';
  END IF;

  SELECT id, name INTO v_member
  FROM public.members
  WHERE id = v_hw.member_id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'order_index', order_index,
      'name', name,
      'cue', cue,
      'target_sets', target_sets,
      'target_reps', target_reps,
      'effort_kind', effort_kind,
      'reps', reps,
      'hold_seconds', hold_seconds,
      'seconds_per_rep', seconds_per_rep,
      'rest_seconds', rest_seconds,
      'per_side', per_side,
      'requirement', COALESCE(requirement, 'required')
    ) ORDER BY order_index ASC
  ) INTO v_items
  FROM public.homework_items
  WHERE homework_id = v_hw.id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'kind', kind,
      'payload', payload,
      'created_at', created_at
    ) ORDER BY created_at ASC
  ) INTO v_logs
  FROM public.homework_logs
  WHERE homework_id = v_hw.id;

  RETURN jsonb_build_object(
    'success', true,
    'homework', jsonb_build_object(
      'id', v_hw.id,
      'why', v_hw.why,
      'status', v_hw.status,
      'token_expires_at', v_hw.token_expires_at,
      'created_at', v_hw.created_at
    ),
    'member', jsonb_build_object('name', v_member.name),
    'items', COALESCE(v_items, '[]'::jsonb),
    'logs', COALESCE(v_logs, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.open_homework(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_homework(text) TO anon, authenticated;
