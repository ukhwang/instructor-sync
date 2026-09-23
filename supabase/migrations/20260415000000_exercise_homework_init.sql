-- ==============================================================================
-- Exercise Homework (운동숙제) — Supabase Postgres Schema & Migration
-- ==============================================================================

-- 1. PROFILES (Trainer Profiles)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    email TEXT,
    name TEXT,
    is_pro BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. MEMBERS (Trainer's Members)
CREATE TABLE IF NOT EXISTS public.members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    package_total INTEGER NOT NULL DEFAULT 10,
    package_remaining INTEGER NOT NULL DEFAULT 10,
    package_expires_on DATE,
    end_state TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. HOMEWORK (Exercise Homework assigned to a member)
CREATE TABLE IF NOT EXISTS public.homework (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    member_id UUID REFERENCES public.members(id) ON DELETE CASCADE NOT NULL,
    token TEXT UNIQUE NOT NULL,
    token_expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    why TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'opened', 'logged', 'revoked')),
    opening_line TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. HOMEWORK_ITEMS (1~3 movement items per homework)
CREATE TABLE IF NOT EXISTS public.homework_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    homework_id UUID REFERENCES public.homework(id) ON DELETE CASCADE NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 1 CHECK (order_index BETWEEN 1 AND 3),
    name TEXT NOT NULL,
    cue TEXT NOT NULL DEFAULT '',
    target_sets INTEGER NOT NULL DEFAULT 3,
    target_reps TEXT NOT NULL DEFAULT '10회',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. HOMEWORK_LOGS (Append-only member submission logs)
CREATE TABLE IF NOT EXISTS public.homework_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    homework_id UUID REFERENCES public.homework(id) ON DELETE CASCADE NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('complete', 'cant', 'pain', 'note')),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. SESSION_NOTES (Trainer session notes)
CREATE TABLE IF NOT EXISTS public.session_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trainer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    member_id UUID REFERENCES public.members(id) ON DELETE CASCADE NOT NULL,
    note TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. EXERCISE_LIBRARY (Seed movement library)
CREATE TABLE IF NOT EXISTS public.exercise_library (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    default_cue TEXT NOT NULL DEFAULT '',
    default_sets INTEGER NOT NULL DEFAULT 3,
    default_reps TEXT NOT NULL DEFAULT '10회',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_members_trainer_id ON public.members(trainer_id);
CREATE INDEX IF NOT EXISTS idx_homework_trainer_id ON public.homework(trainer_id);
CREATE INDEX IF NOT EXISTS idx_homework_member_id ON public.homework(member_id);
CREATE INDEX IF NOT EXISTS idx_homework_token ON public.homework(token);
CREATE INDEX IF NOT EXISTS idx_homework_items_homework_id ON public.homework_items(homework_id);
CREATE INDEX IF NOT EXISTS idx_homework_logs_homework_id ON public.homework_logs(homework_id);
CREATE INDEX IF NOT EXISTS idx_session_notes_member_id ON public.session_notes(member_id);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_library ENABLE ROW LEVEL SECURITY;

-- Profiles: Trainers can view and update own profile
CREATE POLICY "Trainers can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Trainers can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Trainers can insert own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Members: Trainers can CRUD their own members only
CREATE POLICY "Trainers can view own members" ON public.members
    FOR SELECT USING (auth.uid() = trainer_id);

CREATE POLICY "Trainers can insert own members" ON public.members
    FOR INSERT WITH CHECK (auth.uid() = trainer_id);

CREATE POLICY "Trainers can update own members" ON public.members
    FOR UPDATE USING (auth.uid() = trainer_id);

CREATE POLICY "Trainers can delete own members" ON public.members
    FOR DELETE USING (auth.uid() = trainer_id);

-- Homework: Trainers can CRUD their own homework
CREATE POLICY "Trainers can view own homework" ON public.homework
    FOR SELECT USING (auth.uid() = trainer_id);

CREATE POLICY "Trainers can insert own homework" ON public.homework
    FOR INSERT WITH CHECK (auth.uid() = trainer_id);

CREATE POLICY "Trainers can update own homework" ON public.homework
    FOR UPDATE USING (auth.uid() = trainer_id);

CREATE POLICY "Trainers can delete own homework" ON public.homework
    FOR DELETE USING (auth.uid() = trainer_id);

-- Homework Items: Trainers can CRUD items for their own homework
CREATE POLICY "Trainers can view own homework items" ON public.homework_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.homework
            WHERE public.homework.id = public.homework_items.homework_id
            AND public.homework.trainer_id = auth.uid()
        )
    );

