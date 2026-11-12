/**
 * 운동숙제 통합 운동 마스터 DB (재활 34종 + 헬스 DB) — 자동 생성 파일, 직접 수정하지 마세요.
 * 생성: scripts/exercise-master (build.py → gen_ts.py) · 기준 데이터: exercise_review_dataset.json (1,318종)
 *
 * 설계
 * - 재활 34종은 rehab-db.ts 원본을 그대로 import 한다 (한국어 명칭·세트/횟수·큐·코칭 태그 100% 보존).
 *   여기서는 GIF/포스터만 GIF 육안 대조 결과로 교정한다(REHAB_MEDIA).
 * - 헬스 DB는 문자열 튜플(ROWS)로 압축 저장하고, 첫 사용 시 한 번만 객체로 펼친다(lazy hydrate).
 * - 동작 설명(약 1MB)은 master-db.instructions.json 으로 분리해 loadInstruction()이 필요할 때만 동적 import 한다.
 *   → 이 모듈 자체는 클라이언트 번들에 넣어도 gzip 기준 수십 KB 수준.
 * - 검색은 1,334건 선형 스캔 + 사전 정규화 키(초성 포함) 방식이라 키 입력마다 1ms 안팎.
 */
import { REHAB_EXERCISES, type PainArea, type RehabExerciseItem } from "./rehab-db";

/* ────────────────────────────────────────────────────────────
 * 1. 타입
 * ──────────────────────────────────────────────────────────── */

export const EXERCISE_REGIONS = [
  "허리/코어", "고관절/둔근", "어깨/흉추", "무릎/하체", "목/상체", "가슴", "등", "팔", "유산소",
] as const;
export type ExerciseRegion = (typeof EXERCISE_REGIONS)[number];

export const EQUIPMENT_GROUPS = [
  "맨몸", "덤벨", "바벨", "케이블", "머신", "밴드", "케틀벨", "짐볼", "메디신볼", "폼롤러", "보수볼", "AB롤러",
  "중량", "어시스트", "유산소 기구", "기타",
] as const;
export type EquipmentGroup = (typeof EQUIPMENT_GROUPS)[number];

/** exact: 같은 동작 GIF · similar: 같은 자세의 다른 동작(참고용) · none: 맞는 GIF 없음 */
export type MediaMatch = "exact" | "similar" | "none";
export type ExerciseSource = "rehab" | "gym";

export interface ExerciseDefaults {
  sets: number;
  reps: string;
  restSec: number;
  /** 재활 항목만 검증된 큐가 있다. 헬스 항목은 null */
  cue: string | null;
}

export interface MasterExercise {
  /** 재활: "rehab-…" / 헬스: "ex-0001" (데이터셋 ID 기반, 안정적) */
  id: string;
  source: ExerciseSource;
  nameKo: string;
  nameEn: string;
  region: ExerciseRegion;
  equipment: EquipmentGroup;
  equipmentDetail: string;
  /** 주동근 (헬스 항목만) */
  target: string | null;
  gifUrl: string | null;
  posterUrl: string | null;
  /** 같은 동작의 다른 모델/각도 GIF (데이터셋 내부 중복을 합칠 때 보존) */
  altGifUrl: string | null;
  mediaMatch: MediaMatch;
  /** 미디어 출처 데이터셋 ID */
  datasetId: string | null;
  defaults: ExerciseDefaults;
  coachingTags: readonly string[];
  tags: readonly string[];
  painAreas: readonly PainArea[];
  difficulty: RehabExerciseItem["difficulty"] | null;
  /** 검색용 별칭 (병합된 데이터셋 이름 등) */
  aliases: readonly string[];
  /** 재활 항목이면 rehab-db 원본 객체 (GIF/포스터는 원본 값 그대로) */
  rehab: RehabExerciseItem | null;
}

