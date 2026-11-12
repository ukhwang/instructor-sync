# 운동 마스터 DB 통합 결과 보고서

기준 데이터는 `exercise_review_dataset.json`(1,318종)과 `lib/exercises/rehab-db.ts`(재활 34종)입니다. 생성일은 2026-11-12입니다.

## 1. 중복 제거 요약

| 항목 | 수 |
|---|---|
| 헬스 DB 입력 (번들 메타데이터상 1,324종에서 6건 사전 제거) | 1318 |
| 헬스 DB 내부 추가 중복 제거 (같은 동작, 남녀 모델·촬영 각도만 다름) | 5 |
| 재활 34종과 겹쳐 헬스 DB에서 제거 (재활 항목 유지, GIF 병합) | 13 |
| 재활 34종 (전원 유지) | 34 |
| **최종 유니크 운동 수** | **1334** |
| 남은 중복 (ID·한국어 이름·exact GIF 기준) | **0** |

계산: 1,318 − 5 − 13 + 34 = 1,334

판정 방법은 이름 일치에 그치지 않았습니다. 후보 GIF를 프레임 시트로 만들어 동작을 직접 비교했습니다. 데이터셋의 `instructions_ko`는 이름만 보고 자동 생성된 듯 내용이 틀린 경우가 있어 판정 근거로 쓰지 않았습니다.

### 헬스 DB 내부 중복 (합치고 대체 GIF는 `altGifUrl`로 보존)

| 유지 | 제거 |
|---|---|
| 2799 barbell sitted alternate leg raise | 2800 barbell sitted alternate leg raise (female) |
| 0296 dumbbell close-grip press | 1731 dumbbell close grip press |
| 0422 dumbbell standing one arm curl (over incline bench) | 1680 dumbbell standing one arm curl over incline bench |
| 0653 push-up (bosu ball) | 1307 push up on bosu ball |
| 2802 twisted leg raise | 2801 twisted leg raise (female) |

이름은 비슷하지만 GIF상 다른 동작이라 둘 다 남긴 경우도 있습니다. 2188/2189는 덤벨 1개와 2개, 0409/0727은 덤벨을 들고 하는지 밟고 하는지가 다릅니다.

## 2. 재활 34종 GIF 교정 (중요)

기존 `rehab-db.ts`의 GIF는 34종 중 **31종이 틀렸거나 깨져 있었습니다.**

- "친 턱"과 "상부 승모근 스트레칭"에는 윗몸일으키기 GIF가 붙어 있었습니다.
- "인클라인 벽 푸쉬업"에는 종아리 스트레칭 GIF가 붙어 있었습니다.
- "기본 푸시업"은 존재하지 않는 URL이었습니다(404).

한국어 명칭, 세트·횟수, 큐, 코칭 태그, 통증 부위, 설명은 **한 글자도 바꾸지 않았습니다.**

### 2-1. 같은 운동 13종: 헬스 DB 항목을 흡수해 중복 제거

| 재활 운동 | 병합한 데이터셋 | 기존 GIF → 교정 GIF |
|---|---|---|
| 데드버그 | 0276 dead bug | 0276-iny3m5y → 0276-iny3m5y |
| 골반 기울이기 | 3147 pelvic tilt | 0006-qaZVsGk → 3147-NKJ8o6x |
| 맥길 빅3 컬업 | 3016 curl-up | 0001-2gPfomN → 3016-g2oKspu |
| 사이드 플랭크 | 0705 side bridge v. 2 | 3544-5VXmnV5 → 0705-RKjH6Lt |
| 글루트 브릿지 | 3013 low glute bridge on floor | 1409-qKBpF7I → 3013-u0cNiij |
| 개구리 자세 | 2571 rocking frog stretch | 1710-RQNVT10 → 2571-2Dk4xQV |
| 견갑골 푸쉬업 | 3021 scapula push-up | 3294-A9qxk2F → 3021-jV65tKx |
| 카프 레이즈 | 1373 bodyweight standing calf raise | 1368-uL9CsKm → 1373-bJYHBIN |
| 상부 승모근 스트레칭 | 0716 side push neck stretch | 0001-2gPfomN → 0716-oQRJYkC |
| 기본 푸시업 | 0662 push-up | 0662-X1F1bfe → 0662-I4hDWkc |
| 무릎 대고 푸쉬업 | 3211 kneeling push-up (male) | 2398-v3vLFW0 → 3211-ZOuKWir |
| 인클라인 벽 푸쉬업 | 0659 push-up (wall) | 1407-PzNxakt → 0659-LEH9jxP |
| 다이아몬드 푸쉬업 | 0283 diamond push-up | 0283-soIB2rj → 0283-soIB2rj |

### 2-2. 자세는 같지만 다른 운동 7종: 둘 다 유지하고 GIF는 참고용(`mediaMatch: "similar"`)

| 재활 운동 | 참고 GIF | 차이 |
|---|---|---|
| 베어 홀드 | 3360 bear crawl | 정지 홀드 vs 이동 |
| 런지 힙 플렉서 스트레칭 | 1559 exercise ball hip flexor stretch | 바닥 런지 vs 짐볼 |
| 이상근 4자 스트레칭 | 1710 assisted lying gluteus and piriformis stretch | 혼자 vs 파트너 보조 |
| 엎드려 Y-레이즈 | 3541 dumbbell incline y-raise | 바닥 엎드려 vs 인클라인 벤치·덤벨 |
| 밴드 숄더 외회전 | 0235 cable standing shoulder external rotation | 밴드 vs 케이블 |
| 미니 스쿼트 (벽 지지) | 0624 march sit (wall) | 얕은 벽 스쿼트 vs 월싯 마치 |
| 발목 배측굴곡 모빌리티 | 1377 calf stretch with hands against wall | 무릎 벽 밀기 vs 종아리 스트레칭 |