CREATE POLICY "Trainers can insert own homework items" ON public.homework_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.homework
            WHERE public.homework.id = public.homework_items.homework_id
            AND public.homework.trainer_id = auth.uid()
        )
    );

CREATE POLICY "Trainers can update own homework items" ON public.homework_items
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.homework
            WHERE public.homework.id = public.homework_items.homework_id
            AND public.homework.trainer_id = auth.uid()
        )
    );

CREATE POLICY "Trainers can delete own homework items" ON public.homework_items
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.homework
            WHERE public.homework.id = public.homework_items.homework_id
            AND public.homework.trainer_id = auth.uid()
        )
    );

-- Homework Logs: Trainers can view logs for their own homework
CREATE POLICY "Trainers can view own homework logs" ON public.homework_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.homework
            WHERE public.homework.id = public.homework_logs.homework_id
            AND public.homework.trainer_id = auth.uid()
        )
    );

-- Session Notes: Trainers can CRUD own session notes
CREATE POLICY "Trainers can view own session notes" ON public.session_notes
    FOR SELECT USING (auth.uid() = trainer_id);

CREATE POLICY "Trainers can insert own session notes" ON public.session_notes
    FOR INSERT WITH CHECK (auth.uid() = trainer_id);

CREATE POLICY "Trainers can update own session notes" ON public.session_notes
    FOR UPDATE USING (auth.uid() = trainer_id);

CREATE POLICY "Trainers can delete own session notes" ON public.session_notes
    FOR DELETE USING (auth.uid() = trainer_id);

-- Exercise Library: All authenticated users can read
CREATE POLICY "Authenticated users can read exercise library" ON public.exercise_library
    FOR SELECT TO authenticated USING (true);

-- Anon users cannot directly access any table; only via SECURITY DEFINER RPCs!

-- ==============================================================================
-- SECURITY DEFINER RPC FUNCTIONS
-- ==============================================================================

-- 1. open_homework(p_token text)
-- Called when a member opens /h/[token]
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

    -- Update status to opened if it was draft or sent
    IF v_hw.status IN ('draft', 'sent') THEN
        UPDATE public.homework
        SET status = 'opened', updated_at = timezone('utc'::text, now())
        WHERE id = v_hw.id;
        v_hw.status := 'opened';
    END IF;

    -- Get member info
    SELECT id, name INTO v_member
    FROM public.members
    WHERE id = v_hw.member_id;

    -- Get homework items
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', id,
            'order_index', order_index,
            'name', name,
            'cue', cue,
            'target_sets', target_sets,
            'target_reps', target_reps
        ) ORDER BY order_index ASC
    ) INTO v_items
    FROM public.homework_items
    WHERE homework_id = v_hw.id;

    -- Get previous logs if any
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
            'token', v_hw.token,
            'token_expires_at', v_hw.token_expires_at,
            'created_at', v_hw.created_at
        ),
        'member', jsonb_build_object(
            'id', v_member.id,
            'name', v_member.name
        ),
        'items', COALESCE(v_items, '[]'::jsonb),
        'logs', COALESCE(v_logs, '[]'::jsonb)
    );
END;
$$;

