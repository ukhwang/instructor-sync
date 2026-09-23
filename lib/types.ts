export type HomeworkStatus = 'draft' | 'sent' | 'opened' | 'logged' | 'revoked';

export type LogKind = 'complete' | 'partial' | 'cant' | 'pain' | 'note';

export type EffortKind = 'reps' | 'hold';

export type MemberRegistrationKind = 'new' | 'existing';

export type MemberImportSourceType =
  | 'direct_entry'
  | 'existing_note'
  | 'conversation'
  | 'other';

export interface Profile {
  id: string;
  email: string | null;
  name: string | null;
  is_pro: boolean;
  created_at: string;
}

export interface Member {
  id: string;
  trainer_id: string;
  name: string;
  phone: string;
  package_total: number;
  package_remaining: number;
  package_expires_on: string | null;
  end_state: string; // "허리 통증 없이 데드리프트 80kg 수행"
  created_at: string;
  updated_at: string;
}

export interface HomeworkItem {
  exercise_snapshot?: ExerciseSnapshot | null;
  id: string;
  homework_id: string;
  order_index: number;
  name: string;
  cue: string;
  target_sets: number;
  target_reps: string;
  effort_kind?: EffortKind;
  reps?: number | null;
  hold_seconds?: number | null;
  seconds_per_rep?: number;
  rest_seconds?: number;
  per_side?: boolean;
  requirement?: 'required' | 'optional';
  created_at: string;
}

export interface HomeworkLog {
  id: string;
  homework_id: string;
  kind: LogKind;
  payload: {
    note?: string;
    pain_area?: string;
    pain_level?: number;
    completed_items?: string[];
  };
  created_at: string;
}

export interface Homework {
  id: string;
  trainer_id: string;
  member_id: string;
  token: string;
  token_expires_at: string;
  revoked_at: string | null;
  why: string;
  status: HomeworkStatus;
  opening_line: string | null;
  created_at: string;
  updated_at: string;
  assignment_purpose?: 'routine' | 'focus' | 'review' | null;
  burden_budget_seconds?: number | null;
  source_homework_id?: string | null;
  // joined fields
  member?: Pick<Member, 'id' | 'name' | 'phone' | 'package_remaining' | 'end_state'>;
  items?: HomeworkItem[];
  logs?: HomeworkLog[];
}

export interface SessionNote {
  id: string;
  trainer_id: string;
  member_id: string;
  note: string;
  created_at: string;
}

export interface MemberImportRecord {
  id: string;
  trainer_id: string;
  member_id: string;
  request_id: string;
  source_type: MemberImportSourceType;
  raw_text: string;
  summary: string | null;
  recorded_from: string | null;
  recorded_to: string | null;
  imported_at: string;
  created_at: string;
}

export interface MemberImportInput {
  source_type: MemberImportSourceType;
  raw_text: string;
  summary?: string | null;
  recorded_from?: string | null;
  recorded_to?: string | null;
}

export interface MemberRegistrationInput {
  request_id: string;
  member_kind: MemberRegistrationKind;
  name: string;
  phone: string;
  package_total: number;
  package_remaining?: number | null;
  package_expires_on?: string | null;
  end_state: string;
  import_record?: MemberImportInput | null;
}

export interface SeedExercise {
  id?: string;
  category: string;
  name: string;
  default_cue: string;
  default_sets: number;
  default_reps: string;
  default_effort_kind: EffortKind;
  default_rep_count: number | null;
  default_hold_seconds: number | null;
  default_seconds_per_rep: number;
  default_rest_seconds: number;
  default_per_side: boolean;
}

export type ExercisePreset = SeedExercise;

export interface ExerciseSnapshot {
  exercise_id: string;
  content_version: number;
  source: 'seed' | 'database';
  name: string;
  default_cue: string;
  media_url: string | null;
  media_alt: string | null;
  source_note: string;
}

export interface OpenHomeworkResult {
  success: boolean;
  reason?: 'not_found' | 'revoked' | 'expired' | 'unavailable';
  homework?: {
    id: string;
    why: string;
    status: HomeworkStatus;
    token?: string;
    token_expires_at: string;
    created_at: string;
  };
  member?: {
    id?: string;
    name: string;
  };
  items?: HomeworkItem[];
  logs?: HomeworkLog[];
}

export interface LogHomeworkResult {
  success: boolean;
  log_id?: string;
  status?: string;
  opening_line?: string;
  reason?: string;
}

export interface SubmitHomeworkFeedbackResult extends LogHomeworkResult {
  pain_log_id?: string | null;
  submitted_at?: string;
  snapshot_hash?: string;
}
