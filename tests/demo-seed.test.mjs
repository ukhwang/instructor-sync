import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadModule } from './load-module.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const seed = loadModule('lib/demo-seed.ts');
const engine = loadModule('lib/demo-engine.ts');
const schemas = loadModule('lib/schedule-schemas.ts');
const masterDb = loadModule('lib/exercises/master-db.ts');

/** KST 날짜·시각 → Date */
const kst = (date, hhmm) => new Date(`${date}T${hhmm}:00+09:00`);
// 2026-11-16 은 월요일. 월~일 각 요일 × 하루 중 여러 시각을 검사한다.
const WEEK_DATES = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'];
const TIMES = ['06:30', '09:59', '10:30', '12:00', '15:10', '19:20', '21:45'];
const SAMPLE_NOWS = WEEK_DATES.flatMap((date) => TIMES.map((time) => kst(date, time)));

test('운동명은 실제 마스터 DB(nameKo)에 있는 것만 쓴다', () => {
  const names = new Set(masterDb.getAllExercises().map((item) => item.nameKo));
  for (const member of seed.DEMO_MEMBER_SEEDS) {
    for (const item of member.lastHomework.items) assert.ok(names.has(item.name), `${member.name}: ${item.name}`);
    assert.ok(member.lastHomework.items.length >= 2 && member.lastHomework.items.length <= 3);
  }
});

test('회원 4명 시드가 요구 상태를 갖는다', () => {
  const byName = Object.fromEntries(seed.DEMO_MEMBER_SEEDS.map((m) => [m.name, m]));
  assert.deepEqual(Object.keys(byName), ['김선영', '박정훈', '이서연', '최영자']);
  assert.deepEqual(byName['김선영'].painTrend, [7, 4, 3]);
  assert.equal(byName['김선영'].packageTotal - byName['김선영'].packageRemaining, 7);
  assert.equal(byName['김선영'].packageRemaining, 5);
  assert.equal(byName['박정훈'].packageRemaining, 1);
  assert.equal(byName['박정훈'].packageTotal - byName['박정훈'].packageRemaining, 9);
  assert.equal(byName['이서연'].packageTotal - byName['이서연'].packageRemaining, 2);
  assert.equal(byName['이서연'].packageRemaining, 8);
  assert.equal(byName['최영자'].packageTotal - byName['최영자'].packageRemaining, 10);
  assert.ok(byName['김선영'].milestone && byName['최영자'].milestone);
  for (const m of seed.DEMO_MEMBER_SEEDS) {
    assert.equal(schemas.lessonIdInputSchema.safeParse({ lessonId: m.id }).success, true, 'member id 는 uuid');
    assert.equal(m.briefing.todayPlan.length, 3);
    assert.ok(m.briefing.opening.length > 0);
  }
});

test('이번 주 일정: 회원별 주 2회 · 오늘 수업 1~2개 · 겹침 없음 · 계약 스키마 통과 (모든 요일·시각)', () => {
  for (const now of SAMPLE_NOWS) {
    const state = seed.createInitialDemoState(now);
    const weekStart = schemas.mondayOf(now);
    const board = seed.buildDemoWeekBoard(state, weekStart, now);
    assert.equal(schemas.weekBoardSchema.safeParse(board).success, true, now.toISOString());

    for (const member of seed.DEMO_MEMBER_SEEDS) {
      assert.equal(board.lessons.filter((l) => l.memberId === member.id).length, 2, `${member.name} @ ${now.toISOString()}`);
    }
    const today = schemas.kstDateOf(now);
    const todays = board.lessons.filter((l) => schemas.kstDateOf(l.startsAt) === today);
    assert.ok(todays.length >= 1 && todays.length <= 2, `today count @ ${now.toISOString()}`);
    for (const lesson of board.lessons) {
      const minute = schemas.kstMinutesOfDay(lesson.startsAt);
      assert.ok(seed.DEMO_LESSON_SLOTS.includes(minute), `slot ${minute}`);
      assert.equal(lesson.status, Date.parse(lesson.endsAt) <= now.getTime() ? 'completed' : 'scheduled');
    }

    const all = state.lessons;
    assert.equal(new Set(all.map((l) => l.id)).size, all.length, 'lesson id 고유');
    for (let i = 0; i < all.length; i += 1) {
      assert.equal(schemas.lessonIdInputSchema.safeParse({ lessonId: all[i].id }).success, true);
      for (let j = i + 1; j < all.length; j += 1) {
        const overlap = Date.parse(all[i].startsAt) < Date.parse(all[j].endsAt) && Date.parse(all[j].startsAt) < Date.parse(all[i].endsAt);
        assert.equal(overlap, false, `겹침 ${all[i].startsAt} / ${all[j].startsAt}`);
      }
    }

    // 19:50(마지막 슬롯 종료) 전에는 '다음 수업' 카드 대상(오늘 예정 수업)이 있어야 한다.
    if (schemas.kstMinutesOfDay(now.toISOString()) < 1140 + 50) {
      assert.ok(todays.some((l) => l.status === 'scheduled' && Date.parse(l.endsAt) > now.getTime()), `next @ ${now.toISOString()}`);
    }
  }
});

