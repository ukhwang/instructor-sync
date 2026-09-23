const METRIC_UNITS = Object.freeze({
  duration: 'seconds',
  reps: 'count',
  distance: 'meters',
  difficulty: 'score_0_10',
});

const DIRECTIONS = new Set(['increase', 'decrease', 'none']);
const SOURCES = new Set(['member_report', 'trainer_measurement']);
const ACTORS = new Set(['member', 'trainer']);

function text(value, field, max) {
  if (typeof value !== 'string' || value.trim().length === 0) return `${field}_required`;
  if (value.trim().length > max) return `${field}_too_long`;
  return null;
}

function dateError(value, now = new Date()) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'measured_on_invalid';
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return 'measured_on_invalid';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  if (value > today) return 'measured_on_future';
  return null;
}

export function validateGoalInput(input) {
  if (!input || typeof input !== 'object') return ['goal_invalid'];
  const errors = [];
  for (const [field, max] of [['member_id', 100], ['name', 100], ['condition', 500]]) {
    const error = text(input[field], field, max);
    if (error) errors.push(error);
  }
  if (!Object.prototype.hasOwnProperty.call(METRIC_UNITS, input.metric)) errors.push('metric_invalid');
  if (!DIRECTIONS.has(input.direction)) errors.push('direction_invalid');
  if (input.unit !== METRIC_UNITS[input.metric]) errors.push('unit_invalid');
  if (!Number.isFinite(input.target_value) || input.target_value < 0) errors.push('target_value_invalid');
  if (input.metric === 'difficulty' && (!Number.isInteger(input.target_value) || input.target_value > 10)) errors.push('target_value_invalid');
  if (!Number.isInteger(input.definition_version) || input.definition_version < 1) errors.push('definition_version_invalid');
  return errors;
}

export function validateObservationInput(input, now = new Date()) {
  if (!input || typeof input !== 'object') return ['observation_invalid'];
  const errors = [];
  const goalError = text(input.goal_id, 'goal_id', 100);
  if (goalError) errors.push(goalError);
  if (!Number.isInteger(input.definition_version) || input.definition_version < 1) errors.push('definition_version_invalid');
  const date = dateError(input.measured_on, now);
  if (date) errors.push(date);
  if (!Object.prototype.hasOwnProperty.call(METRIC_UNITS, input.metric)) errors.push('metric_invalid');
  if (input.unit !== METRIC_UNITS[input.metric]) errors.push('unit_invalid');
  if (!SOURCES.has(input.source)) errors.push('source_invalid');
  if (!ACTORS.has(input.actor)) errors.push('actor_invalid');
  const hasValue = input.value !== null && input.value !== undefined;
  if (hasValue && (!Number.isFinite(input.value) || input.value < 0)) errors.push('value_invalid');
  if (hasValue && input.metric === 'difficulty' && (!Number.isInteger(input.value) || input.value > 10)) errors.push('value_invalid');
  if (hasValue && input.unmeasured_reason != null && input.unmeasured_reason.trim() !== '') errors.push('value_reason_conflict');
  if (!hasValue && !text(input.unmeasured_reason, 'unmeasured_reason', 200)) {
    // A reason is required when no numeric observation exists.
  } else if (!hasValue) {
    errors.push('unmeasured_reason_required');
  }
  if (input.memo !== null && input.memo !== undefined) {
    const memoError = text(input.memo, 'memo', 1000);
    if (memoError && memoError !== 'memo_required') errors.push(memoError);
  }
  return errors;
}

export { METRIC_UNITS };
