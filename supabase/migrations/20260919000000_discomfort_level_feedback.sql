-- Add a numeric discomfort submission without changing the existing boolean
-- overload. Existing clients can continue calling the five-argument function.
CREATE OR REPLACE FUNCTION public.submit_homework_feedback(
    p_token text,
    p_kind text,
    p_discomfort_level integer,
    p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_result jsonb;
    v_pain_log_id uuid;
BEGIN
    IF p_discomfort_level IS NULL
       OR p_discomfort_level < 1
       OR p_discomfort_level > 10 THEN
        RETURN jsonb_build_object('success', false, 'reason', 'invalid_discomfort_level');
    END IF;

    -- Reuse the existing atomic write and token validation. The legacy pain
    -- log remains the compatibility carrier for the numeric level.
    v_result := public.submit_homework_feedback(
        p_token,
        p_kind,
        true,
        p_note,
        '현재 느끼는 불편함'
    );

    IF COALESCE((v_result->>'success')::boolean, false) THEN
        v_pain_log_id := (v_result->>'pain_log_id')::uuid;

        UPDATE public.homework_logs
        SET payload = payload || jsonb_build_object('pain_level', p_discomfort_level)
        WHERE id = v_pain_log_id;
    END IF;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_homework_feedback(text, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_homework_feedback(text, text, integer, text) TO anon, authenticated;
