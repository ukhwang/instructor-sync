-- Member onboarding and pre-existing record import.
-- Imported material remains separate from actual session notes and homework logs.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'members_package_total_positive'
      AND conrelid = 'public.members'::regclass
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_package_total_positive
      CHECK (package_total >= 1) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'members_package_remaining_range'
      AND conrelid = 'public.members'::regclass
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_package_remaining_range
      CHECK (package_remaining >= 0 AND package_remaining <= package_total) NOT VALID;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.member_import_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'existing_note'
    CHECK (source_type IN ('direct_entry', 'existing_note', 'conversation', 'other')),
  raw_text TEXT NOT NULL CHECK (char_length(btrim(raw_text)) BETWEEN 1 AND 20000),
  summary TEXT CHECK (summary IS NULL OR char_length(summary) <= 2000),
  recorded_from DATE,
  recorded_to DATE,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT member_import_records_date_order
    CHECK (recorded_from IS NULL OR recorded_to IS NULL OR recorded_from <= recorded_to),
  CONSTRAINT member_import_records_request_unique UNIQUE (trainer_id, request_id)
);

CREATE INDEX IF NOT EXISTS idx_member_import_records_member_imported
  ON public.member_import_records(member_id, imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_import_records_trainer
  ON public.member_import_records(trainer_id);

CREATE TABLE IF NOT EXISTS public.member_onboarding_requests (
  trainer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  request_payload JSONB NOT NULL,
  member_id UUID REFERENCES public.members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (trainer_id, request_id)
);

CREATE INDEX IF NOT EXISTS idx_member_onboarding_requests_member
  ON public.member_onboarding_requests(member_id);

ALTER TABLE public.member_import_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_onboarding_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trainers can view own imported member records"
  ON public.member_import_records;
CREATE POLICY "Trainers can view own imported member records"
  ON public.member_import_records
  FOR SELECT
  TO authenticated
  USING (trainer_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.member_import_records FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.member_import_records TO authenticated;
REVOKE ALL ON TABLE public.member_onboarding_requests FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_member_with_import(
  p_request_id UUID,
  p_member_kind TEXT,
  p_name TEXT,
  p_phone TEXT,
  p_package_total INTEGER,
  p_package_remaining INTEGER,
  p_package_expires_on DATE,
  p_end_state TEXT,
  p_import_source_type TEXT,
  p_import_raw_text TEXT,
  p_import_summary TEXT,
  p_import_recorded_from DATE,
  p_import_recorded_to DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trainer_id UUID := (SELECT auth.uid());
  v_remaining INTEGER;
  v_payload JSONB;
  v_member public.members%ROWTYPE;
  v_import public.member_import_records%ROWTYPE;
  v_existing_payload JSONB;
  v_existing_member_id UUID;
  v_won_request BOOLEAN := FALSE;
BEGIN
  IF v_trainer_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'request_id_required';
  END IF;
  IF p_member_kind NOT IN ('new', 'existing') THEN
    RAISE EXCEPTION 'invalid_member_kind';
  END IF;
  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;
  IF p_phone IS NULL OR char_length(btrim(p_phone)) NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'invalid_phone';
  END IF;
  IF p_end_state IS NULL OR char_length(btrim(p_end_state)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'invalid_end_state';
  END IF;
  IF p_package_total IS NULL OR p_package_total < 1 OR p_package_total > 1000 THEN
    RAISE EXCEPTION 'invalid_package_total';
  END IF;

  v_remaining := CASE WHEN p_member_kind = 'new' THEN p_package_total ELSE p_package_remaining END;
  IF v_remaining IS NULL OR v_remaining < 0 OR v_remaining > p_package_total THEN
    RAISE EXCEPTION 'invalid_package_remaining';
  END IF;

  IF NULLIF(btrim(COALESCE(p_import_raw_text, '')), '') IS NOT NULL THEN
    IF char_length(btrim(p_import_raw_text)) > 20000 THEN
      RAISE EXCEPTION 'import_text_too_long';
    END IF;
    IF p_import_source_type NOT IN ('direct_entry', 'existing_note', 'conversation', 'other') THEN
      RAISE EXCEPTION 'invalid_import_source';
    END IF;
    IF p_import_summary IS NOT NULL AND char_length(p_import_summary) > 2000 THEN
      RAISE EXCEPTION 'import_summary_too_long';
    END IF;
    IF p_import_recorded_from IS NOT NULL AND p_import_recorded_to IS NOT NULL
       AND p_import_recorded_from > p_import_recorded_to THEN
      RAISE EXCEPTION 'invalid_import_date_range';
    END IF;
  END IF;

  v_payload := jsonb_build_object(
    'member_kind', p_member_kind,
    'name', btrim(p_name),
    'phone', btrim(p_phone),
    'package_total', p_package_total,
    'package_remaining', v_remaining,
    'package_expires_on', p_package_expires_on,
    'end_state', btrim(p_end_state),
    'import_source_type', p_import_source_type,
    'import_raw_text', NULLIF(btrim(COALESCE(p_import_raw_text, '')), ''),
    'import_summary', NULLIF(btrim(COALESCE(p_import_summary, '')), ''),
    'import_recorded_from', p_import_recorded_from,
    'import_recorded_to', p_import_recorded_to
  );

  INSERT INTO public.member_onboarding_requests
    (trainer_id, request_id, request_payload)
  VALUES (v_trainer_id, p_request_id, v_payload)
  ON CONFLICT (trainer_id, request_id) DO NOTHING
  RETURNING TRUE INTO v_won_request;

  IF NOT COALESCE(v_won_request, FALSE) THEN
    SELECT request_payload, member_id
      INTO v_existing_payload, v_existing_member_id
    FROM public.member_onboarding_requests
    WHERE trainer_id = v_trainer_id AND request_id = p_request_id;

    IF v_existing_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'request_payload_conflict';
    END IF;
    IF v_existing_member_id IS NULL THEN
      RAISE EXCEPTION 'request_incomplete';
    END IF;

    SELECT * INTO v_member FROM public.members WHERE id = v_existing_member_id;
    SELECT * INTO v_import
      FROM public.member_import_records
      WHERE trainer_id = v_trainer_id AND request_id = p_request_id;

    RETURN jsonb_build_object(
      'success', TRUE,
      'member', to_jsonb(v_member),
      'import_record', CASE WHEN v_import.id IS NULL THEN NULL ELSE to_jsonb(v_import) END,
      'replayed', TRUE
    );
  END IF;

  INSERT INTO public.members (
    trainer_id, name, phone, package_total, package_remaining,
    package_expires_on, end_state
  ) VALUES (
    v_trainer_id, btrim(p_name), btrim(p_phone), p_package_total, v_remaining,
    p_package_expires_on, btrim(p_end_state)
  ) RETURNING * INTO v_member;

  IF NULLIF(btrim(COALESCE(p_import_raw_text, '')), '') IS NOT NULL THEN
    INSERT INTO public.member_import_records (
      trainer_id, member_id, request_id, source_type, raw_text, summary,
      recorded_from, recorded_to
    ) VALUES (
      v_trainer_id, v_member.id, p_request_id, p_import_source_type,
      btrim(p_import_raw_text), NULLIF(btrim(COALESCE(p_import_summary, '')), ''),
      p_import_recorded_from, p_import_recorded_to
    ) RETURNING * INTO v_import;
  END IF;

  UPDATE public.member_onboarding_requests
  SET member_id = v_member.id
  WHERE trainer_id = v_trainer_id AND request_id = p_request_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'member', to_jsonb(v_member),
    'import_record', CASE WHEN v_import.id IS NULL THEN NULL ELSE to_jsonb(v_import) END,
    'replayed', FALSE
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.add_member_import_record(
  p_request_id UUID,
  p_member_id UUID,
  p_source_type TEXT,
  p_raw_text TEXT,
  p_summary TEXT,
  p_recorded_from DATE,
  p_recorded_to DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trainer_id UUID := (SELECT auth.uid());
  v_record public.member_import_records%ROWTYPE;
BEGIN
  IF v_trainer_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'request_id_required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.members
    WHERE id = p_member_id AND trainer_id = v_trainer_id
  ) THEN
    RAISE EXCEPTION 'member_not_found';
  END IF;
  IF p_source_type NOT IN ('direct_entry', 'existing_note', 'conversation', 'other') THEN
    RAISE EXCEPTION 'invalid_import_source';
  END IF;
  IF p_raw_text IS NULL OR char_length(btrim(p_raw_text)) NOT BETWEEN 1 AND 20000 THEN
    RAISE EXCEPTION 'invalid_import_text';
  END IF;
  IF p_summary IS NOT NULL AND char_length(p_summary) > 2000 THEN
    RAISE EXCEPTION 'import_summary_too_long';
  END IF;
  IF p_recorded_from IS NOT NULL AND p_recorded_to IS NOT NULL
     AND p_recorded_from > p_recorded_to THEN
    RAISE EXCEPTION 'invalid_import_date_range';
  END IF;

  INSERT INTO public.member_import_records (
    trainer_id, member_id, request_id, source_type, raw_text, summary,
    recorded_from, recorded_to
  ) VALUES (
    v_trainer_id, p_member_id, p_request_id, p_source_type, btrim(p_raw_text),
    NULLIF(btrim(COALESCE(p_summary, '')), ''), p_recorded_from, p_recorded_to
  )
  ON CONFLICT (trainer_id, request_id) DO NOTHING
  RETURNING * INTO v_record;

  IF v_record.id IS NULL THEN
    SELECT * INTO v_record
    FROM public.member_import_records
    WHERE trainer_id = v_trainer_id AND request_id = p_request_id;

    IF v_record.member_id IS DISTINCT FROM p_member_id
       OR v_record.source_type IS DISTINCT FROM p_source_type
       OR v_record.raw_text IS DISTINCT FROM btrim(p_raw_text)
       OR v_record.summary IS DISTINCT FROM NULLIF(btrim(COALESCE(p_summary, '')), '')
       OR v_record.recorded_from IS DISTINCT FROM p_recorded_from
       OR v_record.recorded_to IS DISTINCT FROM p_recorded_to THEN
      RAISE EXCEPTION 'request_payload_conflict';
    END IF;
  END IF;

  RETURN jsonb_build_object('success', TRUE, 'import_record', to_jsonb(v_record));
END;
$$;

REVOKE ALL ON FUNCTION public.register_member_with_import(
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, DATE, TEXT, TEXT, TEXT, TEXT, DATE, DATE
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_member_with_import(
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, DATE, TEXT, TEXT, TEXT, TEXT, DATE, DATE
) TO authenticated;

REVOKE ALL ON FUNCTION public.add_member_import_record(
  UUID, UUID, TEXT, TEXT, TEXT, DATE, DATE
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_member_import_record(
  UUID, UUID, TEXT, TEXT, TEXT, DATE, DATE
) TO authenticated;

-- Tighten two legacy trainer RPCs surfaced by the production security advisor.
-- revoke_homework remains an authenticated trainer action; the unused
-- self-service Pro toggle is not callable through Data API roles.
ALTER FUNCTION public.revoke_homework(UUID) SET search_path = '';
REVOKE ALL ON FUNCTION public.revoke_homework(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_homework(UUID) TO authenticated;

ALTER FUNCTION public.toggle_pro_status() SET search_path = '';
REVOKE ALL ON FUNCTION public.toggle_pro_status() FROM PUBLIC, anon, authenticated;