/** QuickAssignDrawer 등 기존 피커가 쓰는 최소 필드 (RehabExerciseItem과 구조 호환) */
export type ExercisePickerItem = Pick<
  RehabExerciseItem,
  "id" | "name" | "koreanOnlyName" | "englishName" | "defaultSets" | "defaultReps" | "defaultRestSec" | "defaultCue" | "coachingTags"
> & {
  gifUrl: string;
  posterUrl: string;
  region: ExerciseRegion;
  equipment: EquipmentGroup;
  mediaMatch: MediaMatch;
  source: ExerciseSource;
};

/* ────────────────────────────────────────────────────────────
 * 2. 미디어 URL
 * ──────────────────────────────────────────────────────────── */

const GIF_BASE = "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/videos/";
const IMG_BASE = "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/images/";
const gifUrlOf = (code: string) => `${GIF_BASE}${code}.gif`;
const imgUrlOf = (code: string) => `${IMG_BASE}${code}.jpg`;

/* ────────────────────────────────────────────────────────────
 * 3. 데이터 (생성)
 * ──────────────────────────────────────────────────────────── */

interface RehabMediaFix {
  /** 데이터셋 미디어 코드, 없으면 null */
  code: string | null;
  match: MediaMatch;
  datasetId: string | null;
  /** 코드가 없을 때 유지할 원본 포스터 URL */
  keepPoster: string | null;
  region: ExerciseRegion;
  equipment: EquipmentGroup;
  equipmentDetail: string;
  aliases: readonly string[];
}

/*__REHAB_MEDIA__*/

/**
 * 헬스 DB 행: [id, nameKo, nameEn, regionIdx, equipIdx, equipmentDetail, targetIdx, mediaCode, altCode, sets, reps, restSec]
 * - regionIdx → EXERCISE_REGIONS, equipIdx → EQUIPMENT_GROUPS, targetIdx → TARGETS
 */
type Row = readonly [string, string, string, number, number, string, number, string, string, number, string, number];

/*__TARGETS__*/

/*__ROWS__*/

/* ────────────────────────────────────────────────────────────
 * 4. 하이드레이션 (첫 호출 시 1회)
 * ──────────────────────────────────────────────────────────── */

const REGION_TAGS: Record<ExerciseRegion, readonly string[]> = {
  "허리/코어": ["척추 중립", "코어 잘 잡기"],
  "고관절/둔근": ["골반 수평 유지", "무릎 모임 주의"],
  "무릎/하체": ["무릎 모임 주의", "통증 없는 범위"],
  "어깨/흉추": ["어깨 솟지 않게", "날개뼈 모으기"],
  "목/상체": ["턱 당기기", "어깨 솟지 않게"],
  "가슴": ["어깨 솟지 않게", "호흡 뱉으며 수축"],
  "등": ["날개뼈 모으기", "척추 중립"],
  "팔": ["호흡 뱉으며 수축", "통증 없는 범위"],
  "유산소": ["통증 없는 범위", "호흡 뱉으며 수축"],
};

function at<T>(list: readonly T[], index: number, label: string): T {
  const value = list[index];
  if (value === undefined) throw new Error(`[master-db] ${label} index ${index} out of range`);
  return value;
}

function hydrateRehab(item: RehabExerciseItem): MasterExercise {
  const fix = REHAB_MEDIA[item.id];
  if (!fix) throw new Error(`[master-db] REHAB_MEDIA missing ${item.id}`);
  return {
    id: item.id,
    source: "rehab",
    nameKo: item.koreanOnlyName,
    nameEn: item.englishName,
    region: fix.region,
    equipment: fix.equipment,
    equipmentDetail: fix.equipmentDetail,
    target: null,
    gifUrl: fix.code ? gifUrlOf(fix.code) : null,
    posterUrl: fix.code ? imgUrlOf(fix.code) : fix.keepPoster,
    altGifUrl: null,
    mediaMatch: fix.match,
    datasetId: fix.datasetId,
    defaults: { sets: item.defaultSets, reps: item.defaultReps, restSec: item.defaultRestSec, cue: item.defaultCue },
    coachingTags: item.coachingTags,
    tags: item.tags,
    painAreas: item.painAreas,
    difficulty: item.difficulty,
    aliases: fix.aliases,
    rehab: item,
  };
}

