# 🏋️ [운동숙제 (InstructorSync)] 최종 마스터 기획서 및 PRD v2.5
> **1인 PT·필라테스 스튜디오 원장을 위한 초경량 AI 숙제 처방 & 회원 리텐션 B2B SaaS**  
> *'AI 쉬운 창업' 공모전 출품 및 B2B 상용화 단일 기준 명세서 (Gemini Pro 기획 통합)*

---

## 1. Executive Summary

### 1.1 제품 포지셔닝: 월 2.9만 원으로 고용하는 'AI 부원장'
- **Core Identity**: 1인 PT 및 필라테스 스튜디오 원장(직접 티칭 및 센터 경영 병행)을 위한 초경량 AI 숙제 처방 & 회원 리텐션 B2B SaaS.
- **Problem Solved**:
  - 수업 직후 카카오톡으로 장문의 운동 가이드를 치느라 발생하는 누적 피로 및 퇴근 후 개인 시간 침해.
  - 회원의 "알려주신 동작 까먹었어요", "집에서 어떻게 하는지 몰라 안 했어요"로 인한 숙제 이행률 10% 미만 추락.
  - 숙제 미수행 → 운동 효과 체감 지연 → 재등록 주기(3~6개월) 이탈율 40% 초과.
- **Value Proposition**:
  - 원장은 수업 후 15초 만에 개인화된 'Why(근거)'가 포함된 숙제를 발송.
  - 회원은 앱 설치/회원가입 없이 카카오톡 매직링크로 0초 진입하여 원터치 수행.
  - 회원 1명만 재등록(평균 80~150만 원)을 유치해도 월 이용료(29,000원) 대비 최소 50배 이상의 ROI 달성.

---

## 2. 타깃 고객(ICP) 및 문제 정의

### 2.1 1인 샵 원장 (Customer Persona)
- **특성**: 수업(하루 8~12타임), 청소, 회계, 회원 상담, 마케팅을 전담하여 만성적 인지 과부하 상태.
- **현행 관리 방식의 한계**:
  - 카카오톡 텍스트나 유튜브 링크 공유는 히스토리 추적 불가, 메시지 누락 빈번.
  - 기존 대형 피트니스 ERP/CRM(바디코디 등)은 기능이 비대하고 PC 기반이라, 모바일 환경에서 수업 간 쉬는 시간(5~10분)에 쓰기 불가능.
- **절대적 요구조건**: *"15초 안에 세팅 끝나고, 손가락 3번 탭으로 카톡 발송까지 완료되어야 함."*

### 2.2 40~60대 시니어·중장년 회원 (End-User Persona)
- **특성**: 통증 완화, 재활, 체형 교정 목적이 다수이며, 복잡한 스마트폰 UI에 대한 저항감이 극도로 높음.
- **기존 피트니스 앱의 실패 원인**:
  - 아이디/비밀번호 찾기, 본인 인증, 앱 설치 화면에서 이탈률 70% 이상 발생.
  - 텍스트가 많거나 복잡한 세트/반복 입력(숫자 패드 타이핑)을 요구하면 즉시 이탈.
- **절대적 요구조건**: *"카톡 누르면 바로 큰 화면으로 영상과 소리가 나오고, 버튼 한두 번 누르면 끝나야 함."*

---

## 3. 3대 핵심 기둥 (Core Pillars)

```text
[원장: 15초 처방] ──────> [카톡 매직링크] ──────> [회원: 0초 진입]
  Fast Assignment         /h/[token]           No Install / No Login
        │                                                │
        │                                                ▼
  [AI-04 다음 수업 연계] <─── [AI-03 통증/체감 분석] <─── [원터치 수행 완료]
   AI Continuity Engine       Pain & Feedback Data       High Compliance
```

### 3.1 Fast Assignment (15초 숙제 생성)
- 수업 직후 키워드 1~2개 입력 또는 운동 DB에서 1~3개 선택.
- AI가 당일 수업 목적과 회원 체형 특성을 반영한 수행 기준(세트/반복/템포) 및 동기부여 'Why' 2문장 자동 생성.
- 원장 승인/수정 후 즉시 클립보드 복사 및 카카오톡 공유 링크 생성.

### 3.2 Magic Link (/h/[token])
- UUID 기반 암호화 토큰이 포함된 단일 웹 URL.
- 회원가입, 로그인, 앱 다운로드 공정 100% 제거.
- 카카오톡 인앱 브라우저에서 바로 구동되며, 보안 토큰 만료 전까지 언제든 재진입 가능.

### 3.3 AI Continuity Engine (수업의 영속성)
- 회원이 남긴 세트 완료 기록, 이모지, 통증 칩, 음성 메모를 종합 분석.
- 다음 예약 시간 10분 전, 원장 화면에 [다음 수업 준비 카드(AI-04)]를 자동 생성하여 "지난 숙제 때 좌측 고관절 찝힘 발생 → 금일 수업 시작 시 모빌리티 드릴 우선 진행 권장" 브리핑 제공.

