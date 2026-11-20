import { withCoachFields } from './demo';
import type { OpenHomeworkResult } from './types';

/*
 * Public demo member link (/h/demo-token). Exact-match tokens only; served
 * without touching the database and never persisted (submissions are no-ops).
 */

const DEMO_TOKEN = 'sample-token-demo-active-2026';

export const PUBLIC_DEMO_TOKENS: ReadonlySet<string> = new Set(['demo-token', 'demo', DEMO_TOKEN]);

export function isPublicDemoToken(token: string): boolean {
  return PUBLIC_DEMO_TOKENS.has(token);
}

export function buildPublicDemoHomework(token: string, now: Date = new Date()): OpenHomeworkResult {
  const createdAt = now.toISOString();
  return {
    success: true,
    homework: {
      id: 'demo-hw-1',
      why: '장시간 좌식 생활로 굳은 척추 기립근과 골반 중둔근을 활성화하여 허리 부담을 줄입니다. 수업 전까지 매일 5분 가볍게 진행해 주세요.',
      status: 'sent',
      token,
      token_expires_at: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7).toISOString(),
      created_at: createdAt,
    },
    member: { id: 'mem-1', name: '이수진' },
    items: [
      withCoachFields({
        id: 'demo-item-1',
        homework_id: 'demo-hw-1',
        order_index: 1,
        name: '버드독 (Bird Dog)',
        cue: '허리가 꺾이지 않도록 복부에 긴장을 유지하고 팔다리를 대각선으로 곧게 뻗습니다.',
        target_sets: 3,
        target_reps: '10회',
        rest_seconds: 30,
        created_at: createdAt,
      }),
      withCoachFields({
        id: 'demo-item-2',
        homework_id: 'demo-hw-1',
        order_index: 2,
        name: '글루트 브릿지 (Glute Bridge)',
        cue: '골반을 말아올리며 엉덩이에 힘을 꽉 주고 1초 정지합니다.',
        target_sets: 3,
        target_reps: '15회',
        rest_seconds: 30,
        created_at: createdAt,
      }),
      withCoachFields({
        id: 'demo-item-3',
        homework_id: 'demo-hw-1',
        order_index: 3,
        name: '데드버그 (Dead Bug)',
        cue: '허리가 바닥에서 뜨지 않게 배꼽을 아래로 누르며 교차로 움직입니다.',
        target_sets: 2,
        target_reps: '12회',
        rest_seconds: 30,
        created_at: createdAt,
      }),
    ],
    logs: [],
  };
}
