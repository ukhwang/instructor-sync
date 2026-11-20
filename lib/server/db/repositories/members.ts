import 'server-only';
import { z } from 'zod';
import type { Member, MemberImportRecord, MemberRegistrationInput, Profile } from '@/lib/types';
import {
  bool,
  canonicalJson,
  isDbError,
  isUniqueViolation,
  isUuid,
  newId,
  nowIso,
  parseJson,
  type Db,
} from '../sql';

/*
 * Members repository. Every function takes the authenticated trainerId as its
 * first argument and scopes every statement with it (RLS replacement). Callers
 * must never pass a trainer id that came from the client.
 */

type Row = Record<string, unknown>;

export function toMember(row: Row): Member {
  return {
    id: String(row.id),
    trainer_id: String(row.trainer_id),
    name: String(row.name),
    phone: String(row.phone),
    package_total: Number(row.package_total),
    package_remaining: Number(row.package_remaining),
    package_expires_on: (row.package_expires_on as string | null) ?? null,
    end_state: String(row.end_state ?? ''),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function toImportRecord(row: Row): MemberImportRecord {
  return {
    id: String(row.id),
    trainer_id: String(row.trainer_id),
    member_id: String(row.member_id),
    request_id: String(row.request_id),
    source_type: row.source_type as MemberImportRecord['source_type'],
    raw_text: String(row.raw_text),
    summary: (row.summary as string | null) ?? null,
    recorded_from: (row.recorded_from as string | null) ?? null,
    recorded_to: (row.recorded_to as string | null) ?? null,
    imported_at: String(row.imported_at),
    created_at: String(row.created_at),
  };
}

const MEMBER_COLUMNS =
  'id, trainer_id, name, phone, package_total, package_remaining, package_expires_on, end_state, created_at, updated_at';

export async function getProfile(db: Db, trainerId: string): Promise<Profile | null> {
  const row = await db
    .prepare('SELECT id, email, name, is_pro, created_at FROM profiles WHERE id = ?')
    .bind(trainerId)
    .first<Row>();
  if (!row) return null;
  return {
    id: String(row.id),
    email: (row.email as string | null) ?? null,
    name: (row.name as string | null) ?? null,
    is_pro: bool(row.is_pro),
    created_at: String(row.created_at),
  };
}

/** Called once when a trainer account is created (replaces the former auth.users insert trigger). */
export async function ensureProfile(db: Db, user: { id: string; email: string; name: string }): Promise<void> {
  await db
    .prepare('INSERT INTO profiles (id, email, name, is_pro) VALUES (?, ?, ?, 0) ON CONFLICT (id) DO NOTHING')
    .bind(user.id, user.email, user.name.trim() || user.email.split('@')[0] || '강사')
    .run();
}

export async function listMembers(db: Db, trainerId: string): Promise<Member[]> {
  const { results } = await db
    .prepare(`SELECT ${MEMBER_COLUMNS} FROM members WHERE trainer_id = ? ORDER BY created_at DESC, id`)
    .bind(trainerId)
    .all<Row>();
  return results.map(toMember);
}

export async function getMember(db: Db, trainerId: string, memberId: string): Promise<Member | null> {
  if (!isUuid(memberId)) return null;
  const row = await db
    .prepare(`SELECT ${MEMBER_COLUMNS} FROM members WHERE id = ? AND trainer_id = ?`)
    .bind(memberId, trainerId)
    .first<Row>();
  return row ? toMember(row) : null;
}

/* ── Registration (was RPC register_member_with_import) ───────────────────── */

const SOURCE_TYPES = ['direct_entry', 'existing_note', 'conversation', 'other'] as const;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalDate = z.union([isoDate, z.literal(''), z.null(), z.undefined()]).transform((value) => value || null);

export const memberRegistrationSchema = z
  .object({
    request_id: z.string().uuid(),
    member_kind: z.enum(['new', 'existing']),
    name: z.string().trim().min(1).max(100),
    phone: z.string().trim().min(1).max(30),
    package_total: z.number().int().min(1).max(1000),
    package_remaining: z.number().int().nullable().optional(),
    package_expires_on: optionalDate.optional(),
    end_state: z.string().trim().min(1).max(500),
    import_record: z
      .object({
        source_type: z.enum(SOURCE_TYPES),
        raw_text: z.string(),
        summary: z.string().nullable().optional(),
        recorded_from: optionalDate.optional(),
        recorded_to: optionalDate.optional(),
      })
      .nullable()
      .optional(),
  })
  .strict();

export type RegisterMemberResult =
  | { success: true; member: Member; import_record: MemberImportRecord | null; replayed: boolean }
  | { success: false; reason: string };

export async function registerMember(db: Db, trainerId: string, input: MemberRegistrationInput): Promise<RegisterMemberResult> {
  const parsed = memberRegistrationSchema.safeParse(input);
  if (!parsed.success) return { success: false, reason: registrationReason(parsed.error) };
  const data = {
    ...parsed.data,
    package_expires_on: parsed.data.package_expires_on ?? null,
    import_record: parsed.data.import_record
      ? {
          ...parsed.data.import_record,
          recorded_from: parsed.data.import_record.recorded_from ?? null,
          recorded_to: parsed.data.import_record.recorded_to ?? null,
        }
      : null,
  };

  const remaining = data.member_kind === 'new' ? data.package_total : data.package_remaining;
  if (remaining === null || remaining === undefined || remaining < 0 || remaining > data.package_total) {
    return { success: false, reason: 'invalid_package_remaining' };
  }
  const rawText = data.import_record?.raw_text.trim() || null;
  const summary = data.import_record?.summary?.trim() || null;
  if (rawText) {
    if (rawText.length > 20000) return { success: false, reason: 'import_text_too_long' };
    if (summary && summary.length > 2000) return { success: false, reason: 'import_summary_too_long' };
    const from = data.import_record?.recorded_from;
    const to = data.import_record?.recorded_to;
    if (from && to && from > to) return { success: false, reason: 'invalid_import_date_range' };
  }

  const payload = canonicalJson({
    member_kind: data.member_kind,
    name: data.name,
    phone: data.phone,
    package_total: data.package_total,
    package_remaining: remaining,
    package_expires_on: data.package_expires_on,
    end_state: data.end_state,
    import_source_type: rawText ? data.import_record?.source_type ?? null : null,
    import_raw_text: rawText,
    import_summary: rawText ? summary : null,
    import_recorded_from: rawText ? data.import_record?.recorded_from ?? null : null,
    import_recorded_to: rawText ? data.import_record?.recorded_to ?? null : null,
  });

  const replay = await replayRegistration(db, trainerId, data.request_id, payload);
  if (replay) return replay;

  const now = nowIso();
  const memberId = newId();
  const statements: D1PreparedStatement[] = [
    // members_free_plan_limit trigger enforces audit C-1 inside this statement.
    db
      .prepare(
        `INSERT INTO members (id, trainer_id, name, phone, package_total, package_remaining, package_expires_on, end_state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(memberId, trainerId, data.name, data.phone, data.package_total, remaining, data.package_expires_on, data.end_state, now, now),
  ];
  if (rawText) {
    statements.push(
      db
        .prepare(
          `INSERT INTO member_import_records (id, trainer_id, member_id, request_id, source_type, raw_text, summary, recorded_from, recorded_to, imported_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          newId(),
          trainerId,
          memberId,
          data.request_id,
          data.import_record?.source_type ?? 'existing_note',
          rawText,
          summary,
          data.import_record?.recorded_from ?? null,
          data.import_record?.recorded_to ?? null,
          now,
          now,
        ),
    );
  }
  // The idempotency row is written in the same batch (one transaction): a
  // concurrent duplicate fails on the primary key and the whole batch rolls back.
  statements.push(
    db
      .prepare('INSERT INTO member_onboarding_requests (trainer_id, request_id, request_payload, member_id, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(trainerId, data.request_id, payload, memberId, now),
  );

  try {
    await db.batch(statements);
  } catch (error) {
    if (isDbError(error, 'free_plan_member_limit')) return { success: false, reason: 'free_plan_member_limit' };
    if (isUniqueViolation(error, 'member_onboarding_requests') || isUniqueViolation(error, 'member_import_records')) {
      const raced = await replayRegistration(db, trainerId, data.request_id, payload);
      if (raced) return raced;
    }
    throw error;
  }

  const created = await readRegistration(db, trainerId, memberId, data.request_id);
  if (!created) throw new Error('member_registration_not_visible');
  return { success: true, ...created, replayed: false };
}

async function replayRegistration(db: Db, trainerId: string, requestId: string, payload: string): Promise<RegisterMemberResult | null> {
  const existing = await db
    .prepare('SELECT request_payload, member_id FROM member_onboarding_requests WHERE trainer_id = ? AND request_id = ?')
    .bind(trainerId, requestId)
    .first<Row>();
  if (!existing) return null;
  if (canonicalJson(parseJson(existing.request_payload, null)) !== payload) return { success: false, reason: 'request_payload_conflict' };
  if (!existing.member_id) return { success: false, reason: 'request_incomplete' };
  const replayed = await readRegistration(db, trainerId, String(existing.member_id), requestId);
  if (!replayed) return { success: false, reason: 'request_incomplete' };
  return { success: true, ...replayed, replayed: true };
}

async function readRegistration(db: Db, trainerId: string, memberId: string, requestId: string) {
  const [memberResult, importResult] = await db.batch<Row>([
    db.prepare(`SELECT ${MEMBER_COLUMNS} FROM members WHERE id = ? AND trainer_id = ?`).bind(memberId, trainerId),
    db.prepare('SELECT * FROM member_import_records WHERE trainer_id = ? AND request_id = ?').bind(trainerId, requestId),
  ]);
  const member = memberResult.results[0];
  if (!member) return null;
  const record = importResult.results[0];
  return { member: toMember(member), import_record: record ? toImportRecord(record) : null };
}

function registrationReason(error: z.ZodError): string {
  const field = String(error.issues[0]?.path[0] ?? '');
  const map: Record<string, string> = {
    request_id: 'request_id_required',
    member_kind: 'invalid_member_kind',
    name: 'invalid_name',
    phone: 'invalid_phone',
    end_state: 'invalid_end_state',
    package_total: 'invalid_package_total',
    package_remaining: 'invalid_package_remaining',
    package_expires_on: 'invalid_package_expires_on',
    import_record: 'invalid_import_record',
  };
  return map[field] ?? 'invalid_input';
}

/* ── Update (was a direct PostgREST update under RLS) ─────────────────────── */

/**
 * Only these fields are writable. trainer_id / is_pro / ids / timestamps from
 * the client are rejected (strict schema), closing audit NV-2.
 */
export const memberPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    phone: z.string().trim().min(1).max(30).optional(),
    package_total: z.number().int().min(1).max(1000).optional(),
    package_remaining: z.number().int().min(0).max(1000).optional(),
    package_expires_on: optionalDate.optional(),
    end_state: z.string().trim().max(500).optional(),
  })
  .strict();

export type MemberPatch = z.input<typeof memberPatchSchema>;

export async function updateMember(db: Db, trainerId: string, memberId: string, patch: MemberPatch): Promise<Member | null> {
  if (!isUuid(memberId)) return null;
  const data = memberPatchSchema.parse(patch);
  const entries = Object.entries(data).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return getMember(db, trainerId, memberId);
  const assignments = entries.map(([column]) => `${column} = ?`).join(', ');
  try {
    const row = await db
      .prepare(`UPDATE members SET ${assignments}, updated_at = ? WHERE id = ? AND trainer_id = ? RETURNING ${MEMBER_COLUMNS}`)
      .bind(...entries.map(([, value]) => value ?? null), nowIso(), memberId, trainerId)
      .first<Row>();
    return row ? toMember(row) : null;
  } catch (error) {
    if (isDbError(error, 'CHECK constraint failed')) throw new MemberValidationError('invalid_member_patch');
    throw error;
  }
}

export class MemberValidationError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'MemberValidationError';
  }
}