-- 2. log_homework(p_token text, p_kind text, p_payload jsonb)
-- Called when a member submits a log (complete, cant, pain, note)
CREATE OR REPLACE FUNCTION public.log_homework(p_token text, p_kind text, p_payload jsonb)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hw RECORD;
    v_log_id UUID;
    v_item_names TEXT;
    v_opening TEXT;
    v_user_note TEXT;
    v_has_complete BOOLEAN;
    v_has_cant BOOLEAN;
    v_record_summary TEXT;
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

    IF p_kind NOT IN ('complete', 'cant', 'pain', 'note') THEN
        RETURN jsonb_build_object('success', false, 'reason', 'invalid_kind');
    END IF;

    -- Insert log
    INSERT INTO public.homework_logs (homework_id, kind, payload)
    VALUES (v_hw.id, p_kind, COALESCE(p_payload, '{}'::jsonb))
    RETURNING id INTO v_log_id;

    SELECT string_agg(name, ', ') INTO v_item_names
    FROM public.homework_items
    WHERE homework_id = v_hw.id;

    v_item_names := COALESCE(v_item_names, '운동숙제');

    SELECT string_agg(DISTINCT q, ', ') INTO v_user_note
    FROM (
        SELECT NULLIF(BTRIM(COALESCE(payload->>'note', '') || CASE
            WHEN COALESCE(payload->>'pain_area', '') <> '' AND COALESCE(payload->>'note', '') <> payload->>'pain_area'
            THEN ' ' || (payload->>'pain_area') ELSE '' END), '') AS q
        FROM public.homework_logs
        WHERE homework_id = v_hw.id
    ) quotes
    WHERE q IS NOT NULL AND length(q) > 0;

    SELECT EXISTS(SELECT 1 FROM public.homework_logs WHERE homework_id = v_hw.id AND kind = 'complete') INTO v_has_complete;
    SELECT EXISTS(SELECT 1 FROM public.homework_logs WHERE homework_id = v_hw.id AND kind = 'cant') INTO v_has_cant;

    IF v_has_complete AND v_has_cant THEN
        v_record_summary := v_item_names || ' 일부는 완료, 일부는 진행이 어려우셨고';
    ELSIF v_has_complete THEN
        v_record_summary := v_item_names || ' 완료하셨고';
    ELSIF v_has_cant THEN
        v_record_summary := v_item_names || ' 진행이 어려우셨고';
    ELSE
        v_record_summary := v_item_names || ' 기록 확인하셨고';
    END IF;

    IF v_user_note IS NOT NULL AND length(v_user_note) > 0 THEN
        v_opening := '지난주에 ' || v_record_summary || ', "' || v_user_note || '" 하셔서 오늘은 그 부분부터 볼게요.';
    ELSIF v_has_complete AND NOT v_has_cant THEN
        v_opening := '지난주에 ' || v_item_names || ' 모두 완료하셔서 오늘은 다음 단계로 넘어갈게요.';
    ELSIF v_has_cant AND NOT v_has_complete THEN
        v_opening := '지난주에 ' || v_item_names || ' 진행이 어려우셨다고 하셔서 오늘은 부담 없는 쉬운 동작부터 다시 맞춰볼게요.';
    ELSE
        v_opening := '지난주에 전달드린 ' || v_item_names || ' 기록 확인하고 오늘 수업 이어갈게요.';
    END IF;

    -- Update homework status and opening_line
    UPDATE public.homework
    SET status = 'logged',
        opening_line = v_opening,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_hw.id;

    RETURN jsonb_build_object(
        'success', true,
        'log_id', v_log_id,
        'status', 'logged',
        'opening_line', v_opening
    );
END;
$$;

-- 3. revoke_homework(p_homework_id uuid)
CREATE OR REPLACE FUNCTION public.revoke_homework(p_homework_id uuid)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hw RECORD;
BEGIN
    SELECT * INTO v_hw
    FROM public.homework
    WHERE id = p_homework_id AND trainer_id = auth.uid();

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'not_found_or_unauthorized');
    END IF;

    UPDATE public.homework
    SET revoked_at = timezone('utc'::text, now()),
        status = 'revoked',
        updated_at = timezone('utc'::text, now())
    WHERE id = p_homework_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. toggle_pro_status()
CREATE OR REPLACE FUNCTION public.toggle_pro_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_pro BOOLEAN;
BEGIN
    SELECT is_pro INTO v_is_pro
    FROM public.profiles
    WHERE id = auth.uid();

    IF NOT FOUND THEN
        INSERT INTO public.profiles (id, is_pro)
        VALUES (auth.uid(), TRUE)
        RETURNING is_pro INTO v_is_pro;
    ELSE
        UPDATE public.profiles
        SET is_pro = NOT v_is_pro
        WHERE id = auth.uid()
        RETURNING is_pro INTO v_is_pro;
    END IF;

    RETURN jsonb_build_object('success', true, 'is_pro', v_is_pro);
END;
$$;

-- 5. Auto Profile Creation Trigger on Signup
CREATE OR REPLACE FUNCTION public.handle_new_trainer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, name, is_pro)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        FALSE
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_trainer();

