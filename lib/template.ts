import { HomeworkLog, HomeworkItem } from './types';

/**
 * Generate Next Session Opening Line Template (No LLM, strictly deterministic)
 * 
 * Spec:
 * “지난주에 {기록요약}하셨고, {통증 원문} 하셔서 오늘은 그 부분부터 볼게요.”
 */
export function generateOpeningLine(
  items: HomeworkItem[] = [],
  logs: HomeworkLog[] = [],
  defaultFallbackName: string = '운동숙제'
): string {
  const itemNames = items.length > 0 ? items.map((i) => i.name).join(', ') : defaultFallbackName;

  if (logs.length === 0) {
    return `지난주에 전달드린 ${itemNames} 어떠셨는지 먼저 확인하고 오늘 수업 시작할게요.`;
  }

  const quote = (log: HomeworkLog) =>
    (log.payload?.note || log.payload?.pain_area || '').trim();

  const completeLogs = logs.filter((l) => l.kind === 'complete');
  const partialLogs = logs.filter((l) => l.kind === 'partial');
  const cantLogs = logs.filter((l) => l.kind === 'cant');
  const painQuote = logs
    .filter((l) => l.kind === 'pain' || Boolean(quote(l)))
    .map(quote)
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .join(', ');

  let recordSummary: string;
  if (partialLogs.length) {
    const latestPartial = partialLogs[partialLogs.length - 1];
    const completedNames = (latestPartial.payload?.completed_items || [])
      .map((id) => items.find((item) => item.id === id)?.name)
      .filter(Boolean)
      .join(', ');
    recordSummary = completedNames
      ? `${completedNames} 일부 동작을 수행하셨고`
      : `일부 동작을 수행하셨고`;
  } else if (completeLogs.length && cantLogs.length) {
    recordSummary = `${itemNames} 일부는 완료, 일부는 진행이 어려우셨고`;
  } else if (completeLogs.length) {
    recordSummary = `${itemNames} 완료하셨고`;
  } else if (cantLogs.length) {
    recordSummary = `${itemNames} 진행이 어려우셨고`;
  } else {
    recordSummary = `${itemNames} 기록 확인하셨고`;
  }

  if (painQuote) {
    return `지난주에 ${recordSummary}, "${painQuote}" 하셔서 오늘은 그 부분부터 볼게요.`;
  }

  if (partialLogs.length) {
    return `지난주에 ${recordSummary}, 오늘은 어려웠던 동작과 몸 상태부터 확인할게요.`;
  }

  if (completeLogs.length && !cantLogs.length) {
    return `지난주에 ${itemNames} 모두 완료하셔서 오늘은 다음 단계로 넘어갈게요.`;
  }

  if (cantLogs.length && !completeLogs.length) {
    return `지난주에 ${itemNames} 진행이 어려우셨다고 하셔서 오늘은 부담 없는 쉬운 동작부터 다시 맞춰볼게요.`;
  }

  return `지난주에 전달드린 ${itemNames} 기록 확인하고 오늘 수업 이어갈게요.`;
}

/** Generate a short, evidence-aware renewal conversation paragraph. */
export function generateRenewalScript(
  memberName: string,
  endState: string,
  packageRemaining: number,
  packageTotal: number
): { text: string } {
  // The total package count is intentionally not used to infer attendance or outcomes.
  void packageTotal;
  const remaining = Math.max(0, packageRemaining);
  if (endState) {
    return {
      text: `${memberName}님, 남은 수업은 ${remaining}회입니다. 처음 말씀해 주신 “${endState}”가 요즘 생활에서 어떻게 느껴지는지 이야기 나눠보고, 남은 수업에서 어떤 부분을 더 살펴볼지 함께 정해보겠습니다.`,
    };
  }
  return {
    text: `${memberName}님, 남은 수업은 ${remaining}회입니다. 요즘 몸 상태와 운동하면서 느낀 점을 먼저 듣고, 남은 수업에서 어떤 부분을 더 살펴볼지 함께 정해보겠습니다.`,
  };
}
