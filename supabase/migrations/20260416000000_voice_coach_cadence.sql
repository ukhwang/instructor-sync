-- Voice coach cadence fields on homework_items + exercise_library defaults.
-- Runtime source of truth is homework_items (copied at assign time).

ALTER TABLE public.homework_items
    ADD COLUMN IF NOT EXISTS effort_kind text NOT NULL DEFAULT 'reps',
    ADD COLUMN IF NOT EXISTS reps integer,
    ADD COLUMN IF NOT EXISTS hold_seconds integer,
    ADD COLUMN IF NOT EXISTS seconds_per_rep numeric(4,1) NOT NULL DEFAULT 3.0,
    ADD COLUMN IF NOT EXISTS rest_seconds integer NOT NULL DEFAULT 20,
    ADD COLUMN IF NOT EXISTS per_side boolean NOT NULL DEFAULT false;

ALTER TABLE public.exercise_library
    ADD COLUMN IF NOT EXISTS default_effort_kind text NOT NULL DEFAULT 'reps',
    ADD COLUMN IF NOT EXISTS default_rep_count integer,
    ADD COLUMN IF NOT EXISTS default_hold_seconds integer,
    ADD COLUMN IF NOT EXISTS default_seconds_per_rep numeric(4,1) NOT NULL DEFAULT 3.0,
    ADD COLUMN IF NOT EXISTS default_rest_seconds integer NOT NULL DEFAULT 20,
    ADD COLUMN IF NOT EXISTS default_per_side boolean NOT NULL DEFAULT false;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'homework_items_effort_kind_check'
    ) THEN
        ALTER TABLE public.homework_items
            ADD CONSTRAINT homework_items_effort_kind_check
            CHECK (effort_kind IN ('reps', 'hold'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'exercise_library_default_effort_kind_check'
    ) THEN
        ALTER TABLE public.exercise_library
            ADD CONSTRAINT exercise_library_default_effort_kind_check
            CHECK (default_effort_kind IN ('reps', 'hold'));
    END IF;
END $$;

-- Backfill from existing Korean display labels.
UPDATE public.homework_items
SET
    per_side = (target_reps LIKE '%각%'),
    effort_kind = CASE
        WHEN target_reps ~ '초' AND target_reps !~ '회' THEN 'hold'
        ELSE 'reps'
    END,
    hold_seconds = CASE
        WHEN target_reps ~ '초' AND target_reps !~ '회'
            THEN GREATEST(1, LEAST(300, COALESCE(NULLIF(substring(target_reps FROM '([0-9]+)'), '')::integer, 30)))
        ELSE NULL
    END,
    reps = CASE
        WHEN target_reps ~ '초' AND target_reps !~ '회' THEN NULL
        ELSE GREATEST(1, LEAST(50, COALESCE(NULLIF(substring(target_reps FROM '([0-9]+)'), '')::integer, 10)))
    END,
    seconds_per_rep = CASE
        WHEN target_reps ~ '회' AND target_reps ~ '초'
            THEN GREATEST(0.5, LEAST(10, COALESCE(NULLIF(substring(target_reps FROM '([0-9]+)\s*초'), '')::numeric, 3.0)))
        ELSE 3.0
    END;

UPDATE public.exercise_library
SET
    default_per_side = (default_reps LIKE '%각%'),
    default_effort_kind = CASE
        WHEN default_reps ~ '초' AND default_reps !~ '회' THEN 'hold'
        ELSE 'reps'
    END,
    default_hold_seconds = CASE
        WHEN default_reps ~ '초' AND default_reps !~ '회'
            THEN GREATEST(1, LEAST(300, COALESCE(NULLIF(substring(default_reps FROM '([0-9]+)'), '')::integer, 30)))
        ELSE NULL
    END,
    default_rep_count = CASE
        WHEN default_reps ~ '초' AND default_reps !~ '회' THEN NULL
        ELSE GREATEST(1, LEAST(50, COALESCE(NULLIF(substring(default_reps FROM '([0-9]+)'), '')::integer, 10)))
    END;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'homework_items_effort_shape'
    ) THEN
        ALTER TABLE public.homework_items
            ADD CONSTRAINT homework_items_effort_shape CHECK (
                (effort_kind = 'reps' AND reps IS NOT NULL AND reps BETWEEN 1 AND 50)
                OR (effort_kind = 'hold' AND hold_seconds IS NOT NULL AND hold_seconds BETWEEN 1 AND 300)
            );
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'homework_items_seconds_per_rep_check'
    ) THEN
        ALTER TABLE public.homework_items
            ADD CONSTRAINT homework_items_seconds_per_rep_check
            CHECK (seconds_per_rep BETWEEN 0.5 AND 10);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'homework_items_rest_seconds_check'
    ) THEN
        ALTER TABLE public.homework_items
            ADD CONSTRAINT homework_items_rest_seconds_check
            CHECK (rest_seconds BETWEEN 0 AND 180);
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.open_homework(p_token text)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hw RECORD;
    v_member RECORD;
    v_items JSONB;
    v_logs JSONB;
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

    IF v_hw.token_expires_at < timezone('utc'::text, now()) THEN
        RETURN jsonb_build_object('success', false, 'reason', 'expired');
    END IF;

    IF v_hw.status IN ('draft', 'sent') THEN
        UPDATE public.homework
        SET status = 'opened', updated_at = timezone('utc'::text, now())
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
            'per_side', per_side
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
        'member', jsonb_build_object(
            'name', v_member.name
        ),
        'items', COALESCE(v_items, '[]'::jsonb),
        'logs', COALESCE(v_logs, '[]'::jsonb)
    );
END;
$$;
