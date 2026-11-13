-- ─────────────────────────────────────────────────────────────────────────────
-- 마일스톤 리포트: 비밀 링크 + 실제 제출 기록만 노출
--
-- 불변조건
--  * 리포트 링크는 24자리 hex 비밀 토큰. 회원 ID 등 추측 가능한 값으로 만들지 않는다.
--  * 링크는 30일 뒤 만료되고, 원장이 언제든 회수할 수 있다.
--  * 공개 조회(open_milestone_report)는 회원 이름과 숙제·제출 집계에 필요한 필드만 돌려준다.
--    연락처·목표·메모 원문 등은 돌려주지 않는다.
--  * 쓰기는 SECURITY DEFINER RPC 로만 한다.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.milestone_reports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id      uuid NOT NULL,
  token          text NOT NULL,
  session_number integer NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  revoked_at     timestamptz,
  CONSTRAINT milestone_reports_token_key UNIQUE (token),
  CONSTRAINT milestone_reports_token_format CHECK (token ~ '^[0-9a-f]{24}$'),
  CONSTRAINT milestone_reports_session_chk CHECK (session_number BETWEEN 1 AND 999),
  CONSTRAINT milestone_reports_expiry_chk CHECK (expires_at > created_at),
  CONSTRAINT milestone_reports_member_owner_fk FOREIGN KEY (member_id, trainer_id)
    REFERENCES public.members (id, trainer_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS milestone_reports_member_idx
  ON public.milestone_reports (member_id, created_at DESC);

ALTER TABLE public.milestone_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trainers can view own milestone reports" ON public.milestone_reports;
CREATE POLICY "Trainers can view own milestone reports" ON public.milestone_reports
  FOR SELECT TO authenticated
  USING (trainer_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.milestone_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.milestone_reports TO authenticated;

-- ── 원장: 리포트 링크 발급 ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_milestone_report(p_member_id uuid, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trainer_id uuid := (SELECT auth.uid());
  v_member public.members%ROWTYPE;
  v_session integer;
  v_report public.milestone_reports%ROWTYPE;
BEGIN
  IF v_trainer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
  END IF;
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{24}$' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_token');
  END IF;

  SELECT * INTO v_member FROM public.members
  WHERE id = p_member_id AND trainer_id = v_trainer_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'member_not_found');
  END IF;

  v_session := LEAST(999, GREATEST(1, COALESCE(v_member.package_total, 0) - COALESCE(v_member.package_remaining, 0)));

  INSERT INTO public.milestone_reports (trainer_id, member_id, token, session_number, expires_at)
  VALUES (v_trainer_id, p_member_id, p_token, v_session, now() + interval '30 days')
  RETURNING * INTO v_report;

  RETURN jsonb_build_object(
    'success', true,
    'token', v_report.token,
    'session_number', v_report.session_number,
    'expires_at', v_report.expires_at
  );
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'reason', 'invalid_token');
END;
$$;

-- ── 원장: 리포트 링크 회수 ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revoke_milestone_report(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trainer_id uuid := (SELECT auth.uid());
BEGIN
  IF v_trainer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
  END IF;
  UPDATE public.milestone_reports
     SET revoked_at = COALESCE(revoked_at, now())
   WHERE token = p_token AND trainer_id = v_trainer_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found');
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── 공개: 리포트 열기 (회원·가족) ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.open_milestone_report(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_report public.milestone_reports%ROWTYPE;
  v_member_name text;
  v_studio_name text;
  v_homeworks jsonb;
  v_submissions jsonb;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{24}$' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found');
  END IF;

  SELECT * INTO v_report FROM public.milestone_reports WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found');
  END IF;
  IF v_report.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'revoked');
  END IF;
  IF v_report.expires_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'reason', 'expired');
  END IF;

  SELECT name INTO v_member_name FROM public.members
  WHERE id = v_report.member_id AND trainer_id = v_report.trainer_id;
  IF v_member_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found');
  END IF;

  SELECT NULLIF(btrim(name), '') INTO v_studio_name FROM public.profiles WHERE id = v_report.trainer_id;

  -- 리포트 발급 시점까지의 숙제 (최근 60건)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', h.id, 'created_at', h.created_at, 'status', h.status)
                            ORDER BY h.created_at), '[]'::jsonb)
  INTO v_homeworks
  FROM (
    SELECT id, created_at, status FROM public.homework
    WHERE member_id = v_report.member_id
      AND trainer_id = v_report.trainer_id
      AND revoked_at IS NULL
      AND status NOT IN ('draft', 'revoked')
      AND created_at <= v_report.created_at
    ORDER BY created_at DESC
    LIMIT 60
  ) AS h;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'homework_id', s.homework_id,
           'submitted_at', s.submitted_at,
           'result', s.snapshot ->> 'result',
           'discomfort_level', s.snapshot -> 'discomfort_level',
           'note', s.snapshot ->> 'note'
         ) ORDER BY s.submitted_at), '[]'::jsonb)
  INTO v_submissions
  FROM public.homework_submissions AS s
  JOIN public.homework AS h ON h.id = s.homework_id
  WHERE h.member_id = v_report.member_id
    AND h.trainer_id = v_report.trainer_id
    AND h.revoked_at IS NULL
    AND h.created_at <= v_report.created_at
    AND s.submitted_at <= v_report.created_at;

  RETURN jsonb_build_object(
    'success', true,
    'member_name', v_member_name,
    'studio_name', v_studio_name,
    'session_number', v_report.session_number,
    'created_at', v_report.created_at,
    'homeworks', v_homeworks,
    'submissions', v_submissions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_milestone_report(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_milestone_report(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.open_milestone_report(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_milestone_report(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_milestone_report(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_milestone_report(text) TO anon, authenticated;

-- ROLLBACK:
--   REVOKE EXECUTE ON FUNCTION public.open_milestone_report(text) FROM anon, authenticated;
--   DROP FUNCTION IF EXISTS public.open_milestone_report(text), public.revoke_milestone_report(text),
--     public.create_milestone_report(uuid, text);
--   DROP TABLE IF EXISTS public.milestone_reports;
