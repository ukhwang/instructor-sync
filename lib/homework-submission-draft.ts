import { createRequestId, isRequestId } from "./homework-assignment";

export interface HomeworkSubmissionInput {
  homeworkId: string;
  completedItemIds: string[];
  discomfortLevel: number;
  note: string;
  explicitlyCant: boolean;
}

export interface HomeworkSubmissionDraft extends HomeworkSubmissionInput {
  requestId: string;
  fingerprint: string;
}

const STORAGE_PREFIX = "homework-submission-v2:";

export function normalizeCompletedItemIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))].sort();
}

export function canSubmitHomework(completedItemIds: string[], explicitlyCant: boolean): boolean {
  return explicitlyCant || completedItemIds.length > 0;
}

export function createSubmissionFingerprint(input: HomeworkSubmissionInput): string {
  return JSON.stringify({
    homeworkId: input.homeworkId,
    completedItemIds: normalizeCompletedItemIds(input.completedItemIds),
    discomfortLevel: input.discomfortLevel,
    note: input.note.trim(),
    explicitlyCant: input.explicitlyCant,
  });
}

function storageKey(homeworkId: string): string {
  return `${STORAGE_PREFIX}${homeworkId}`;
}

function isDraft(value: unknown, homeworkId: string): value is HomeworkSubmissionDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<HomeworkSubmissionDraft>;
  return draft.homeworkId === homeworkId
    && Array.isArray(draft.completedItemIds)
    && draft.completedItemIds.every((id) => typeof id === "string")
    && Number.isInteger(draft.discomfortLevel)
    && Number(draft.discomfortLevel) >= 1
    && Number(draft.discomfortLevel) <= 10
    && typeof draft.note === "string"
    && typeof draft.explicitlyCant === "boolean"
    && typeof draft.fingerprint === "string"
    && isRequestId(draft.requestId);
}

export function loadSubmissionDraft(homeworkId: string): HomeworkSubmissionDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage?.getItem(storageKey(homeworkId));
    const value: unknown = raw ? JSON.parse(raw) : null;
    return isDraft(value, homeworkId) ? value : null;
  } catch {
    return null;
  }
}

export function prepareSubmissionDraft(
  input: HomeworkSubmissionInput,
  previous = loadSubmissionDraft(input.homeworkId),
): HomeworkSubmissionDraft {
  const normalizedInput = {
    ...input,
    completedItemIds: normalizeCompletedItemIds(input.completedItemIds),
    note: input.note.trim(),
  };
  const fingerprint = createSubmissionFingerprint(normalizedInput);
  return {
    ...normalizedInput,
    fingerprint,
    requestId: previous?.fingerprint === fingerprint ? previous.requestId : createRequestId(),
  };
}

export function saveSubmissionDraft(draft: HomeworkSubmissionDraft): void {
  if (typeof window === "undefined" || !isDraft(draft, draft.homeworkId)) return;
  try {
    window.sessionStorage?.setItem(storageKey(draft.homeworkId), JSON.stringify(draft));
  } catch {
    // Storage is best effort. The request remains idempotent during this page attempt.
  }
}

export function clearSubmissionDraft(homeworkId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage?.removeItem(storageKey(homeworkId));
  } catch {
    // A completed server submission remains immutable even if local cleanup fails.
  }
}

