import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MASTER_DB_SIZE,
  getAllExercises,
  getExerciseById,
  loadInstruction,
  searchExercises,
  toPickerItem,
  EXERCISE_REGIONS,
  EQUIPMENT_GROUPS,
} from "./master-db";
import { REHAB_EXERCISES } from "./rehab-db";

const all = getAllExercises();

test("총 1,334종, ID·한국어 이름·미디어 모두 중복 0건", () => {
  assert.equal(MASTER_DB_SIZE, 1334);
  assert.equal(all.length, 1334);
  assert.equal(new Set(all.map((e) => e.id)).size, all.length);
  assert.equal(new Set(all.map((e) => e.nameKo)).size, all.length);
  const datasetIds = all.map((e) => e.datasetId).filter((id): id is string => id !== null && id.length > 0);
  const exactOwners = all.filter((e) => e.mediaMatch === "exact").map((e) => e.datasetId);
  assert.equal(new Set(exactOwners).size, exactOwners.length, "같은 데이터셋 GIF를 exact로 쓰는 항목이 둘 이상");
  assert.ok(datasetIds.length > 1300);
});

test("재활 34종의 원본 필드가 100% 보존된다", () => {
  assert.equal(REHAB_EXERCISES.length, 34);
  for (const original of REHAB_EXERCISES) {
    const item = getExerciseById(original.id);
    assert.ok(item, original.id);
    assert.equal(item.rehab, original);
    assert.equal(item.nameKo, original.koreanOnlyName);
    assert.equal(item.region, original.category);
    assert.deepEqual(item.coachingTags, original.coachingTags);
    assert.deepEqual(item.defaults, {
      sets: original.defaultSets, reps: original.defaultReps, restSec: original.defaultRestSec, cue: original.defaultCue,
    });
    const picker = toPickerItem(item);
    assert.equal(picker.name, original.name);
    assert.equal(picker.defaultCue, original.defaultCue);
  }
});

test("재활과 겹친 13종은 헬스 DB에서 제거되고 GIF가 병합된다", () => {
  const merged = all.filter((e) => e.source === "rehab" && e.mediaMatch === "exact");
  assert.equal(merged.length, 13);
  for (const item of merged) {
    assert.equal(getExerciseById(`ex-${item.datasetId}`), undefined, `ex-${item.datasetId} 가 남아 있음`);
    assert.ok(item.gifUrl?.includes(`/${item.datasetId}-`));
  }
  assert.equal(getExerciseById("rehab-wall-pushup")?.gifUrl?.includes("/0659-"), true);
  assert.equal(getExerciseById("rehab-chin-tuck")?.gifUrl, null, "대응 GIF가 없으면 null");
});

test("데이터셋 내부 중복 5건은 대체 GIF로 보존된다", () => {
  for (const [dropped, kept] of [["2800", "2799"], ["1731", "0296"], ["1680", "0422"], ["1307", "0653"], ["2801", "2802"]] as const) {
    assert.equal(getExerciseById(`ex-${dropped}`), undefined);
    assert.ok(getExerciseById(`ex-${kept}`)?.altGifUrl?.includes(`/${dropped}-`));
  }
});

test("부위·기구 값은 정의된 목록 안에 있다", () => {
  for (const e of all) {
    assert.ok((EXERCISE_REGIONS as readonly string[]).includes(e.region), e.id);
    assert.ok((EQUIPMENT_GROUPS as readonly string[]).includes(e.equipment), e.id);
  }
  assert.equal(getExerciseById("ex-0574")?.equipment, "머신", "lever bent over row 는 머신");
  assert.equal(getExerciseById("ex-3296")?.equipment, "맨몸", "front lever 는 체조 동작");
  assert.equal(getExerciseById("ex-0044")?.region, "고관절/둔근", "굿모닝은 힙힌지");
});

test("검색: 표기 흔들림·영문·초성, 재활 우선", () => {
  assert.equal(searchExercises("푸쉬업", { limit: 1 })[0]?.id, "rehab-standard-pushup");
  assert.equal(searchExercises("벤치프레스")[0]?.nameKo.includes("벤치프레스"), true);
  assert.equal(searchExercises("barbell bench press", { limit: 1 })[0]?.id, "ex-0025");
  assert.equal(searchExercises("렛풀다운").length > 0, true);
  assert.equal(searchExercises("ㄷㄷㅂㄱ", { limit: 1 })[0]?.nameKo, "데드버그");
  assert.ok(searchExercises("", { painArea: "목", limit: 50 }).every((e) => e.painAreas.includes("목")));
  assert.ok(searchExercises("", { requireMedia: true, limit: 2000 }).every((e) => e.mediaMatch !== "none"));
});

test("검색 성능: 질의당 평균 1ms 미만 (키 입력 프레임 예산 16ms)", () => {
  searchExercises("워밍업");
  const start = performance.now();
  for (let i = 0; i < 1000; i++) searchExercises(i % 2 ? "덤벨" : "ㅅㅋㅌ");
  const perQuery = (performance.now() - start) / 1000;
  assert.ok(perQuery < 1, `${perQuery.toFixed(3)}ms/query`);
});

test("동작 설명은 지연 로딩된다", async () => {
  assert.equal(typeof (await loadInstruction("ex-0025")), "string");
  assert.equal(await loadInstruction("rehab-bird-dog"), REHAB_EXERCISES.find((e) => e.id === "rehab-bird-dog")?.instruction);
  assert.equal(await loadInstruction("nope"), null);
});
