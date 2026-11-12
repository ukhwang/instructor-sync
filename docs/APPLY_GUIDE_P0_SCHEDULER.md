# 운동숙제 P0 신뢰성 + 4단계 스케줄러 — 적용 가이드

기준 커밋: `5d5f4db` (main)

## 1. 코드 적용
```bash
git checkout -b feat/p0-scheduler
git apply --3way instructor-sync-p0-scheduler.patch   # 또는 zip 의 파일을 같은 경로에 덮어쓰기
npm run typecheck   # 변경 파일 오류 0 (기존 파일 오류 67건은 별도, 이전 111건)
node --test         # 203 pass / 2 fail(기존 .ts 테스트 2건, 변경 전과 동일)
```

## 2. Supabase 마이그레이션 (코드 배포 **전에** 적용)
- 파일: `supabase/migrations/20261114000000_lessons_scheduler.sql`
- `supabase db push` 또는 대시보드 SQL Editor 에 붙여넣기
- 사전 확인: 운영 DB 에 아래 함수가 이미 있어야 숙제 생성·제출이 동작합니다.
  ```sql
  select proname from pg_proc
  where proname in ('create_homework_v2','submit_homework_feedback_v2','open_homework');
  ```
  3개가 안 나오면 이전 마이그레이션(20260921171403, 20260921173014, 20260922100000)부터 적용하세요.
- 확인:
  ```sql
  select count(*) from public.lessons;              -- 0
  select public.create_lessons(gen_random_uuid(), '<내 회원 uuid>', now() + interval '1 day', 50, 0);
  -- 로그인한 원장 세션이 아니면 {"success":false,"reason":"unauthorized"} 가 정상
  ```
- 마이그레이션 전에 배포해도 대시보드는 열립니다(오늘 수업 카드만 비어 있음). `/app/schedules` 는 "다시 불러오기" 화면이 됩니다.

## 3. 실기기 확인 체크리스트 (아이폰 Safari · 안드로이드 Chrome · 카카오톡 인앱)
1. 원장: 스케줄 → 빈 시간 탭 → 회원 선택 → 예약 (반복 4주) → 블록 4개 생성
2. 같은 시간 다시 예약 → "그 시간엔 이미 수업이 있어요" 토스트, 시트 내용 유지
3. 블록 탭 → 3초 브리핑 표시 → [수업 완료하고 숙제 내기] → 남은 회차 −1 토스트 → 숙제 바텀시트 자동 오픈 (상단에 "○월 ○일 수업 기록에 함께 저장돼요")
4. 토스트 [되돌리기] → 회차 복원
5. 카톡 전송 → **다른 기기**에서 링크 열기 → 세트 완료 탭 (이전 버전은 여기서 멈춤)
6. 회원: 느낌·통증 6점 이상·부위 선택 → 음성/키보드 메모 → 제출 → 완료 화면
7. 원장: 다음 수업 블록이 🔴 통증 주의로 바뀌고, 브리핑 카드 우측 상단이 "회원 기록 기반"인지 확인 ("샘플 데이터"면 조회 실패)
8. 새로고침·재배포 후에도 5번 링크가 열리는지 확인 (인메모리 캐시 제거 검증)