### 2-3. 1,318종에 대응 동작이 없는 14종: GIF를 비움(`gifUrl: null`)

버드독, 고양이-소 자세, 코브라 자세, 사이드 라잉 클램쉘, 90-90 고관절 회전, 월 슬라이드, 흉추 회전 (오픈 북), 숄더 펜듈럼, 쿼드 셋, 힐 슬라이드, 단족 운동, 친 턱, 흉쇄유돌근 릴리즈, 소흉근 벽 스트레칭

기존에는 전부 엉뚱한 동작의 GIF였습니다. 버드독과 고양이-소 자세는 네발 시작 자세 포스터가 유효해서 포스터만 남겼습니다. 나머지는 직접 촬영하거나 다른 소스에서 가져와야 합니다.

## 3. 한국어 명칭 번역 규칙

- 기구를 앞에 두고 종목명은 국내 헬스장 음차 표기를 따랐습니다. 예: `barbell bench press` → 바벨 벤치프레스, `lat pulldown` → 랫풀다운, `lever` → 머신, `smith` → 스미스머신, `stability/exercise ball` → 짐볼.
- 수식어는 괄호로 뺐습니다. 예: `(on stability ball)` → (짐볼), `v. 2` → v2.
- 파트너 보조 스트레칭의 `assisted`는 "어시스트"가 아니라 "파트너"로 옮겼습니다.
- 체조 동작(front/back lever)과 고유명사(조트맨, 테이트, JM)는 별도로 처리했습니다.
- 사전 기반 초벌 번역을 한 뒤 1,318개 전수를 검토했고, 260개는 개별 교정했습니다(`overrides.json`). 한국어 이름 중복은 0건입니다.

## 4. 부위·기구 분류 검증

부위는 요청하신 9종으로 재분류했습니다. 데이터셋의 `body_part`와 `target`, 동작 패턴을 함께 봤습니다.

| 부위 | 수 |
|---|---|
| 허리/코어 | 192 |
| 고관절/둔근 | 84 |
| 어깨/흉추 | 153 |
| 무릎/하체 | 202 |
| 목/상체 | 5 |
| 가슴 | 160 |
| 등 | 184 |
| 팔 | 325 |
| 유산소 | 29 |

주요 교정 사항입니다.

- **upper legs 226종 분리:** 스쿼트·런지·레그프레스는 무릎/하체로, 데드리프트·굿모닝·힙스러스트·외전/내전은 고관절/둔근으로 보냈습니다. 원본은 target이 전부 glutes로 묶여 있었습니다.
- **척추기립근 운동:** 백익스텐션 등 19종을 등에서 허리/코어로 옮겼습니다.
- **레그킥 푸시업류:** 고관절/둔근에서 가슴으로 옮겼습니다.

기구는 데이터셋의 `equipment_ko`가 80종을 "기타"로 뭉뚱그리고 있었습니다(leverage machine, EZ바, smith 등). 이를 16개 그룹으로 정리하고 `equipmentDetail`에 세부 기구를 남겼습니다. 이름과 원본 기구가 충돌하는 13건은 이름을 기준으로 교정했습니다. 예를 들어 `lever bent over row`는 바벨에서 머신으로, `exercise ball ... calf raise`는 덤벨에서 짐볼로 바꿨습니다.

| 기구 | 수 |
|---|---|
| 맨몸 | 342 |
| 덤벨 | 288 |
| 바벨 | 175 |
| 케이블 | 157 |
| 머신 | 144 |
| 밴드 | 62 |
| 케틀벨 | 41 |
| 짐볼 | 37 |
| 중량 | 32 |
| 어시스트 | 14 |
| 메디신볼 | 12 |
| 기타 | 12 |
| 폼롤러 | 8 |
| 유산소 기구 | 5 |
| AB롤러 | 3 |
| 보수볼 | 2 |

## 5. 번들·성능

| 파일 | 원본 | gzip | 로딩 |
|---|---|---|---|
| `master-db.ts` | 190KB | 46KB | 검색창을 처음 열 때 동적 import 권장 |
| `master-db.instructions.json` | 637KB | 88KB | `loadInstruction(id)` 호출 시에만 별도 청크로 로드 |

- 검색은 질의당 약 0.2ms입니다(1,000회 측정). 키 입력 한 번의 예산은 16ms라 디바운스 없이 써도 됩니다.
- 한글, 영문, 초성(ㄷㄷㅂㄱ → 데드버그), 표기 흔들림(푸쉬/푸시, 렛/랫, 덤밸)을 모두 지원합니다.

## 6. 남은 이슈 (이번 범위 밖)

1. **`lib/exercise-media.ts`의 `MEDIA_BY_EXERCISE`:** 하드코딩된 GIF 매핑이 따로 있습니다. 버드독 3239처럼 같은 오류를 반복하고 있고, 회원 화면(`/h/[token]`)은 여기를 먼저 봅니다. `getExerciseById`나 `searchExercises` 기반으로 바꿔야 회원 화면도 교정됩니다.
2. **`QuickAssignDrawer.tsx`의 기본 카드와 프리셋:** 버드독 3239, Y-레이즈, 90-90 등 같은 잘못된 GIF URL이 직접 박혀 있습니다.
3. **GIF가 없는 재활 14종:** 촬영하거나 대체 소스를 찾아야 합니다.
4. **헬스 1,300종의 기본 세트·횟수:** 일반값(3세트 12회, 스트레칭 30초 등)입니다. 재활 34종만 검증값입니다.