-- ==============================================================================
-- 40 SEED EXERCISE MOVEMENTS
-- ==============================================================================
INSERT INTO public.exercise_library (category, name, default_cue, default_sets, default_reps) VALUES
-- 1. 고관절 / 둔근 (Hip / Glute)
('고관절/둔근', '글루트 브릿지', '골반을 말아올리며 엉덩이에 힘을 꽉 주고 1초 정지합니다.', 3, '15회'),
('고관절/둔근', '사이드 라잉 클램쉘', '골반이 뒤로 넘어가지 않게 고정하고 무릎을 벌립니다.', 3, '15회'),
('고관절/둔근', '힙 힌지 드릴 (벽 터치)', '무릎은 살짝만 굽히고 엉덩이를 뒤쪽 벽으로 밀어냅니다.', 3, '12회'),
('고관절/둔근', '버드독', '허리가 꺾이지 않도록 복압을 잡고 반대 손발을 뻗습니다.', 3, '10회 (각)'),
('고관절/둔근', '싱글 레그 데드리프트 (맨몸)', '지지하는 발바닥 전체로 바닥을 누르며 균형을 잡습니다.', 3, '10회 (각)'),
('고관절/둔근', '런지 & 힙 플렉서 스트레칭', '골반을 앞으로 밀어 장요근이 길어지는 느낌을 유지합니다.', 3, '30초 (각)'),
('고관절/둔근', '90-90 고관절 회전 스트레칭', '상체를 세우고 양 무릎을 바닥에 지그시 눌러줍니다.', 3, '10회 (각)'),
('고관절/둔근', '개구리 자세 고관절 모빌리티', '무릎을 넓게 벌리고 엉덩이를 뒤로 앉히며 안쪽 허벅지를 늘립니다.', 3, '10회'),

-- 2. 흉추 / 어깨 가동성 (Thoracic / Shoulder)
('흉추/어깨', '흉추 회전 (오픈 북)', '골반은 고정하고 갈비뼈와 시선이 함께 회전합니다.', 3, '10회 (각)'),
('흉추/어깨', '고양이-소 자세 (캣 카우)', '척추 마디마디를 하나씩 움직인다는 느낌으로 분절합니다.', 3, '10회'),
('흉추/어깨', '월 슬라이드 (Wall Slide)', '팔꿈치와 손등이 벽에서 떨어지지 않게 천천히 올립니다.', 3, '12회'),
('흉추/어깨', '흉추 폼롤러 신전', '폼롤러를 등 뒤에 대고 숨을 내쉬며 가슴을 열어줍니다.', 3, '10회'),
('흉추/어깨', '프론 Y-T-W 레이즈', '승모근 대신 날개뼈 안쪽과 하부 승모근에 힘을 줍니다.', 3, '10회'),
('흉추/어깨', '스레드 더 니들 (Thread the needle)', '한쪽 팔을 반대 겨드랑이 밑으로 깊숙이 밀어 넣습니다.', 3, '10회 (각)'),
('흉추/어깨', '숄더 디스로케이션 (밴드/수건)', '팔꿈치를 펴고 어깨 가동범위 내에서 부드럽게 넘깁니다.', 3, '12회'),
('흉추/어깨', '소원근/후면 삼각근 릴리즈 (볼)', '마사지볼을 겨드랑이 뒤쪽에 대고 좌우로 굴립니다.', 3, '40초 (각)'),

-- 3. 코어 / 척추 안정성 (Core / Spine)
('코어/척추', '데드버그 (Deadbug)', '허리가 바닥에서 뜨지 않도록 아랫배를 바닥으로 누릅니다.', 3, '12회 (각)'),
('코어/척추', '플랭크 (기본)', '엉덩이가 들리거나 허리가 꺾이지 않게 일직선을 유지합니다.', 3, '30초'),
('코어/척추', '사이드 플랭크', '아래쪽 옆구리를 들어 올려 어깨와 골반이 평행하게 유지합니다.', 3, '20초 (각)'),
('코어/척추', '맥길 빅3 컬업 (Curl-Up)', '목만 당기지 말고 갈비뼈를 골반 쪽으로 살짝 조입니다.', 3, '8회 (5초 유지)'),
('코어/척추', '베어 홀드 (Bear Hold)', '무릎을 바닥에서 3cm만 띄우고 중립 척추를 유지합니다.', 3, '25초'),
('코어/척추', '팔로프 프레스 (밴드/수건)', '몸통이 돌아가지 않게 코어로 저항하며 앞으로 뻗습니다.', 3, '10회 (각)'),
('코어/척추', '할로우 바디 홀드', '허리를 바닥에 완전히 밀착시키고 팔다리를 뻗습니다.', 3, '20초'),
('코어/척추', '복식 호흡 & 복압 훈련 (90/90)', '숨을 들이마실 때 갈비뼈와 배 전체가 360도로 팽창합니다.', 3, '10회 호흡'),

