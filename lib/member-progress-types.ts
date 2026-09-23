export type ProgressMetric = 'duration' | 'reps' | 'distance' | 'difficulty';
export type ProgressDirection = 'increase' | 'decrease' | 'none';
export type ProgressSource = 'member_report' | 'trainer_measurement';
export type ProgressActor = 'member' | 'trainer';
export type MemberChangeOpinion = 'better' | 'same' | 'worse' | 'unknown';

export interface MemberProgressGoalInput {
  request_id: string;
  member_id: string;
  name: string;
  condition: string;
  metric: ProgressMetric;
  direction: ProgressDirection;
  unit: 'seconds' | 'count' | 'meters' | 'score_0_10';
  target_value: number;
  definition_version: number;
  reassessment_due_on?: string | null;
  measured_on: string;
  value?: number | null;
  unmeasured_reason?: string | null;
  source: ProgressSource;
  actor: ProgressActor;
  memo?: string | null;
  opinion?: MemberChangeOpinion | null;
}

export interface MemberProgressObservationInput {
  request_id: string;
  goal_id: string;
  definition_version: number;
  metric: ProgressMetric;
  unit: 'seconds' | 'count' | 'meters' | 'score_0_10';
  measured_on: string;
  value?: number | null;
  unmeasured_reason?: string | null;
  source: ProgressSource;
  actor: ProgressActor;
  memo?: string | null;
  opinion?: MemberChangeOpinion | null;
  supersedes_observation_id?: string | null;
  correction_reason?: string | null;
}

export interface MemberProgressGoal {
  id: string;
  trainer_id: string;
  member_id: string;
  series_id: string;
  name: string;
  condition: string;
  metric: ProgressMetric;
  direction: ProgressDirection;
  unit: string;
  target_value: number;
  definition_version: number;
  is_active: boolean;
  reassessment_due_on: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemberProgressObservation {
  id: string;
  trainer_id: string;
  member_id: string;
  goal_id: string;
  definition_version: number;
  metric: ProgressMetric;
  unit: string;
  measured_on: string;
  value: number | null;
  unmeasured_reason: string | null;
  source: ProgressSource;
  actor: ProgressActor;
  memo: string | null;
  supersedes_observation_id: string | null;
  correction_reason: string | null;
  created_at: string;
}

export interface MemberProgressOpinion {
  id: string;
  trainer_id: string;
  member_id: string;
  observation_id: string;
  opinion: MemberChangeOpinion;
  actor: ProgressActor;
  created_at: string;
}

export interface MemberProgressResult {
  success: boolean;
  retryable?: boolean;
  reason?: string;
  goal_id?: string;
  observation_id?: string;
  goals?: MemberProgressGoal[];
  observations?: MemberProgressObservation[];
  opinions?: MemberProgressOpinion[];
}