function hydrateRow(row: Row): MasterExercise {
  const [id, nameKo, nameEn, regionIdx, equipIdx, equipmentDetail, targetIdx, code, alt, sets, reps, restSec] = row;
  const region = at(EXERCISE_REGIONS, regionIdx, "region");
  return {
    id,
    source: "gym",
    nameKo,
    nameEn,
    region,
    equipment: at(EQUIPMENT_GROUPS, equipIdx, "equipment"),
    equipmentDetail,
    target: targetIdx < 0 ? null : at(TARGETS, targetIdx, "target"),
    gifUrl: gifUrlOf(code),
    posterUrl: imgUrlOf(code),
    altGifUrl: alt ? gifUrlOf(alt) : null,
    mediaMatch: "exact",
    datasetId: id.slice(3),
    defaults: { sets, reps, restSec, cue: null },
    coachingTags: REGION_TAGS[region],
    tags: [],
    painAreas: [],
    difficulty: null,
    aliases: [],
    rehab: null,
  };
}

/* ── 검색 키 정규화 ───────────────────────────────────────── */

const CHOSUNG = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

/** 표기 흔들림 통일: 푸쉬→푸시, 덤밸→덤벨, 레터럴→래터럴, 렛→랫, 브리지→브릿지 … */
const SPELLING: ReadonlyArray<readonly [RegExp, string]> = [
  [/쉬/g, "시"], [/덤밸/g, "덤벨"], [/바밸/g, "바벨"], [/레터럴/g, "래터럴"], [/렛풀/g, "랫풀"],
  [/브리지/g, "브릿지"], [/스퀏/g, "스쿼트"], [/숄더프래스/g, "숄더프레스"], [/프래스/g, "프레스"],
  [/싯업/g, "싯업"], [/윗몸일으키기/g, "싯업"], [/팔굽혀펴기/g, "푸시업"], [/엎드려팔굽혀펴기/g, "푸시업"],
];

export function normalizeQuery(text: string): string {
  let s = text.normalize("NFC").toLowerCase();
  for (const [pattern, to] of SPELLING) s = s.replace(pattern, to);
  return s.replace(/[\s\-_()·,/.→+]/g, "");
}

function toChosung(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0) - 0xac00;
    out += code >= 0 && code <= 11171 ? CHOSUNG[Math.floor(code / 588)] ?? "" : "";
  }
  return out;
}

const isChosungOnly = (q: string) => q.length > 0 && /^[ㄱ-ㅎ]+$/.test(q);

interface Indexed {
  item: MasterExercise;
  nameKey: string;
  /** 병합된 데이터셋 이름 등 별칭 — 정확히 일치하면 이름 일치와 같은 순위 */
  aliasKeys: ReadonlySet<string>;
  fullKey: string;
  chosung: string;
}

let cache: { list: MasterExercise[]; byId: Map<string, MasterExercise>; index: Indexed[] } | null = null;

function load() {
  if (cache) return cache;
  const list = [...REHAB_EXERCISES.map(hydrateRehab), ...ROWS.map(hydrateRow)];
  const byId = new Map(list.map((item) => [item.id, item]));
  const index = list.map((item) => ({
    item,
    nameKey: normalizeQuery(item.nameKo),
    aliasKeys: new Set(item.aliases.map(normalizeQuery)),
    fullKey: normalizeQuery(
      [item.nameKo, item.nameEn, ...item.aliases, ...item.tags, item.equipmentDetail, item.region, item.target ?? ""].join(" "),
    ),
    chosung: toChosung(item.nameKo.replace(/\s/g, "")),
  }));
  cache = { list, byId, index };
  return cache;
}

/* ────────────────────────────────────────────────────────────
 * 5. 공개 API
 * ──────────────────────────────────────────────────────────── */