test('다른 주: 지난 주는 사용 회차, 다음 주는 잔여 회차 범위 안에서만 만든다', () => {
  const now = kst('2026-11-18', '09:00');
  const state = seed.createInitialDemoState(now);
  for (const member of seed.DEMO_MEMBER_SEEDS) {
    const lessons = state.lessons.filter((l) => l.memberId === member.id);
    const completed = lessons.filter((l) => l.status === 'completed').length;
    const used = member.packageTotal - member.packageRemaining;
    assert.ok(completed <= Math.max(used, 2), `${member.name} completed ${completed}`);
  }
  const past = seed.buildDemoWeekBoard(state, schemas.addDays(schemas.mondayOf(now), -7), now);
  assert.equal(past.lessons.some((l) => l.memberName === '이서연' && l.status === 'completed'), true);
  const nextWeek = seed.buildDemoWeekBoard(state, schemas.addDays(schemas.mondayOf(now), 7), now);
  assert.equal(nextWeek.lessons.some((l) => l.memberName === '최영자'), false, '완주 회원은 다음 주 예약 없음');
});

test('브리핑은 SessionBriefingCard 계약(BriefingSchema)을 만족한다', () => {
  const briefingTypes = loadModule('lib/briefing/types.ts');
  const now = kst('2026-11-17', '09:30');
  for (const member of seed.DEMO_MEMBER_SEEDS) {
    const briefing = seed.buildDemoBriefing(member.id, now);
    assert.equal(briefingTypes.BriefingSchema.safeParse(briefing).success, true, member.name);
    assert.equal(briefing.modification.mobilityFirst.length, 3);
    assert.equal(briefing.source, 'fallback');
  }
  assert.equal(seed.buildDemoBriefing('00000000-0000-4000-8000-000000000000', now), null);
});

test('엔진: 완료·멱등 재완료·되돌리기·노쇼·취소/복원·시간 변경 충돌', () => {
  const now = kst('2026-11-17', '09:30');
  let state = seed.createInitialDemoState(now);
  const kim = seed.DEMO_MEMBER_SEEDS[0];
  const lesson = state.lessons.find((l) => l.memberId === kim.id && l.status === 'scheduled' && schemas.kstDateOf(l.startsAt) === '2026-11-17');
  assert.ok(lesson);

  let t = engine.completeDemoLesson(state, lesson.id);
  assert.deepEqual(t.result, { ok: true, data: { packageRemaining: 4, replayed: false } });
  state = t.next;
  t = engine.completeDemoLesson(state, lesson.id);
  assert.deepEqual(t.result, { ok: true, data: { packageRemaining: 4, replayed: true } });
  assert.equal(t.next, state, '재요청은 상태를 바꾸지 않는다');

  t = engine.revertDemoCompletion(state, lesson.id);
  assert.deepEqual(t.result, { ok: true, data: { packageRemaining: 5 } });
  state = t.next;
  assert.equal(engine.revertDemoCompletion(state, lesson.id).result.reason, 'invalid_status');

  t = engine.setDemoLessonStatus(state, { lessonId: lesson.id, status: 'no_show' });
  assert.equal(t.result.ok, true);
  state = t.next;
  assert.equal(state.members.find((m) => m.id === kim.id).packageRemaining, 5, '노쇼는 회차 차감 없음');
  state = engine.setDemoLessonStatus(state, { lessonId: lesson.id, status: 'cancelled' }).next;
  assert.equal(seed.buildDemoWeekBoard(state, schemas.mondayOf(now), now).lessons.some((l) => l.id === lesson.id), false);
  state = engine.setDemoLessonStatus(state, { lessonId: lesson.id, status: 'scheduled' }).next;
  assert.equal(state.lessons.find((l) => l.id === lesson.id).status, 'scheduled');

  const other = state.lessons.find((l) => l.id !== lesson.id && l.status !== 'cancelled' && Date.parse(l.startsAt) > now.getTime());
  const clash = engine.rescheduleDemoLesson(state, { lessonId: lesson.id, startsAt: other.startsAt, durationMin: 50 });
  assert.equal(clash.result.reason, 'time_conflict');
  const moved = engine.rescheduleDemoLesson(state, { lessonId: lesson.id, startsAt: '2026-11-17T21:30:00+09:00', durationMin: 50 });
  assert.equal(moved.result.reason, 'invalid_input', '운영 시간 밖');
  const ok = engine.rescheduleDemoLesson(state, { lessonId: lesson.id, startsAt: '2026-11-17T16:00:00+09:00', durationMin: 50 });
  assert.equal(ok.result.ok, true);
  assert.equal(engine.completeDemoLesson(state, 'missing').result.reason, 'lesson_not_found');
});

