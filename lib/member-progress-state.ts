import type { MemberProgressGoal, MemberProgressObservation, ProgressMetric, ProgressSource } from './member-progress-types';

export function seoulToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export interface MeasurementDraft {
  measuredOn: string;
  measured: boolean;
  value: string;
  reason: string;
  source: ProgressSource;
  memo: string;
}

export function emptyMeasurement(): MeasurementDraft {
  return { measuredOn: seoulToday(), measured: true, value: '', reason: '', source: 'trainer_measurement', memo: '' };
}

export function parseProgressNumber(text: string, metric: ProgressMetric): number {
  const value = text.trim() === '' ? NaN : Number(text);
  if (!Number.isFinite(value) || value < 0 || (metric === 'difficulty' && (!Number.isInteger(value) || value > 10))) {
    throw new Error(metric === 'difficulty' ? '활동 어려움은 0~10 사이의 정수로 입력해 주세요.' : '0 이상의 측정값을 입력해 주세요.');
  }
  return value;
}

export function measurementPayload(draft: MeasurementDraft, metric: ProgressMetric, now = new Date()) {
  const date = new Date(`${draft.measuredOn}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.measuredOn) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== draft.measuredOn || draft.measuredOn > seoulToday(now)) {
    throw new Error('측정일은 오늘까지의 유효한 날짜로 입력해 주세요.');
  }
  if (!draft.measured && (!draft.reason.trim() || draft.reason.trim().length > 200)) throw new Error('미측정 사유를 200자 이내로 입력해 주세요.');
  return {
    measured_on: draft.measuredOn,
    value: draft.measured ? parseProgressNumber(draft.value, metric) : null,
    unmeasured_reason: draft.measured ? null : draft.reason.trim(),
    source: draft.source,
    actor: 'trainer' as const,
    memo: draft.memo.trim() || null,
  };
}

export function progressSeries(goal: MemberProgressGoal, observations: MemberProgressObservation[]) {
  const matching = observations.filter((row) => row.goal_id === goal.id && row.definition_version === goal.definition_version && row.metric === goal.metric && row.unit === goal.unit);
  const replaced = new Set(matching.map((row) => row.supersedes_observation_id).filter(Boolean));
  const byId = new Map(matching.map((row) => [row.id, row]));
  const rootTime = (row: MemberProgressObservation) => {
    const seen = new Set<string>();
    while (row.supersedes_observation_id && !seen.has(row.id)) {
      seen.add(row.id);
      const parent = byId.get(row.supersedes_observation_id);
      if (!parent) break;
      row = parent;
    }
    return row.created_at;
  };
  const rows = matching.filter((row) => !replaced.has(row.id)).sort((a, b) => a.measured_on.localeCompare(b.measured_on) || rootTime(a).localeCompare(rootTime(b)) || a.id.localeCompare(b.id));
  const comparisons = (['trainer_measurement', 'member_report'] as const).map((source) => {
    const numeric = rows.filter((row) => row.source === source && row.value !== null);
    return { source, first: numeric[0], recent: numeric[numeric.length - 1] };
  });
  return { rows, comparisons };
}