export const MASTER_DB_SIZE = REHAB_EXERCISES.length + ROWS.length;

export function getAllExercises(): readonly MasterExercise[] {
  return load().list;
}

export function getExerciseById(id: string): MasterExercise | undefined {
  return load().byId.get(id);
}

export interface ExerciseSearchOptions {
  limit?: number;
  region?: ExerciseRegion | "전체";
  equipment?: EquipmentGroup | "전체";
  painArea?: PainArea | "전체";
  source?: ExerciseSource | "전체";
  /** 맞는 GIF가 없는 항목 제외 */
  requireMedia?: boolean;
}

/**
 * 한글·영문·초성 검색. 순위: 이름 일치 > 이름 시작 > 이름 포함 > 기타 필드 포함, 동점이면 재활 우선 → 짧은 이름.
 * 검색어가 비어 있으면 필터만 적용한 목록(재활 우선)을 돌려준다.
 */
export function searchExercises(query = "", options: ExerciseSearchOptions = {}): MasterExercise[] {
  const { limit = 20, region = "전체", equipment = "전체", painArea = "전체", source = "전체", requireMedia = false } = options;
  const q = normalizeQuery(query.trim());
  const chosungMode = isChosungOnly(q);
  const scored: Array<{ item: MasterExercise; score: number }> = [];

  for (const entry of load().index) {
    const { item } = entry;
    if (region !== "전체" && item.region !== region) continue;
    if (equipment !== "전체" && item.equipment !== equipment) continue;
    if (painArea !== "전체" && !item.painAreas.includes(painArea)) continue;
    if (source !== "전체" && item.source !== source) continue;
    if (requireMedia && item.mediaMatch === "none") continue;

    let score = 1;
    if (q) {
      if (chosungMode) score = entry.chosung.startsWith(q) ? 3 : entry.chosung.includes(q) ? 2 : 0;
      else if (entry.nameKey === q || entry.aliasKeys.has(q)) score = 5;
      else if (entry.nameKey.startsWith(q)) score = 4;
      else if (entry.nameKey.includes(q)) score = 3;
      else if (entry.fullKey.includes(q)) score = 2;
      else score = 0;
    }
    if (score > 0) scored.push({ item, score: score * 10 + (item.source === "rehab" ? 1 : 0) });
  }

  scored.sort((a, b) => b.score - a.score || a.item.nameKo.length - b.item.nameKo.length || a.item.nameKo.localeCompare(b.item.nameKo, "ko"));
  return scored.slice(0, limit).map(({ item }) => item);
}

/** 기존 QuickAssignDrawer 카드 형식으로 변환 (재활은 원본 값, 헬스는 일반 기본값) */
export function toPickerItem(item: MasterExercise): ExercisePickerItem {
  const base = item.rehab;
  return {
    id: item.id,
    name: base?.name ?? item.nameKo,
    koreanOnlyName: item.nameKo,
    englishName: item.nameEn,
    defaultSets: item.defaults.sets,
    defaultReps: item.defaults.reps,
    defaultRestSec: item.defaults.restSec,
    defaultCue: item.defaults.cue ?? (item.target ? `${item.target} 자극에 집중` : "통증 없는 범위에서 천천히"),
    coachingTags: [...item.coachingTags],
    gifUrl: item.gifUrl ?? "",
    posterUrl: item.posterUrl ?? "",
    region: item.region,
    equipment: item.equipment,
    mediaMatch: item.mediaMatch,
    source: item.source,
  };
}

/** 동작 설명은 별도 청크로 지연 로딩 (재활은 원본 instruction 즉시 반환) */
export async function loadInstruction(id: string): Promise<string | null> {
  const item = getExerciseById(id);
  if (!item) return null;
  if (item.rehab) return item.rehab.instruction;
  const mod = await import("./master-db.instructions.json");
  const table = (mod.default ?? mod) as Record<string, string>;
  return table[id] ?? null;
}