test('엔진: 수업 생성은 seriesId 로 멱등이고 겹치면 거절한다', () => {
  const now = kst('2026-11-17', '08:00');
  const state = seed.createInitialDemoState(now);
  let n = 0;
  const createId = () => seed.demoUuid('b', 900000 + n++);
  const input = {
    seriesId: '11111111-1111-4111-8111-111111111111',
    memberId: seed.DEMO_MEMBER_SEEDS[2].id,
    startsAt: '2026-11-17T16:00:00+09:00',
    durationMin: 50,
    repeatWeeks: 3,
  };
  const first = engine.createDemoLessons(state, input, createId);
  assert.equal(first.result.ok, true);
  assert.equal(first.result.data.lessonIds.length, 4);
  const replay = engine.createDemoLessons(first.next, input, createId);
  assert.deepEqual(replay.result, first.result);
  assert.equal(replay.next, first.next);
  const clash = engine.createDemoLessons(first.next, { ...input, seriesId: '22222222-2222-4222-8222-222222222222' }, createId);
  assert.equal(clash.result.reason, 'time_conflict');
  assert.equal(clash.next, first.next);
});

test('엔진: 숙제 출제는 demo-token 고정 · 수업 연결 · 최근 숙제 맵 갱신', () => {
  const now = kst('2026-11-17', '08:00');
  const state = seed.createInitialDemoState(now);
  const member = seed.DEMO_MEMBER_SEEDS[1];
  const lesson = state.lessons.find((l) => l.memberId === member.id);
  const t = engine.assignDemoHomework(
    state,
    { memberId: member.id, lessonId: lesson.id, why: '테스트', customItems: [{ name: '버드독 (Bird Dog)', sets: 3, reps: '10회', cue: 'x', restSec: 30 }] },
    'hw-1',
    now,
  );
  assert.equal(t.result.ok, true);
  assert.equal(t.result.homework.token, 'demo-token');
  assert.equal(t.result.lessonLinked, true);
  assert.equal(t.next.homeworks[member.id].id, 'hw-1');
  assert.equal(t.next.members.find((m) => m.id === member.id).badge, 'in_progress');
  const invalid = engine.assignDemoHomework(state, { memberId: member.id, customItems: [] }, 'hw-2', now);
  assert.equal(invalid.result.ok, false);
  assert.equal(invalid.next, state);
});

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

test('데모 코드는 서버 액션·DB·Supabase·네트워크·브라우저 저장소에 닿지 않는다', () => {
  const files = [
    ...listFiles(path.join(root, 'app/demo')),
    ...listFiles(path.join(root, 'components/demo')),
    path.join(root, 'lib/demo-seed.ts'),
    path.join(root, 'lib/demo-engine.ts'),
  ];
  const forbidden = [
    /app\/actions/,
    /@\/lib\/db/,
    /-server/,
    /createClient\(/,
    /\bfetch\(/,
    /localStorage|sessionStorage|indexedDB/,
    /@\/lib\/supabase/,
    /["']use server["']/,
  ];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const pattern of forbidden) assert.equal(pattern.test(source), false, `${path.relative(root, file)} matches ${pattern}`);
  }
});
