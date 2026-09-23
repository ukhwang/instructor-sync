import { readFileSync, writeFileSync } from 'node:fs';
import { validatePack } from './exercise-draft-db.mjs';

// Explicit one-off preparation; no database or network calls.
const base = new URL('../data/exercise-catalog/', import.meta.url);
const intake = JSON.parse(readFileSync(new URL('perplexity-intake.json', base), 'utf8'));
const keys = ['bodyweight-squat', 'standard-floor-push-up', 'forearm-plank'];
const names = ['맨몸 스쿼트', '일반 푸시업 (손·발끝 지지)', '전완 플랭크'];
const member = [
  { setup: ['강사와 정한 발 간격으로 서서 시작 자세를 확인합니다.'],
    steps: ['정해진 범위까지 천천히 앉았다가 일어납니다.'],
    cues: ['발의 접촉을 유지하며 움직여 보세요.', '수업에서 정한 범위와 속도로 움직여 주세요.'] },
  { setup: ['손과 발끝으로 바닥을 지지하고 강사와 정한 시작 자세를 잡습니다.'],
    steps: ['팔꿈치를 구부려 몸을 내린 뒤 바닥을 밀어 시작 자세로 돌아옵니다.'],
    cues: ['몸통 위치를 확인하며 내려갔다 올라오세요.', '수업에서 정한 범위로 움직여 주세요.'] },
  { setup: ['전완과 발끝으로 지지하고 팔꿈치가 어깨 아래에 오도록 자세를 잡습니다.'],
    steps: ['강사와 정한 시간 동안 자세를 유지합니다.'],
    cues: ['골반이 처음 정한 위치에서 크게 달라지지 않는지 확인해 주세요.', '숨을 참지 않고 호흡해 주세요.'] },
];
const observations = [
  ['정면에서 무릎의 이동 방향과 좌우 움직임을 관찰합니다.', '측면에서 발 접촉과 몸통 위치 변화를 관찰합니다.'],
  ['측면에서 몸통과 골반의 위치 변화를 관찰합니다.', '정해진 수행 범위에서 팔꿈치와 손의 위치를 관찰합니다.'],
  ['측면에서 골반과 목의 위치 변화를 관찰합니다.', '팔꿈치와 어깨의 상대 위치를 관찰합니다.'],
];
const withheld = [
  ['발끝 각도 10도 이하를 모든 회원에게 적용', '대퇴 평행 이상을 보편적 통과 기준으로 적용', 'ascent:descent ≥ 2:1을 타이머 설정으로 사용', '평가 중 2회 미달을 숙제 실패로 자동 판정'],
  ['팔꿈치 45~60도를 모든 변형의 필수 기준으로 적용', '최대반복 평가와 교정 1회 규칙을 숙제 처방으로 사용', '바닥 근접 깊이를 모든 회원에게 강제'],
  ['30~60초·3~5세트·휴식 30초를 플랭크 기본 처방으로 사용', '전완 지지와 손바닥 지지를 동일 운동으로 취급', '목록의 모든 증상/질환 안내가 각 출처에서 확인됐다고 취급'],
];
const pack = { schema_version: 1, status: 'draft', origin: 'ai', source_file: 'perplexity-intake.json', exercises: intake.exercises.map((raw, i) => {
  const seen = new Set();
  const references = raw.sources.filter(s => { if (seen.has(s.url)) return false; seen.add(s.url); return true; }).map((s, j) => ({
    id: `source-${i + 1}-${j + 1}`, url: s.url, title: s.title,
    verification: s.url.includes('PMC') ? 'search_excerpt_only' : s.url.includes('nasm.org') || s.url.includes('bannerhealth.com') ? 'page_retrieved' : 'unverified',
    checked_on: s.url.includes('PMC') || s.url.includes('nasm.org') || s.url.includes('bannerhealth.com') ? '2026-09-22' : null,
    note: '첨부 응답의 출처 후보. URL 접근 또는 검색 결과 확인은 모든 개별 주장·발행일·재사용 권리의 검증이 아님.',
  }));
  const c = value => ({ text: value, source_ids: references.map(s => s.id), status: 'needs_review' });
  return {
    stable_key: keys[i], content_version: 1, name: names[i],
    aliases: [['맨몸 스쿼트','bodyweight squat','air squat'],['푸시업','push-up','standard push-up'],['전완 플랭크','forearm plank']][i],
    category: ['하체','상체','코어'][i], equipment: i === 0 ? [] : ['매트(선택)'],
    movement_patterns: [['스쿼트'],['수평 밀기'],['정적 지지']][i],
    positions: [['서기'],['손·발끝 지지'],['전완·발끝 지지']][i],
    legacy_seed_id: null, legacy_match_candidate: i === 2 ? 'seed-18 (플랭크 기본): 동일 변형인지 사람 확인 필요' : null,
    status: 'draft', reviewed_by: null, reviewed_at: null,
    member: { setup_steps: member[i].setup.map(c), execution_steps: member[i].steps.map(c), attention_cues: member[i].cues.map(c),
      breathing_cue: i === 2 ? c('숨을 참지 않고 호흡합니다.') : null,
      pause_note: null },
    trainer: { observation_points: observations[i].map(c),
      subjective_questions: ['어느 부위에 불편함이 있었나요?', '수행 중 숨을 참는 느낌이 있었나요?'].map(c),
      adjustment_options: raw.adjustment_candidates.map(c), related_variants: raw.variations },
    defaults: { effort_kind: i === 2 ? 'hold' : 'reps', sets: null, reps: null, hold_seconds: null, rest_seconds: null, seconds_per_rep: null, per_side: null },
    media: null, rights_status: 'unverified', references,
    review_issues: ['회원 문구는 원문 복사가 아닌 AI 편집 초안. 실제 사용 전 현장 검토 필요.', 'source_ids는 검토할 후보 연결이며 개별 문장 지지 여부는 아직 미검증.', '중단·문의 안내는 원자료의 회원/강사 혼합 문구를 그대로 옮기지 않고 별도 검토 후 작성.', '조정 후보의 조건·장비 안정성·변형별 차이를 검토해야 함.', '원본 sources의 발행일·저자·대상 한계와 권리는 재확인 필요.', ...(i === 0 ? ['백 스쿼트 평가 자료를 맨몸 스쿼트 안내로 사용할 수 있는 범위 확인.', '속도 비율: 원문 검색 결과는 descent:ascent로 표기. 첨부는 반대 순서이며 시간/속도 해석도 확인 필요.'] : i === 1 ? ['대학 연령 여성 평가 프로토콜을 일반 회원 숙제에 일반화하지 말 것.'] : ['전완/하이 플랭크를 분리했으며 기존 seed와 자동 병합하지 않음.'])],
    withheld_claims: withheld[i], intake_index: i,
  };
}) };
validatePack(pack);
writeFileSync(new URL('initial-drafts.json', base), JSON.stringify(pack, null, 2) + '\n', { flag: 'wx' });
console.log('Prepared 3 draft revisions; no publication or app changes.');
