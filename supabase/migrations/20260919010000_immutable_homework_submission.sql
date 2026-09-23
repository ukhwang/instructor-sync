-- Store one immutable, server-authored confirmation per homework. Existing
-- homework logs remain untouched and continue to support trainer reads.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.homework_submissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    homework_id uuid NOT NULL UNIQUE
        REFERENCES public.homework(id) ON DELETE CASCADE,
    snapshot jsonb NOT NULL,
    snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
    submitted_at timestamptz NOT NULL
);

ALTER TABLE public.homework_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trainers can view own homework submissions"
ON public.homework_submissions
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.homework
        WHERE public.homework.id = public.homework_submissions.homework_id
          AND public.homework.trainer_id = (SELECT auth.uid())
    )
);

REVOKE ALL ON TABLE public.homework_submissions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.homework_submissions TO authenticated;

-- The numeric RPC is the sole public final-submission path. Locking the
-- homework row serializes token revocation and concurrent confirmation calls.
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
    v_hw public.homework%ROWTYPE;
    v_log_id uuid;
    v_pain_log_id uuid;
    v_note text := NULLIF(BTRIM(p_note), '');
    v_item_names text;
    v_user_note text;
    v_has_complete boolean;
    v_has_cant boolean;
    v_record_summary text;
    v_opening text;
    v_exercises jsonb;
    v_snapshot jsonb;
    v_snapshot_hash text;
    v_submitted_at timestamptz;
BEGIN
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
    IF p_discomfort_level IS NULL
       OR p_discomfort_level < 1
       OR p_discomfort_level > 10 THEN
        RETURN jsonb_build_object('success', false, 'reason', 'invalid_discomfort_level');
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.homework_submissions
        WHERE homework_id = v_hw.id
    ) THEN
        RETURN jsonb_build_object('success', false, 'reason', 'already_submitted');
    END IF;

    SELECT COALESCE(
        jsonb_agg(
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
                'per_side', per_side
            ) ORDER BY order_index, id
        ),
        '[]'::jsonb
    ) INTO v_exercises
    FROM public.homework_items
    WHERE homework_id = v_hw.id;

    v_submitted_at := clock_timestamp();
    v_snapshot := jsonb_build_object(
        'version', 1,
        'homework_id', v_hw.id,
        'result', p_kind,
        'discomfort_level', p_discomfort_level,
        'note', v_note,
        'exercises', v_exercises,
        'submitted_at', v_submitted_at
    );
    v_snapshot_hash := encode(
        extensions.digest(convert_to(v_snapshot::text, 'UTF8'), 'sha256'),
        'hex'
    );

    INSERT INTO public.homework_submissions (
        homework_id, snapshot, snapshot_hash, submitted_at
    ) VALUES (
        v_hw.id, v_snapshot, v_snapshot_hash, v_submitted_at
    );

    INSERT INTO public.homework_logs (homework_id, kind, payload)
    VALUES (v_hw.id, p_kind, jsonb_strip_nulls(jsonb_build_object('note', v_note)))
    RETURNING id INTO v_log_id;

    INSERT INTO public.homework_logs (homework_id, kind, payload)
    VALUES (
        v_hw.id,
        'pain',
        jsonb_build_object(
            'pain_area', '현재 느끼는 불편함',
            'pain_level', p_discomfort_level
        )
    )
    RETURNING id INTO v_pain_log_id;

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
                   created_at,
                   CASE WHEN kind = 'pain' THEN 1 ELSE 0 END AS kind_order
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
    SET status = 'logged',
        opening_line = v_opening,
        updated_at = v_submitted_at
    WHERE id = v_hw.id;

    RETURN jsonb_build_object(
        'success', true,
        'log_id', v_log_id,
        'pain_log_id', v_pain_log_id,
        'status', 'logged',
        'opening_line', v_opening,
        'submitted_at', v_submitted_at,
        'snapshot_hash', v_snapshot_hash
    );
END;
$$;

-- Legacy public mutation entry points cannot create or append a second final
-- submission. They remain defined for schema compatibility but are no longer
-- executable through the Data API roles.
REVOKE ALL ON FUNCTION public.submit_homework_feedback(text, text, boolean, text, text)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_homework(text, text, jsonb)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.submit_homework_feedback(text, text, integer, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_homework_feedback(text, text, integer, text)
TO anon, authenticated;
