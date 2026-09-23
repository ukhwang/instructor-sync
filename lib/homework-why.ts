import type { DraftItem } from '@/stores/homework-draft-store';

export type HomeworkPurpose = 'routine' | 'focus' | 'review' | 'custom';

const PURPOSES: Record<Exclude<HomeworkPurpose, 'custom'>, string> = {
  routine: '기본 동작을 꾸준히 이어갈 수 있도록 준비했습니다.',
  focus: '이번 주에 정한 핵심 동작에 집중할 수 있도록 준비했습니다.',
  review: '수업에서 배운 동작을 집에서도 복습할 수 있도록 준비했습니다.',
};

export function generateHomeworkWhy(items: DraftItem[], purpose: HomeworkPurpose, sessionGoal = ''): string {
  const names = items.map((item) => item.name.trim()).filter(Boolean);
  if (!names.length) return '';
  const exerciseText = `이번 숙제는 ${names.join(', ')}입니다. `;
  if (purpose === 'custom') return '';
  const goal = sessionGoal.trim() ? ` 수업에서 정한 '${sessionGoal.trim()}' 목표를 떠올리며 연습해 주세요.` : '';
  return `${exerciseText}${PURPOSES[purpose]}${goal} 무리하지 않는 범위에서 진행해 주세요.`;
}