---

## 4. 4060 시니어 원터치 무조작 UX (P0 명세)

| 구분 | 기능 명세 | 세부 구현 및 UX 원칙 |
| :--- | :--- | :--- |
| **자동 실행** | 0초 자동 재생 & 오디오 가이드 | • 카톡 매직링크 클릭 즉시 첫 번째 운동 WebM 비디오 무한 루프 재생.<br>• Web Speech API 기반 한국어 음성 코칭("어깨에 힘을 빼고 천천히 엉덩이를 뒤로 밀어주세요") 자동 발화. |
| **단일 인터랙션** | 64px 왕버튼 & 오토 카운트 | • 화면 하단 전체를 차지하는 64px 메인 액션 버튼 1개만 배치.<br>• `[1세트 완료! 쉬기]` 탭 시 즉시 30초 대형 휴식 카운트다운 타이머 구동.<br>• 휴식 종료 시 진동/사운드 피드백과 함께 다음 세트 전환. |
| **타이핑 0자** | 대형 이모지 + 칩 + STT 마이크 | • 텍스트 키보드 팝업 원천 차단.<br>1) 기분/체감 이모지 3종: 😃 좋았어요 / 😐 버거웠어요 / 😣 아팠어요 (직경 56px)<br>2) 통증 부위 퀵 칩: [무릎] [허리] [어깨] [목] [고관절]<br>3) 음성 메모: 대형 마이크 버튼 탭 후 말하면 Web Speech API STT로 텍스트 자동 변환. |
| **설치 유도** | PWA 원터치 홈 화면 추가 | • 숙제 2회 이상 완료 시 상단에 "홈 화면에 두고 매일 하기" 바텀 배너 노출.<br>• 탭 한 번으로 스마트폰 바탕화면에 앱 아이콘 생성. |

---

## 5. [신규] 회원 예약 스케줄링 (/schedules)

### 5.1 경량 주간 타임블록 캘린더
- **설계 철학**: 복잡한 전산/매출 통계/정산 기능을 과감히 배제하고, 원장이 오늘과 이번 주 수업 일정을 직관적으로 파악할 수 있는 타임블록 뷰 제공.
- **조작성**: 드래그 앤 드롭 및 탭 한 번으로 예약 추가/시간 변경.

### 5.2 데이터베이스 스키마 연동 (Supabase PostgreSQL)

```sql
-- 회원 기본 테이블
create table members (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references instructors(id) on delete cascade,
  name text not null,
  phone text,
  target text, -- 예: "허리디스크 완화 및 둔근 강화"
  created_at timestamptz default now()
);

-- 숙제 테이블
create table homeworks (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  instructor_id uuid not null references instructors(id) on delete cascade,
  token text unique not null,
  exercises jsonb not null, -- [{exercise_id, name, sets, reps, video_url}]
  ai_why text,
  status text default 'pending', -- 'pending', 'completed', 'partial'
  feedback jsonb, -- {emoji, pain_chips: [], voice_note, stt_text}
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- 예약 스케줄링 테이블
create table schedules (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references instructors(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text default 'scheduled', -- 'scheduled', 'completed', 'cancelled', 'noshow'
  created_at timestamptz default now()
);

-- 인덱스 설정
create index idx_schedules_instructor_time on schedules (instructor_id, start_time);
create index idx_homeworks_token on homeworks (token);
```

### 5.3 스마트 트리거 연동 워크플로우
- **회원 뷰 상단 노출**: 매직링크 최상단에 `[다음 수업: D-2 (목) 오후 4:00]` 카드 고정 노출하여 출석 동기 부여.
- **수업 3시간 전 리마인드**: 카카오 알림톡/문자를 통해 "오늘 수업 전 가벼운 스트레칭 숙제를 완료해 보세요" 자동 푸시.
- **수업 10분 전 원장 브리핑 (AI-04)**: 원장 대시보드 메인에 해당 타임 회원 카드 팝업.
  - *"회원 김OO님: 2일 전 스쿼트 숙제 중 '허리 통증' 칩 선택. 음성 메모: '일어날 때 찌릿함'."*
  - *"원장 티칭 팁: 금일 스쿼트 중단, 힙 힌지 패턴 교정 및 흉추 가동성 드릴 권장."*

---

## 6. UI/UX 디자인 시스템

### 6.1 원장 웹 앱 (Instructor Portal)
- **Design Concept**: 토스(Toss) 및 카카오 T 스타일의 모바일 퍼스트 바텀시트 UI.
- **레이아웃**: 데스크톱 없이 모바일 스마트폰 한 손 파지 환경에 100% 최적화.
- **핵심 컴포넌트**:
  - Floating Action Button (FAB) `[+ 숙제 발송]` → 탭 시 바텀시트 상승.
  - 3단 모션: `[회원 선택]` → `[운동 1~3개 선택]` → `[AI Why 생성 확인 후 카톡 복사]`.
