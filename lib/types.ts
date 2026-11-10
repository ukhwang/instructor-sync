/**
 * 운동숙제 (instructor-sync) 통합 도메인 타입 정의
 * - DB 계층(snake_case) 및 V1 호환성 보존
 * - Claude Opus V2 UI 계층(QuickAssignDrawer, MemberHomeworkClient, MilestoneReportCard) 계약 100% 충족
 */

export type ISODateString = string;

export const PAIN_AREAS = ["허리", "무릎", "어깨", "목"] as const;
export type PainArea = (typeof PAIN_AREAS)[number];

export const FEEDBACK_MOODS = ["good", "hard", "pain"] as const;
export type FeedbackMood = (typeof FEEDBACK_MOODS)[number];

export type HomeworkStatus =
  | 'draft'
  | 'sent'
  | 'opened'
  | 'logged'
  | 'revoked'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'expired';

export type LogKind = 'complete' | 'partial' | 'cant' | 'pain' | 'note';

export type EffortKind = 'reps' | 'hold';

export type MediaType = "video" | "image";

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
  name: string;
  phoneLast4?: string | null;
  ptSessionCount?: number;
  nextSessionAt?: ISODateString | null;
  avatarUrl?: string | null;
  trainer_id?: string;
  phone?: string;
  package_total?: number;
  package_remaining?: number;
  package_expires_on?: string | null;
  end_state?: string;
  created_at?: string;
  updated_at?: string;
}

export interface HomeworkItem {
  id: string;
  homeworkId?: string;
  homework_id?: string;
  order?: number;
  order_index?: number;
  exerciseName?: string;
  name?: string;
  sets?: number;
  target_sets?: number;
  reps?: number | null;
  target_reps?: string;
  durationSec?: number | null;
  hold_seconds?: number | null;
  restSec?: number;
  rest_seconds?: number;
  cue?: string | null;
  mediaUrl?: string | null;
  mediaType?: MediaType | null;
  posterUrl?: string | null;
  exercise_snapshot?: ExerciseSnapshot | null;
  effort_kind?: EffortKind;
  seconds_per_rep?: number;
  per_side?: boolean;
  requirement?: 'required' | 'optional';
  created_at?: string;
}

export interface HomeworkLog {
  id: string;
  homeworkId?: string;
  homework_id?: string;
  memberId?: string;
  completedSets?: number;
  totalSets?: number;
  mood?: FeedbackMood | null;
  painAreas?: PainArea[];
  painScore?: number | null;
  voiceMemoText?: string | null;
  loggedAt?: ISODateString;
  kind?: LogKind;
  payload?: {
    note?: string;
    pain_area?: string;
    pain_level?: number;
    completed_items?: string[];
  };
  created_at?: string;
}

export interface Homework {
  id: string;
  memberId?: string;
  member_id?: string;
  trainer_id?: string;
  title?: string;
  why: string;
  presetId?: string | null;
  token: string;
  token_expires_at?: string;
  revoked_at?: string | null;
  status: HomeworkStatus;
  opening_line?: string | null;
  created_at?: string;
  updated_at?: string;
  assignedAt?: ISODateString;
  dueAt?: ISODateString | null;
  assignment_purpose?: 'routine' | 'focus' | 'review' | null;
  burden_budget_seconds?: number | null;
  source_homework_id?: string | null;
  items?: HomeworkItem[];
  logs?: HomeworkLog[];
  member?: Pick<Member, 'id' | 'name'> & Partial<Member>;
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
