# 연동 가이드 (피클 전달용)

## 1. 파일 배치

| 패키지 경로 | 저장소 경로 | 비고 |
|---|---|---|
| `lib/exercises/master-db.ts` | 같은 경로 (신규) | 자동 생성 파일이므로 직접 수정하지 마세요 |
| `lib/exercises/master-db.instructions.json` | 같은 경로 (신규) | 동작 설명, 지연 로딩 |
| `lib/exercises/rehab-db.ts` | **기존 파일 교체** | `gifUrl`/`posterUrl` 31종만 바뀝니다. diff로 확인하세요 |
| `lib/exercises/master-db.test.ts` | 같은 경로 (신규) | `npx tsx --test lib/exercises/master-db.test.ts` |
| `scripts/exercise-master/*` | 같은 경로 (신규) | 데이터를 다시 만들 때 사용합니다 (README 참고) |

`tsconfig.json`에 `resolveJsonModule: true`가 이미 켜져 있어 추가 설정은 필요 없습니다.

## 2. QuickAssignDrawer 검색을 1,334종으로 확장

기존에는 `searchRehabExercises`가 34종만 검색했습니다. 아래처럼 바꾸면 카드 데이터 형식은 그대로 두고 검색 대상만 늘어납니다.

```tsx
// components/homework/QuickAssignDrawer.tsx
import type { ExercisePickerItem, MasterExercise } from "@/lib/exercises/master-db";

// 검색창에 처음 포커스할 때 모듈을 불러옵니다 (드로어 초기 번들에서 제외, gzip 46KB)
const [db, setDb] = useState<typeof import("@/lib/exercises/master-db") | null>(null);
const ensureDb = useCallback(() => {
  if (!db) void import("@/lib/exercises/master-db").then(setDb);
}, [db]);

const searchResults = useMemo<ExercisePickerItem[]>(() => {
  if (!db || !searchQuery.trim()) return [];
  return db.searchExercises(searchQuery, { limit: 8 }).map(db.toPickerItem);
}, [db, searchQuery]);

// addExercise의 파라미터 타입을 RehabExerciseItem에서 ExercisePickerItem으로 바꿉니다
// (필드 이름이 같아 함수 본문은 수정할 필요 없음)
const addExercise = useCallback((item: ExercisePickerItem) => { /* 기존 코드 그대로 */ }, []);
```

검색 input의 `onFocus`에서 `ensureDb()`를 호출하면 됩니다.

검색 결과 썸네일은 `item.gifUrl || item.posterUrl`을 그대로 쓰면 됩니다. GIF가 없는 재활 14종은 두 값이 모두 빈 문자열이므로, 빈 문자열일 때는 `<img>` 대신 아이콘 플레이스홀더를 보여주세요. `src=""`는 깨진 이미지로 표시됩니다.

`item.mediaMatch === "similar"`인 7종은 썸네일에 "참고 영상" 라벨을 붙이는 것을 권장합니다.

## 3. 주요 API

```ts
searchExercises(query, { limit, region, equipment, painArea, source, requireMedia })
getExerciseById("rehab-dead-bug" | "ex-0025")
getAllExercises()
toPickerItem(item)          // QuickAssignDrawer 카드 형식
await loadInstruction(id)   // 동작 설명 (헬스 항목은 별도 청크 로드)
EXERCISE_REGIONS, EQUIPMENT_GROUPS
```

## 4. 확인 순서

1. `npm run typecheck`
2. `npx tsx --test lib/exercises/master-db.test.ts` (8개 테스트)
3. 실기기에서 숙제 내기 드로어를 엽니다. "푸쉬업", "ㄷㄷㅂㄱ", "렛풀다운"을 검색하고 결과에서 카드를 추가해 봅니다.