- **컬러 시스템**: 신뢰감 있는 딥 네이비(#0F172A), 프라이머리 일렉트릭 블루(#2563EB), 경고/통증 앰버(#F59E0B).

### 6.2 회원 웹 뷰 (Client Magic Link)
- **Design Concept**: 인지적 과부하를 원천 차단하는 미니멀 고대비 단일 카드 타임라인.
- **화면 구성**:
  - 1화면 1태스크 원칙 (복잡한 탭 메뉴, 뒤로 가기 버튼 제거).
  - **배경**: 완전 백색(#FFFFFF) 및 명도 대비 7:1 이상의 다크 그레이(#111827) 본문 텍스트.
  - **폰트**: 시스템 기본 산세리프(Pretendard), 기본 본문 18px 이상, 버튼 텍스트 20px 볼드.

---

## 7. 인프라 0원 & 초고마진 BM 구조

### 7.1 인프라 비용 제로화 아키텍처

```text
[클라이언트 브라우저]
  │
  ├─> Web Speech API (클라이언트 내장 무료 STT & TTS)
  ├─> free-exercise-db (오픈소스 정적 WebM CDN - 트래픽 비용 $0)
  │
[Vercel Serverless (Next.js 16)] (Hobby/Pro 티어 무상 범위 커버)
  │
  ├─> [Supabase Backend] (무료 티어: DB 500MB, Auth, Edge Functions)
  └─> [OpenAI API] (GPT-4o-mini 호출 - 유일한 변동비)
```

- **미디어 비용 0원**:
  - 오픈소스 운동 데이터베이스(`free-exercise-db`)의 압축 WebM 루프 비디오를 정적 호스팅/무료 CDN으로 분기.
  - 유료 TTS/STT API(Google Cloud, Naver Clova) 대신 브라우저 표준 Web Speech API 전면 적용.
- **호스팅 및 DB 비용 0원**:
  - Next.js 16 기반 Vercel 배포.
  - Supabase Free Tier(데이터 500MB, 월 50,000 MAU)로 1인 스튜디오 수십 개 센터 처리 가능.

### 7.2 AI 비용 및 마진 구조 분석
- **가정 (1인 스튜디오 기준)**:
  - 원장 1인당 관리 회원 수: 25명
  - 회원당 주 2회 숙제 발송 (월 8회 × 25명 = 월 200회 숙제 생성)
  - 회원 피드백 및 수업 브리핑 연동 (월 200회 분석)
- **토큰 소비량 (GPT-4o-mini 기준)**:
  - 입력: 평균 400 토큰 / 출력: 평균 150 토큰 → 1회 파이프라인당 약 550 토큰.
  - 월간 총 토큰: 400회 × 550 토큰 = 220,000 토큰.
  - GPT-4o-mini 단가: Input $0.15/1M 토큰, Output $0.60/1M 토큰.
  - **센터당 월 AI 비용: 약 $0.09 (한화 약 120원).**

### 7.3 비즈니스 모델(BM) 단위 경제학 (Unit Economics)

| 항목 | 금액 | 비고 |
| :--- | :--- | :--- |
| **소비자 가격 (월 구독료)** | 29,000원 | 1인 스튜디오 원장 대상 플랫 요금제 |
| **호스팅 & DB 비용** | 0원 | Vercel / Supabase 무상 티어 범위 |
| **미디어 전송 & 음성 엔진** | 0원 | 오픈소스 CDN + Web Speech API |
| **AI LLM API 비용** | 120원 | GPT-4o-mini 사용 기준 |
| **PG 결제 수수료 (토스페이먼츠)** | 약 957원 | 3.3% 기준 |
| **월 순이익 (Net Profit)** | **27,923원** | **순마진율 96.3% (PG 수수료 제외 시 99.5%)** |

---

## 8. 4대 AI 파이프라인 명세 (GPT-4o-mini)

### [AI-01] 수업 메모 비구조화 데이터 → 정형 데이터 구조화
- **Input**: 원장의 날것 메모 ("오늘 김회원님 데드 40kg 5회 3셋 잘함 허리 안 아픔 근데 햄스트링 타이트 집에서 폼롤러 풀고 글루트 브릿지 시키기")
- **System Prompt**: *"너는 피트니스 데이터 엔지니어다. 원장의 비정형 수업 메모를 분석하여 정형 JSON 형식(exercise_name, target_sets, target_reps, coach_note)으로 추출하라."*
- **Output**:
```json
{
  "selected_exercises": [
    {"name": "Hamstring Foam Rolling", "duration_sec": 60, "sets": 2},
    {"name": "Glute Bridge", "reps": 15, "sets": 3}
  ],
  "coach_note": "데드리프트 시 햄스트링 긴장이 관찰되어 후면 사슬 이완 및 둔근 활성화 집중"
}
```

### [AI-02] 맞춤형 'Why(수행 근거)' 문장 생성
- **Input**: 회원 목표("골반 비대칭 교정"), 오늘 수행한 운동("글루트 브릿지"), 코치 노트.
- **System Prompt**: *"40-60대 회원이 이해하기 쉬운 친절하고 권위 있는 어조로, 이 운동을 집에서 해야만 하는 이유를 정확히 2문장의 한국어로 작성하라."*
- **Output**:
> *"오늘 배운 글루트 브릿지는 틀어진 골반을 바로잡고 허리 부담을 줄여주는 가장 핵심적인 운동입니다. 잠들기 전 딱 3세트만 진행하시면 내일 아침 허리가 훨씬 가벼워집니다."*

### [AI-03] 회원 통증/피드백 분석 엔진
- **Input**: 세트 달성률, 선택된 이모지, 선택된 통증 칩, STT 변환 음성 텍스트.
- **System Prompt**: *"회원의 피드백을 분석하여 부상 위험도(Safe, Caution, Danger)를 분류하고, 원장에게 보고할 1문장 요약을 작성하라."*
- **Output**:
```json
{
  "risk_level": "Caution",
  "summary": "우측 고관절 찝힘 호소 및 버거움 체감 기록됨. 가동범위 제한 필요."
}
```

### [AI-04] 다음 수업 준비 카드 자동 생성
- **Input**: 회원 이전 히스토리, 지난 3회간 숙제 이행 데이터, AI-03 분석 결과, 다음 수업 시작 시간.
- **System Prompt**: *"원장이 수업 시작 10초 전에 훑어보고 즉시 티칭 전략을 수정할 수 있도록 핵심 사항을 3단 불릿으로 정리하라."*
- **Output**:
> • **체크포인트**: 지난 숙제 중 우측 고관절 찝힘 발생 (이행률 66%).  
> • **수정 계획**: 금일 본운동 전 고관절 굴곡근 스트레칭 및 밴드 모빌리티 선행 필수.  
> • **멘탈 케어**: *"지난번 숙제 때 골반 불편하셨던 부분부터 확인해 드릴게요"*로 오프닝 추천.

---

## 9. 단계별 출시 로드맵 & GTM 전략

```text
[Phase 1: MVP 검증] ────────> [Phase 2: 공모전 & 정식 출시] ────────> [Phase 3: Scale-up]
• 핵심 3대 기둥 구축          • 스케줄링(/schedules) 탑재         • B2B 파트너십 & 협회 제휴
• 10개 스튜디오 클로즈드 베타   • PG 결제 연동 & 과금 시작          • 프랜차이즈 멀티 지점 대시보드
• 15초 숙제 & 매직링크 P0     • 'AI 쉬운 창업' 출품               • 강사 채용/매칭 연계
```

### 9.1 Phase 1: MVP 검증 (1~2개월 차)
- **목표**: 15초 생성 → 카톡 매직링크 → 원터치 음성/이모지 완료의 핵심 루프 작동 검증.
- **액션**: 수도권 1인 필라테스/PT 스튜디오 10곳 섭외하여 무료 클로즈드 베타 진행.
- **핵심 지표**: 원장의 숙제 발송 소요 시간 20초 이내 달성, 회원 숙제 이행률 60% 이상 확보.

### 9.2 Phase 2: 'AI 쉬운 창업' 공모전 출품 및 정식 출시 (3~4개월 차)
- **목표**: 상용화 버전 완성, 공모전 수상 및 초기 유료 결제 전환.
- **액션**:
  - 신규 모듈 [회원 예약 스케줄링(`/schedules`)] 통합 배포.
  - 토스페이먼츠 연동을 통한 월 29,000원 정기 결제 시스템 안착.
  - 공모전 출품: *"인프라 0원, 순마진 96% 이상의 지속 가능한 소상공인 상생 B2B AI SaaS"* 서사 강조.

### 9.3 Phase 3: Scale-up 및 시장 확장 (5~8개월 차)
- **GTM (Go-To-Market) 채널**:
  - **인스타그램 릴스/쇼츠**: *"수업 끝나고 카톡 장문 치다 번아웃 온 원장님의 15초 퇴근 루틴"* 숏폼 영상 바이럴.
  - **필라테스/피트니스 협회 및 아카데미 제휴**: 지도자 자격증 수료자 대상 3개월 무료 프로모션 제공.
  - **재등록 보장형 레퍼런스 마케팅**: *"회원 재등록률 25% 상승한 OO 스튜디오 원장 인터뷰"* 성공 사례 케이스 스터디 배포.
