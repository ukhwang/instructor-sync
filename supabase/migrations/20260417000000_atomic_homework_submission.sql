-- A member's completion choice and optional pain report are one submission.
-- PostgREST runs this function in one transaction; let write errors propagate
-- so neither log nor the homework summary can be committed on its own.
CREATE OR REPLACE FUNCTION public.submit_homework_feedback(
    p_token text,
    p_kind text,
    p_has_pain boolean,
    p_note text,
    p_pain_area text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_hw public.homework%ROWTYPE;
    v_log_id uuid;
    v_pain_log_id uuid;
    v_note text := NULLIF(BTRIM(p_note), '');
    v_pain_area text := COALESCE(NULLIF(BTRIM(p_pain_area), ''), '동작 중 불편함');
    v_item_names text;
    v_user_note text;
    v_has_complete boolean;
    v_has_cant boolean;
    v_record_summary text;
    v_opening text;
BEGIN
    -- Members are anonymous: the unexpired, unrevoked magic-link token is
    -- their authorization. Lock before validation to serialize submissions
    -- and coordinate with revocation updates on this homework.
    SELECT * INTO v_hw
    FROM public.homework
    WHERE token = p_token
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'not_found');
    END IF;
    IF v_hw.revoked_at IS NOT NULL OR v_hw.status = 'revoked' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'revoked');
    END IF;
    IF v_hw.token_expires_at <= clock_timestamp() THEN
        RETURN jsonb_build_object('success', false, 'reason', 'expired');
    END IF;
    IF p_kind IS NULL OR p_kind NOT IN ('complete', 'cant') THEN
        RETURN jsonb_build_object('success', false, 'reason', 'invalid_kind');
    END IF;
    IF p_has_pain IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason', 'invalid_pain_flag');
    END IF;

    INSERT INTO public.homework_logs (homework_id, kind, payload)
    VALUES (v_hw.id, p_kind, jsonb_strip_nulls(jsonb_build_object('note', v_note)))
    RETURNING id INTO v_log_id;

    IF p_has_pain THEN
        INSERT INTO public.homework_logs (homework_id, kind, payload)
        VALUES (v_hw.id, 'pain', jsonb_build_object('pain_area', v_pain_area))
        RETURNING id INTO v_pain_log_id;
    END IF;

    SELECT COALESCE(string_agg(name, ', ' ORDER BY order_index), '운동숙제')
    INTO v_item_names
    FROM public.homework_items
    WHERE homework_id = v_hw.id;

    SELECT string_agg(q, ', ' ORDER BY first_at, first_kind, q)
    INTO v_user_note
    FROM (
        SELECT q, min(created_at) AS first_at, min(kind_order) AS first_kind
        FROM (
            SELECT COALESCE(NULLIF(BTRIM(payload->>'note'), ''),
                            NULLIF(BTRIM(payload->>'pain_area'), '')) AS q,
                   created_at, CASE WHEN kind = 'pain' THEN 1 ELSE 0 END AS kind_order
            FROM public.homework_logs
            WHERE homework_id = v_hw.id
        ) quotes
        WHERE q IS NOT NULL
        GROUP BY q
    ) unique_quotes;

    SELECT COALESCE(bool_or(kind = 'complete'), false),
           COALESCE(bool_or(kind = 'cant'), false)
    INTO v_has_complete, v_has_cant
    FROM public.homework_logs
    WHERE homework_id = v_hw.id;

    IF v_has_complete AND v_has_cant THEN
        v_record_summary := v_item_names || ' 일부는 완료, 일부는 진행이 어려우셨고';
    ELSIF v_has_complete THEN
        v_record_summary := v_item_names || ' 완료하셨고';
    ELSE
        v_record_summary := v_item_names || ' 진행이 어려우셨고';
    END IF;

    IF v_user_note IS NOT NULL THEN
        v_opening := '지난주에 ' || v_record_summary || ', "' || v_user_note || '" 하셔서 오늘은 그 부분부터 볼게요.';
    ELSIF v_has_complete AND NOT v_has_cant THEN
        v_opening := '지난주에 ' || v_item_names || ' 모두 완료하셔서 오늘은 다음 단계로 넘어갈게요.';
    ELSIF v_has_cant AND NOT v_has_complete THEN
        v_opening := '지난주에 ' || v_item_names || ' 진행이 어려우셨다고 하셔서 오늘은 부담 없는 쉬운 동작부터 다시 맞춰볼게요.';
    ELSE
        v_opening := '지난주에 전달드린 ' || v_item_names || ' 기록 확인하고 오늘 수업 이어갈게요.';
    END IF;

    UPDATE public.homework
    SET status = 'logged', opening_line = v_opening, updated_at = clock_timestamp()
    WHERE id = v_hw.id;

    RETURN jsonb_build_object(
        'success', true, 'log_id', v_log_id, 'pain_log_id', v_pain_log_id,
        'status', 'logged', 'opening_line', v_opening
    );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_homework_feedback(text, text, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_homework_feedback(text, text, boolean, text, text) TO anon, authenticated;
