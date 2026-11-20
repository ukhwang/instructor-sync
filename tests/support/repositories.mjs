import { loadModule } from '../load-module.mjs';

// Loads the real server repositories (TypeScript) with only the `server-only`
// marker stubbed. One shared module cache so instanceof/identity checks hold.
const mocks = { 'server-only': {} };
const cache = new Map();
const load = (path) => loadModule(path, mocks, cache);

export const repos = {
  members: load('lib/server/db/repositories/members.ts'),
  homeworks: load('lib/server/db/repositories/homeworks.ts'),
  publicHomework: load('lib/server/db/repositories/public-homework.ts'),
  sessionNotes: load('lib/server/db/repositories/session-notes.ts'),
  progress: load('lib/server/db/repositories/member-progress.ts'),
  lessons: load('lib/server/db/repositories/lessons.ts'),
  reports: load('lib/server/db/repositories/milestone-reports.ts'),
  briefing: load('lib/server/db/repositories/briefing.ts'),
  catalog: load('lib/server/db/repositories/exercise-catalog.ts'),
  tokens: load('lib/server/security/tokens.ts'),
  invites: load('lib/server/auth/invites.ts'),
};

export const SECRET = 'test-secret-test-secret-test-secret-0001';
export const TRAINER_A = '00000000-0000-4000-8000-00000000000a';
export const TRAINER_B = '00000000-0000-4000-8000-00000000000b';

export function registration(overrides = {}) {
  return {
    request_id: crypto.randomUUID(),
    member_kind: 'new',
    name: '테스트 회원',
    phone: '010-0000-0000',
    package_total: 10,
    package_remaining: null,
    package_expires_on: null,
    end_state: '통증 없이 스쿼트',
    import_record: null,
    ...overrides,
  };
}

export function homeworkInput(memberId, overrides = {}) {
  return {
    request_id: crypto.randomUUID(),
    member_id: memberId,
    why: '둔근 활성화',
    token: repos.tokens.generateLinkToken(),
    token_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    assignment_purpose: 'routine',
    items: [
      { order_index: 1, name: '글루트 브릿지', cue: '골반 말기', target_sets: 3, target_reps: '15회', effort_kind: 'reps', reps: 15, rest_seconds: 30, requirement: 'required' },
      { order_index: 2, name: '플랭크', cue: '', target_sets: 2, target_reps: '30초', effort_kind: 'hold', hold_seconds: 30, rest_seconds: 30, requirement: 'optional' },
    ],
    ...overrides,
  };
}

export async function createMember(db, trainerId, overrides = {}) {
  const result = await repos.members.registerMember(db, trainerId, registration(overrides));
  if (!result.success) throw new Error(`member fixture failed: ${result.reason}`);
  return result.member;
}

export async function createHomework(db, trainerId, memberId, overrides = {}) {
  const input = homeworkInput(memberId, overrides);
  const result = await repos.homeworks.createHomework(db, trainerId, input, SECRET);
  if (!result.success) throw new Error(`homework fixture failed: ${result.reason}`);
  return { ...result, token: input.token, input };
}
