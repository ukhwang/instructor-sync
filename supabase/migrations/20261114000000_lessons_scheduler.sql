-- ─────────────────────────────────────────────────────────────────────────────
-- 4단계: 1인 원장 주간 타임블록 스케줄러 (lessons)
--
-- 불변조건
--  * 소유권: 수업은 같은 강사의 회원에게만 연결된다 (복합 FK + RPC 검사).
--  * 겹침 금지: 한 강사의 취소되지 않은 수업은 시간이 겹칠 수 없다 (exclusion).
--  * 원자성: 반복 예약은 전부 성공 또는 전부 실패. 수업 완료와 패키지 차감은 한 트랜잭션.
--  * 멱등성: 같은 series_id 재전송은 중복 수업을 만들지 않고, 완료 재시도는 이중 차감하지 않는다.
--  * 쓰기는 SECURITY DEFINER RPC 로만 한다. 테이블 직접 쓰기 권한은 주지 않는다.
--
-- 롤백: 아래 "ROLLBACK" 블록 참고 (데이터 보존이 필요하면 RPC REVOKE 만 수행).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'members_id_trainer_key'
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_id_trainer_key UNIQUE (id, trainer_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.lessons (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id    uuid NOT NULL,
  series_id    uuid NOT NULL,
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz NOT NULL,
  status       text NOT NULL DEFAULT 'scheduled',
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lessons_status_chk
    CHECK (status IN ('scheduled', 'completed', 'no_show', 'cancelled')),
  CONSTRAINT lessons_member_owner_fk FOREIGN KEY (member_id, trainer_id)
    REFERENCES public.members (id, trainer_id) ON DELETE CASCADE,
  CONSTRAINT lessons_duration_chk
    CHECK (ends_at - starts_at BETWEEN interval '10 minutes' AND interval '180 minutes'),
  CONSTRAINT lessons_completed_chk
    CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
  CONSTRAINT lessons_series_slot_key UNIQUE (trainer_id, series_id, starts_at),
  CONSTRAINT lessons_no_overlap EXCLUDE USING gist (
    trainer_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status <> 'cancelled')
);

CREATE INDEX IF NOT EXISTS lessons_trainer_time_idx ON public.lessons (trainer_id, starts_at);
CREATE INDEX IF NOT EXISTS lessons_member_time_idx ON public.lessons (member_id, starts_at DESC);

ALTER TABLE public.homework
  ADD COLUMN IF NOT EXISTS lesson_id uuid REFERENCES public.lessons(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS homework_lesson_idx ON public.homework (lesson_id) WHERE lesson_id IS NOT NULL;

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trainers can view own lessons" ON public.lessons;
CREATE POLICY "Trainers can view own lessons" ON public.lessons
  FOR SELECT TO authenticated
  USING (trainer_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.lessons FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.lessons TO authenticated;

-- ── 예약 생성 (반복 포함) ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_lessons(
  p_series_id uuid,
  p_member_id uuid,
  p_starts_at timestamptz,
  p_duration_min integer,
  p_repeat_weeks integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trainer_id uuid := (SELECT auth.uid());
  v_lessons jsonb;
BEGIN
  IF v_trainer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
  END IF;
  IF p_series_id IS NULL OR p_starts_at IS NULL
     OR p_duration_min IS NULL OR p_duration_min NOT BETWEEN 10 AND 180
     OR p_repeat_weeks IS NULL OR p_repeat_weeks NOT BETWEEN 0 AND 12 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_input');
  END IF;

  PERFORM 1 FROM public.members
  WHERE id = p_member_id AND trainer_id = v_trainer_id FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'member_not_found');
  END IF;

  -- 같은 series 의 기존 수업이 다른 회원이면 멱등 재전송이 아니라 충돌이다.
  IF EXISTS (
    SELECT 1 FROM public.lessons
    WHERE trainer_id = v_trainer_id AND series_id = p_series_id AND member_id <> p_member_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'request_payload_conflict');
  END IF;

  BEGIN
    INSERT INTO public.lessons (trainer_id, member_id, series_id, starts_at, ends_at)
    SELECT v_trainer_id, p_member_id, p_series_id,
           p_starts_at + make_interval(weeks => w),
           p_starts_at + make_interval(weeks => w, mins => p_duration_min)
    FROM generate_series(0, p_repeat_weeks) AS g(w)
    ON CONFLICT (trainer_id, series_id, starts_at) DO NOTHING;
  EXCEPTION WHEN exclusion_violation THEN
    RETURN jsonb_build_object('success', false, 'reason', 'time_conflict');
  END;

  SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.starts_at), '[]'::jsonb)
  INTO v_lessons
  FROM public.lessons AS l
  WHERE l.trainer_id = v_trainer_id AND l.series_id = p_series_id;

  RETURN jsonb_build_object('success', true, 'lessons', v_lessons);
END;
$$;

-- ── 시간 변경 (예정 상태만) ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reschedule_lesson(
  p_lesson_id uuid,
  p_starts_at timestamptz,
  p_duration_min integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trainer_id uuid := (SELECT auth.uid());
  v_lesson public.lessons%ROWTYPE;
BEGIN
  IF v_trainer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
  END IF;
  IF p_starts_at IS NULL OR p_duration_min IS NULL OR p_duration_min NOT BETWEEN 10 AND 180 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_input');
  END IF;

  SELECT * INTO v_lesson FROM public.lessons
  WHERE id = p_lesson_id AND trainer_id = v_trainer_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'lesson_not_found');
  END IF;
  IF v_lesson.status <> 'scheduled' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_status');
  END IF;

  BEGIN
    UPDATE public.lessons
       SET starts_at = p_starts_at,
           ends_at = p_starts_at + make_interval(mins => p_duration_min),
           updated_at = now()
     WHERE id = p_lesson_id
    RETURNING * INTO v_lesson;
  EXCEPTION
    WHEN exclusion_violation THEN
      RETURN jsonb_build_object('success', false, 'reason', 'time_conflict');
    WHEN unique_violation THEN
      RETURN jsonb_build_object('success', false, 'reason', 'time_conflict');
  END;

  RETURN jsonb_build_object('success', true, 'lesson', to_jsonb(v_lesson));
END;
$$;

-- ── 수업 완료 + 패키지 1회 차감 (원자적·멱등) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.complete_lesson(p_lesson_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trainer_id uuid := (SELECT auth.uid());
  v_lesson public.lessons%ROWTYPE;
  v_remaining integer;
BEGIN
  IF v_trainer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
  END IF;

  SELECT * INTO v_lesson FROM public.lessons
  WHERE id = p_lesson_id AND trainer_id = v_trainer_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'lesson_not_found');
  END IF;

  IF v_lesson.status = 'completed' THEN
    SELECT package_remaining INTO v_remaining FROM public.members
    WHERE id = v_lesson.member_id AND trainer_id = v_trainer_id;
    RETURN jsonb_build_object('success', true, 'replayed', true,
      'lesson', to_jsonb(v_lesson), 'package_remaining', v_remaining);
  END IF;
  IF v_lesson.status <> 'scheduled' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_status');
  END IF;

  UPDATE public.lessons
     SET status = 'completed', completed_at = now(), updated_at = now()
   WHERE id = p_lesson_id
  RETURNING * INTO v_lesson;

  UPDATE public.members
     SET package_remaining = GREATEST(package_remaining - 1, 0), updated_at = now()
   WHERE id = v_lesson.member_id AND trainer_id = v_trainer_id
  RETURNING package_remaining INTO v_remaining;

  RETURN jsonb_build_object('success', true, 'replayed', false,
    'lesson', to_jsonb(v_lesson), 'package_remaining', v_remaining);
END;
$$;

-- ── 완료 되돌리기 (오조작 복구, 차감 1회 복원·멱등) ───────────────────────────
CREATE OR REPLACE FUNCTION public.revert_lesson_completion(p_lesson_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trainer_id uuid := (SELECT auth.uid());
  v_lesson public.lessons%ROWTYPE;
  v_remaining integer;
BEGIN
  IF v_trainer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
  END IF;

  SELECT * INTO v_lesson FROM public.lessons
  WHERE id = p_lesson_id AND trainer_id = v_trainer_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'lesson_not_found');
  END IF;

  IF v_lesson.status = 'scheduled' THEN
    SELECT package_remaining INTO v_remaining FROM public.members
    WHERE id = v_lesson.member_id AND trainer_id = v_trainer_id;
    RETURN jsonb_build_object('success', true, 'replayed', true,
      'lesson', to_jsonb(v_lesson), 'package_remaining', v_remaining);
  END IF;
  IF v_lesson.status <> 'completed' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_status');
  END IF;

  UPDATE public.lessons
     SET status = 'scheduled', completed_at = NULL, updated_at = now()
   WHERE id = p_lesson_id
  RETURNING * INTO v_lesson;

  UPDATE public.members
     SET package_remaining = LEAST(package_remaining + 1, package_total), updated_at = now()
   WHERE id = v_lesson.member_id AND trainer_id = v_trainer_id
  RETURNING package_remaining INTO v_remaining;

  RETURN jsonb_build_object('success', true, 'replayed', false,
    'lesson', to_jsonb(v_lesson), 'package_remaining', v_remaining);
END;
$$;

-- ── 노쇼 / 취소 / 예정 복귀 (차감 없음) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_lesson_status(p_lesson_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trainer_id uuid := (SELECT auth.uid());
  v_lesson public.lessons%ROWTYPE;
BEGIN
  IF v_trainer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized');
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('scheduled', 'no_show', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_input');
  END IF;

  SELECT * INTO v_lesson FROM public.lessons
  WHERE id = p_lesson_id AND trainer_id = v_trainer_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'lesson_not_found');
  END IF;
  IF v_lesson.status = p_status THEN
    RETURN jsonb_build_object('success', true, 'replayed', true, 'lesson', to_jsonb(v_lesson));
  END IF;
  -- 완료된 수업은 revert_lesson_completion 으로만 되돌린다 (패키지 복원 보장).
  IF v_lesson.status = 'completed' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_status');
  END IF;

  BEGIN
    UPDATE public.lessons
       SET status = p_status, updated_at = now()
     WHERE id = p_lesson_id
    RETURNING * INTO v_lesson;
  EXCEPTION WHEN exclusion_violation THEN
    -- 취소된 수업을 되살릴 때 그 사이 다른 수업이 들어온 경우
    RETURN jsonb_build_object('success', false, 'reason', 'time_conflict');
  END;

  RETURN jsonb_build_object('success', true, 'replayed', false, 'lesson', to_jsonb(v_lesson));
END;
$$;

-- ── 숙제 ↔ 수업 연결 (원루프) ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.link_homework_to_lesson(p_homework_id uuid, p_lesson_id uuid)
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

  UPDATE public.homework AS h
     SET lesson_id = l.id, updated_at = now()
    FROM public.lessons AS l
   WHERE h.id = p_homework_id
     AND l.id = p_lesson_id
     AND h.trainer_id = v_trainer_id
     AND l.trainer_id = v_trainer_id
     AND h.member_id = l.member_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found');
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.create_lessons(uuid, uuid, timestamptz, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reschedule_lesson(uuid, timestamptz, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_lesson(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revert_lesson_completion(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_lesson_status(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.link_homework_to_lesson(uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_lessons(uuid, uuid, timestamptz, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_lesson(uuid, timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_lesson(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revert_lesson_completion(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_lesson_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_homework_to_lesson(uuid, uuid) TO authenticated;

-- ROLLBACK (데이터 폐기 허용 시):
--   REVOKE EXECUTE ON FUNCTION public.create_lessons(uuid, uuid, timestamptz, integer, integer),
--     public.reschedule_lesson(uuid, timestamptz, integer), public.complete_lesson(uuid),
--     public.revert_lesson_completion(uuid), public.set_lesson_status(uuid, text),
--     public.link_homework_to_lesson(uuid, uuid) FROM authenticated;
--   ALTER TABLE public.homework DROP COLUMN IF EXISTS lesson_id;
--   DROP TABLE IF EXISTS public.lessons;
--   ALTER TABLE public.members DROP CONSTRAINT IF EXISTS members_id_trainer_key;
