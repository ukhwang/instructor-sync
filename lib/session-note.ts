const STRUCTURED_SESSION_NOTE_PREFIX = '[SESSION_NOTE_V1]';

export interface StructuredSessionNote {
  bodyArea: string;
  observation: string;
  exercise: string;
  goal: string;
  memo?: string;
}

export function serializeStructuredSessionNote(note: StructuredSessionNote): string {
  return `${STRUCTURED_SESSION_NOTE_PREFIX}${JSON.stringify(note)}`;
}

export function parseStructuredSessionNote(note: string): StructuredSessionNote | null {
  if (!note.startsWith(STRUCTURED_SESSION_NOTE_PREFIX)) return null;

  try {
    const parsed = JSON.parse(note.slice(STRUCTURED_SESSION_NOTE_PREFIX.length)) as Partial<StructuredSessionNote>;
    if (
      typeof parsed.bodyArea !== 'string' ||
      typeof parsed.observation !== 'string' ||
      typeof parsed.exercise !== 'string' ||
      typeof parsed.goal !== 'string'
    ) {
      return null;
    }

    return {
      bodyArea: parsed.bodyArea,
      observation: parsed.observation,
      exercise: parsed.exercise,
      goal: parsed.goal,
      ...(typeof parsed.memo === 'string' && parsed.memo.trim()
        ? { memo: parsed.memo }
        : {}),
    };
  } catch {
    return null;
  }
}