-- 4. 발목 / 종아리 / 하체 (Ankle / Lower Body)
('발목/하체', '벽 발목 배측굴곡 모빌리티', '뒤꿈치가 바닥에서 뜨지 않은 채 무릎을 벽으로 터치합니다.', 3, '12회 (각)'),
('발목/하체', '카프 레이즈 (비복근/가자미근)', '엄지발가락 쪽으로 체중을 실어 뒤꿈치를 높이 들어 올립니다.', 3, '15회'),
('발목/하체', '단족 운동 (Short Foot / 아치 활성화)', '발가락을 구부리지 않고 발바닥 아치를 위로 당겨 올립니다.', 3, '10회 (5초 유지)'),
('발목/하체', '대퇴사두근 스트레칭 (카우치 스트레칭)', '벽에 정강이를 대고 상체를 세워 앞벅지를 강하게 늘립니다.', 3, '30초 (각)'),
('발목/하체', '햄스트링 액티브 스트레칭', '누워서 허벅지 뒤를 잡고 무릎을 천천히 펴줍니다.', 3, '10회 (각)'),
('발목/하체', '사이드 런지 (내전근 가동성)', '가슴을 펴고 한쪽 엉덩이를 뒤로 앉히며 안쪽 허벅지를 늘립니다.', 3, '10회 (각)'),
('발목/하체', '종아리 폼롤러 릴리즈', '종아리 아래에 롤러를 두고 발목을 돌리며 뭉친 곳을 풉니다.', 3, '40초 (각)'),
('발목/하체', '발목 외번 밴드 운동', '발목을 바깥쪽으로 당기며 비골근을 활성화합니다.', 3, '15회 (각)'),

-- 5. 목 / 상체 자세 교정 (Neck / Upper Body)
('목/상체', '친 턱 (Chin Tuck / 거북목 교정)', '턱을 아래로 당겨 뒤통수가 길어지는 느낌을 만듭니다.', 3, '10회 (5초 유지)'),
('목/상체', '흉쇄유돌근 & 사각근 릴리즈', '고개를 반대로 돌리고 목 옆 근육을 손가락으로 가볍게 풉니다.', 3, '30초 (각)'),
('목/상체', '소흉근 벽 스트레칭', '팔꿈치를 벽에 대고 상체를 앞으로 돌려 가슴 앞쪽을 늘립니다.', 3, '30초 (각)'),
('목/상체', '견갑골 푸쉬업 (Scapular Push-Up)', '팔꿈치는 펴둔 채 날개뼈만 모았다가 밀어냅니다.', 3, '12회'),
('목/상체', '코브라 자세 (상부 흉추 신전)', '어깨를 내리고 쇄골을 양옆으로 펼치며 가슴을 듭니다.', 3, '10회 (3초 유지)'),
('목/상체', '광배근 스트레칭 (기둥 잡기)', '기둥을 잡고 엉덩이를 뒤로 빼며 겨드랑이 아래를 늘립니다.', 3, '30초 (각)'),
('목/상체', '상부 승모근 스트레칭', '손으로 머리를 부드럽게 옆으로 당겨 목 옆선을 늘립니다.', 3, '20초 (각)'),
('목/상체', '프론 암 리프트 (등 상부 활성화)', '엎드려서 엄지손가락을 하늘로 향하게 하고 팔을 들어 올립니다.', 3, '12회');

-- ==============================================================================
-- PRIVILEGES
-- Anon may not hit tables directly. Member writes go through SECURITY DEFINER RPCs.
-- ==============================================================================
REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE ALL ON TABLE public.members FROM anon;
REVOKE ALL ON TABLE public.homework FROM anon;
REVOKE ALL ON TABLE public.homework_items FROM anon;
REVOKE ALL ON TABLE public.homework_logs FROM anon;
REVOKE ALL ON TABLE public.session_notes FROM anon;
REVOKE ALL ON TABLE public.exercise_library FROM anon;

REVOKE ALL ON FUNCTION public.handle_new_trainer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.open_homework(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_homework(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_homework(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.toggle_pro_status() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.open_homework(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_homework(text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_homework(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_pro_status() TO authenticated;

DROP FUNCTION IF EXISTS public.increment_credit();
DROP FUNCTION IF EXISTS public.increment_credit(uuid);
DROP FUNCTION IF EXISTS public.decrement_credit();