/* ── Imported history records ─────────────────────────────────────────────── */

export async function listImportRecords(db: Db, trainerId: string, memberId: string): Promise<MemberImportRecord[]> {
  if (!isUuid(memberId)) return [];
  const { results } = await db
    .prepare('SELECT * FROM member_import_records WHERE trainer_id = ? AND member_id = ? ORDER BY imported_at DESC, id')
    .bind(trainerId, memberId)
    .all<Row>();
  return results.map(toImportRecord);
}

export const importRecordSchema = z
  .object({
    request_id: z.string().uuid(),
    member_id: z.string().uuid(),
    source_type: z.enum(SOURCE_TYPES),
    raw_text: z.string().trim().min(1).max(20000),
    summary: z.string().nullable().optional(),
    recorded_from: optionalDate.optional(),
    recorded_to: optionalDate.optional(),
  })
  .strict();

export type AddImportRecordResult =
  | { success: true; import_record: MemberImportRecord }
  | { success: false; reason: string };

/** Idempotent on (trainer_id, request_id); was RPC add_member_import_record. */
export async function addImportRecord(db: Db, trainerId: string, input: z.input<typeof importRecordSchema>): Promise<AddImportRecordResult> {
  const parsed = importRecordSchema.safeParse(input);
  if (!parsed.success) return { success: false, reason: 'invalid_import_record' };
  const data = { ...parsed.data, recorded_from: parsed.data.recorded_from ?? null, recorded_to: parsed.data.recorded_to ?? null };
  const summary = data.summary?.trim() || null;
  if (summary && summary.length > 2000) return { success: false, reason: 'import_summary_too_long' };
  if (data.recorded_from && data.recorded_to && data.recorded_from > data.recorded_to) {
    return { success: false, reason: 'invalid_import_date_range' };
  }
  const now = nowIso();
  try {
    // INSERT ... SELECT FROM members scopes the parent to this trainer; 0 rows = not owned.
    const inserted = await db
      .prepare(
        `INSERT INTO member_import_records (id, trainer_id, member_id, request_id, source_type, raw_text, summary, recorded_from, recorded_to, imported_at, created_at)
         SELECT ?, m.trainer_id, m.id, ?, ?, ?, ?, ?, ?, ?, ? FROM members m WHERE m.id = ? AND m.trainer_id = ?
         ON CONFLICT (trainer_id, request_id) DO NOTHING
         RETURNING *`,
      )
      .bind(newId(), data.request_id, data.source_type, data.raw_text, summary, data.recorded_from, data.recorded_to, now, now, data.member_id, trainerId)
      .first<Row>();
    if (inserted) return { success: true, import_record: toImportRecord(inserted) };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  const existing = await db
    .prepare('SELECT * FROM member_import_records WHERE trainer_id = ? AND request_id = ?')
    .bind(trainerId, data.request_id)
    .first<Row>();
  if (!existing) return { success: false, reason: 'member_not_found' };
  const record = toImportRecord(existing);
  if (
    record.member_id !== data.member_id ||
    record.source_type !== data.source_type ||
    record.raw_text !== data.raw_text ||
    record.summary !== summary ||
    record.recorded_from !== data.recorded_from ||
    record.recorded_to !== data.recorded_to
  ) {
    return { success: false, reason: 'request_payload_conflict' };
  }
  return { success: true, import_record: record };
}
