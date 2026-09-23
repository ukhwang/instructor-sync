# 운동 DB 검토 초안 1차

## 사람이 직접 검토할 파일

- [운동DB_검토용.xlsx](운동DB_검토용.xlsx): 필터·고정 열·검토 상태 드롭다운이 있는 편집용 엑셀. 노란 칸에 수정안을 작성한다.
- [운동DB_검토용.sqlite](운동DB_검토용.sqlite): 같은 초기 데이터를 한글 열 이름의 5개 표로 담은 로컬 DB. 운동목록 3행, 회원안내 18행, 강사참고 42행, 출처 7행, 검토사항 29행.

이번 검토는 엑셀을 편집 기준으로 사용한다. 엑셀과 SQLite, 기존 JSON/PGlite 사이의 자동 동기화는 없다. 수정 파일의 ID를 기준으로 후속 반영해야 하며, 이 파일의 검토 상태를 변경해도 서비스에 자동 게시되지 않는다. 파일 저장 후 셀 값·행 수 대조 및 SQLite integrity_check 통과. 실제 Excel 앱에서 시각 검증은 미실행이다.

상태: 로컬 검토 전용. 회원/강사 검색 미연결, Supabase 미적용, 신규 게시 0개.

## 파일과 실제 DB

- `perplexity-source.txt`: 사용자가 제공한 응답 원본. 내용 정확성을 인증하지 않는다.
- `perplexity-intake.json`: 원본의 JSON 블록 그대로 보존.
- `initial-drafts.json`: 맨몸 스쿼트, 일반 푸시업(손·발끝 지지), 전완 플랭크 3개로 정리한 검토 데이터.
- `.local/review-db/`: 재생성 가능한 로컬 PGlite(Postgres) DB. Git 제외. 기존 Supabase/앱 DB 대체물이 아니다.
- `../../docs/EXERCISE_DRAFT_REVIEW.md`: 사람이 읽는 초안과 보완 목록.

식별자는 검토용 stable_key다. 아직 기존 catalog row UUID나 seed ID로 전환하지 않는다. 플랭크 seed-18은 동일 변형 여부 확인 후보일 뿐 자동 매핑하지 않는다.

## 실행

프로젝트 루트에서:

```powershell
node scripts/exercise-draft-db.mjs
node scripts/exercise-draft-db.mjs --write-local
node scripts/exercise-draft-db.mjs --list
node --test tests/exercise-draft-db.test.mjs
```

기본 명령은 검증만 한다. --write-local만 고정된 프로젝트 내부 로컬 DB에 기록한다. 원격 주소·운영 비밀값을 받는 옵션이나 게시 명령은 없다. --list는 기록된 버전을 조회한다.

같은 stable_key/version의 동일 내용 재실행은 no-op이다. 내용 변경 시 기존 DB를 덮어쓰지 않고 충돌한다. JSON의 content_version을 올려 새 초안 버전을 등록한다. 검토 도구는 published/검토자/자동 운동량 입력을 거부한다. 이후 게시 기능은 별도 검토와 개발이 필요하다.

`prepare-exercise-drafts.mjs`는 원본 JSON으로 최초 초안을 만든 일회용 생성기다. 이미 만든 파일은 덮어쓰지 않는다. 이후 보완은 initial-drafts.json에 한다.

## 데이터 경계

member는 회원용 문구 **후보**, trainer는 강사 참고 **후보**다. 모든 문장은 needs_review이며 source_ids도 지지 확정이 아닌 확인 대상 자료의 연결이다.

세트/횟수/유지/휴식/반복당 초/좌우는 미정 null. 0이나 false로 치환하지 않는다. media와 회원용 중단 문구도 검토 전 null이다. 기존 provider는 일부 null을 기본값으로 대체하므로 이 초안을 provider에 그대로 연결하면 안 된다.

원문 URL 확인과 전문 검토, 저작권 확인은 별개다. page_retrieved/search_excerpt_only는 조회 수준만 뜻한다. reviewed_by/reviewed_at은 모두 null이다. 원문의 제한 각도·평가 기준·운동량을 보편적 처방으로 복사하지 않았다.
