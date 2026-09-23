import { create } from 'zustand';
import { ExerciseSnapshot, SeedExercise } from '@/lib/types';
import type { ExerciseRecord } from '@/lib/exercises/types';
import type { HomeworkPurpose } from '@/lib/homework-why';
import { inferCoachFromRepsLabel, normalizeCoachItem } from '@/lib/coach';

export interface DraftItem {
  exercise_snapshot?: ExerciseSnapshot | null;
  id: string;
  name: string;
  cue: string;
  target_sets: number;
  target_reps: string;
  effort_kind?: 'reps' | 'hold';
  reps?: number | null;
  hold_seconds?: number | null;
  seconds_per_rep?: number;
  rest_seconds?: number;
  per_side?: boolean;
  requirement: 'required' | 'optional';
}

interface HomeworkDraftState {
  memberId: string;
  why: string;
  whyEdited: boolean;
  purpose: HomeworkPurpose;
  sessionGoal: string;
  burdenBudgetMinutes: string;
  setPurpose: (purpose: HomeworkPurpose) => void;
  setSessionGoal: (goal: string) => void;
  setBurdenBudgetMinutes: (minutes: string) => void;
  setGeneratedWhy: (why: string) => void;
  items: DraftItem[];
  setMemberId: (id: string) => void;
  hydrateDraft: (draft: {
    memberId: string;
    why: string;
    purpose: HomeworkPurpose;
    burdenBudgetMinutes: string;
    sessionGoal: string;
    items: Array<Omit<DraftItem, 'id'> & Partial<Pick<DraftItem, 'id'>>>;
  }) => void;
  setWhy: (why: string) => void;
  addItem: (item: Omit<DraftItem, 'id' | 'requirement'> & Partial<Pick<DraftItem, 'requirement'>>) => boolean;
  addSeedItem: (seed: SeedExercise) => boolean;
  removeItem: (index: number) => void;
  updateItem: (index: number, patch: Partial<Omit<DraftItem, 'id'>>) => void;
  resetDraft: () => void;
}

const initialDraftState = {
  memberId: '',
  why: '',
  whyEdited: false,
  purpose: 'review' as HomeworkPurpose,
  sessionGoal: '',
  burdenBudgetMinutes: '',
  items: [
    normalizeCoachItem({
      id: 'draft-item-1',
      name: '',
      cue: '',
      target_sets: 3,
      target_reps: '12회',
      requirement: 'required',
    }),
  ],
};

export const useHomeworkDraftStore = create<HomeworkDraftState>((set, get) => ({
  ...initialDraftState,

  setMemberId: (id) => set({ memberId: id }),

  hydrateDraft: (draft) => set({
    memberId: draft.memberId,
    why: draft.why,
    whyEdited: true,
    purpose: draft.purpose,
    burdenBudgetMinutes: draft.burdenBudgetMinutes,
    sessionGoal: draft.sessionGoal,
    items: draft.items.map((item, index) => normalizeCoachItem({
      ...item,
      id: item.id || `draft-clone-${Date.now()}-${index}`,
      requirement: item.requirement ?? 'required',
    })),
  }),

  setWhy: (why) => set({ why, whyEdited: true }),
  setPurpose: (purpose) => set({ purpose }),
  setSessionGoal: (sessionGoal) => set({ sessionGoal }),
  setBurdenBudgetMinutes: (burdenBudgetMinutes) => set({ burdenBudgetMinutes }),
  setGeneratedWhy: (why) => { if (!get().whyEdited) set({ why }); },

  addItem: (item) => {
    const current = get().items;
    if (current.length >= 3) return false;
    set({
      items: [
        ...current,
        {
          id: `draft-item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          ...normalizeCoachItem(item),
          requirement: item.requirement ?? 'required',
        },
      ],
    });
    return true;
  },

  addSeedItem: (seed) => {
    const record = seed as Partial<ExerciseRecord>;
    const exercise_snapshot: ExerciseSnapshot | null = record.exercise_id ? {
      exercise_id: record.exercise_id, content_version: record.content_version ?? 1,
      source: record.source ?? 'seed', name: seed.name, default_cue: seed.default_cue,
      media_url: record.media_url ?? null, media_alt: record.media_alt ?? null,
      source_note: record.source_note ?? '기존 기본 운동 목록',
    } : null;
    const current = get().items;
    if (current.length >= 3) return false;
    // If the only item is empty, replace it
    if (current.length === 1 && !current[0].name.trim()) {
      set({
        items: [
          {
            id: current[0].id,
            exercise_snapshot,
            name: seed.name,
            cue: seed.default_cue,
            target_sets: seed.default_sets,
            target_reps: seed.default_reps,
            effort_kind: seed.default_effort_kind,
            reps: seed.default_rep_count,
            hold_seconds: seed.default_hold_seconds,
            seconds_per_rep: seed.default_seconds_per_rep,
            rest_seconds: seed.default_rest_seconds,
            per_side: seed.default_per_side,
            requirement: 'required',
          },
        ],
      });
      return true;
    }
    set({
      items: [
        ...current,
        {
          id: `draft-item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          exercise_snapshot,
          name: seed.name,
          cue: seed.default_cue,
          target_sets: seed.default_sets,
          target_reps: seed.default_reps,
          effort_kind: seed.default_effort_kind,
          reps: seed.default_rep_count,
          hold_seconds: seed.default_hold_seconds,
          seconds_per_rep: seed.default_seconds_per_rep,
          rest_seconds: seed.default_rest_seconds,
          per_side: seed.default_per_side,
          requirement: 'required',
        },
      ],
    });
    return true;
  },

  removeItem: (index) => {
    const current = get().items;
    if (current.length <= 1) {
      // Clear the single item instead of removing
      set({
        items: [
          normalizeCoachItem({
            id: current[0].id,
            name: '',
            cue: '',
            target_sets: 3,
            target_reps: '10회',
            requirement: 'required',
          }),
        ],
      });
      return;
    }
    set({
      items: current.filter((_, i) => i !== index),
    });
  },

  updateItem: (index, patch) => {
    const current = [...get().items];
    if (current[index]) {
      const updated = { ...current[index], ...patch };
      if (patch.target_reps !== undefined && patch.target_reps !== current[index].target_reps) {
        const inferred = inferCoachFromRepsLabel(patch.target_reps);
        updated.effort_kind = inferred.default_effort_kind;
        updated.reps = inferred.default_reps;
        updated.hold_seconds = inferred.default_hold_seconds;
      }
      current[index] = updated;
      set({ items: current });
    }
  },

  resetDraft: () => set(initialDraftState),
}));
