import { sql } from 'drizzle-orm';
import { pgSchema, uuid, text, boolean, timestamp, integer, date, doublePrecision, jsonb, customType, unique, index, uniqueIndex, check, foreignKey } from 'drizzle-orm/pg-core';

const app = pgSchema('app');
const auth = pgSchema('authn');
const bytes = customType<{ data: Buffer }>({ dataType: () => 'bytea' });
const id = () => uuid('id').primaryKey().defaultRandom();
const time = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();
const named = (column: ReturnType<typeof text>) => column.notNull();

// Better Auth core model fields. No auth runtime or existing Supabase changes.
export const users = auth.table('user', {
  id: id(), name: named(text('name')), email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false), image: text('image'),
  createdAt: time('created_at'), updatedAt: time('updated_at'),
});
export const accounts = auth.table('account', {
  id: id(), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(), providerId: text('provider_id').notNull(), password: text('password'),
  accessToken: text('access_token'), refreshToken: text('refresh_token'), idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }), refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }), scope: text('scope'),
  createdAt: time('created_at'), updatedAt: time('updated_at'),
}, t => [unique('account_provider_key').on(t.providerId, t.accountId), index('account_user_idx').on(t.userId)]);
export const sessions = auth.table('session', {
  id: id(), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'), userAgent: text('user_agent'), createdAt: time('created_at'), updatedAt: time('updated_at'),
}, t => [index('session_user_idx').on(t.userId), index('session_expiry_idx').on(t.expiresAt)]);
export const verifications = auth.table('verification', {
  id: id(), identifier: text('identifier').notNull(), value: text('value').notNull(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), createdAt: time('created_at'), updatedAt: time('updated_at'),
}, t => [index('verification_identifier_idx').on(t.identifier)]);
export const authRateLimits = auth.table('rate_limit', { id: id(), key: text('key').notNull().unique(), count: integer('count').notNull(), lastRequest: doublePrecision('last_request').notNull() });
export const allowlist = auth.table('signup_allowlist', { emailHash: bytes('email_hash').primaryKey(), enabled: boolean('enabled').notNull().default(false), expiresAt: timestamp('expires_at', { withTimezone: true }), createdAt: time('created_at') }, t => [check('allowlist_hash_size', sql`octet_length(${t.emailHash})=32`)]);

export const trainers = app.table('trainers', {
  id: uuid('id').primaryKey().references(() => users.id, { onDelete: 'restrict' }), name: text('name').notNull(), active: boolean('active').notNull().default(false), isPro: boolean('is_pro').notNull().default(false), createdAt: time('created_at'), updatedAt: time('updated_at'),
}, t => [check('trainer_name', sql`length(btrim(${t.name})) between 1 and 100`)]);
export const members = app.table('members', {
  id: id(), trainerId: uuid('trainer_id').notNull().references(() => trainers.id, { onDelete: 'restrict' }), name: text('name').notNull(), phone: text('phone'), packageTotal: integer('package_total').notNull(), remaining: integer('remaining').notNull(), expiresOn: date('expires_on'), endState: text('end_state').notNull().default(''), version: integer('version').notNull().default(1), createdAt: time('created_at'), updatedAt: time('updated_at'),
}, t => [unique('member_owner_key').on(t.id,t.trainerId), check('member_name', sql`length(btrim(${t.name})) between 1 and 100`), check('member_package', sql`${t.packageTotal}>0 and ${t.remaining} between 0 and ${t.packageTotal}`), check('member_version', sql`${t.version}>0`), index('members_trainer_idx').on(t.trainerId,t.createdAt,t.id)]);
export const exercises = app.table('exercises', { id: id(), name: text('name').notNull(), cue: text('cue').notNull().default(''), createdAt: time('created_at') }, t => [check('exercise_name',sql`length(btrim(${t.name})) between 1 and 100`)]);
export const homeworks = app.table('homeworks', {
  id: id(), trainerId: uuid('trainer_id').notNull(), memberId: uuid('member_id').notNull(), why: text('why').notNull(), status: text('status').notNull().default('ready'), version: integer('version').notNull().default(1), firstOpenedAt: timestamp('first_opened_at',{withTimezone:true}), latestSubmissionId: uuid('latest_submission_id'), openingLine: text('opening_line'), createdAt: time('created_at'), updatedAt: time('updated_at'),
}, t => [unique('homework_owner_key').on(t.id,t.trainerId), foreignKey({columns:[t.memberId,t.trainerId],foreignColumns:[members.id,members.trainerId]}).onDelete('restrict'), check('homework_status',sql`${t.status} in ('ready','opened','logged')`), check('homework_version',sql`${t.version}>0`), index('homework_member_idx').on(t.memberId,t.trainerId),index('homework_trainer_idx').on(t.trainerId,t.createdAt,t.id)]);
export const homeworkExercises = app.table('homework_exercises', {
  id:id(), homeworkId:uuid('homework_id').notNull().references(()=>homeworks.id,{onDelete:'restrict'}), exerciseId:uuid('exercise_id').references(()=>exercises.id,{onDelete:'restrict'}), orderIndex:integer('order_index').notNull(), name:text('name').notNull(), cue:text('cue').notNull().default(''), sets:integer('sets').notNull(), targetReps:text('target_reps').notNull(), effortKind:text('effort_kind').notNull(), reps:integer('reps'), holdSeconds:integer('hold_seconds'), secondsPerRep:doublePrecision('seconds_per_rep').notNull().default(3), restSeconds:integer('rest_seconds').notNull().default(30), perSide:boolean('per_side').notNull().default(false),
},t=>[unique('homework_order_key').on(t.homeworkId,t.orderIndex),index('assigned_exercise_idx').on(t.exerciseId),check('assigned_name',sql`length(btrim(${t.name})) between 1 and 100`),check('assigned_order',sql`${t.orderIndex} between 1 and 3`),check('assigned_sets',sql`${t.sets} between 1 and 20`),check('assigned_cadence',sql`${t.secondsPerRep} between 0.5 and 10 and ${t.restSeconds} between 0 and 180`),check('assigned_effort',sql`(${t.effortKind}='reps' and ${t.reps} is not null and ${t.reps} between 1 and 50 and ${t.holdSeconds} is null) or (${t.effortKind}='hold' and ${t.holdSeconds} is not null and ${t.holdSeconds} between 1 and 300 and ${t.reps} is null)`)]);
export const tokens = app.table('member_access_tokens', {
  id:id(), homeworkId:uuid('homework_id').notNull().references(()=>homeworks.id,{onDelete:'restrict'}), tokenHash:bytes('token_hash').notNull().unique(), issuedAt:time('issued_at'), expiresAt:timestamp('expires_at',{withTimezone:true}).notNull(), revokedAt:timestamp('revoked_at',{withTimezone:true}), replacesTokenId:uuid('replaces_token_id'),
},t=>[unique('token_homework_key').on(t.id,t.homeworkId),uniqueIndex('one_live_token').on(t.homeworkId).where(sql`${t.revokedAt} is null`),index('token_expiry_idx').on(t.expiresAt),check('token_hash_length',sql`octet_length(${t.tokenHash})=32`),check('token_dates',sql`${t.expiresAt}>${t.issuedAt} and (${t.revokedAt} is null or ${t.revokedAt}>=${t.issuedAt})`)]);
export const submissions = app.table('submissions', {
  id:id(), homeworkId:uuid('homework_id').notNull().references(()=>homeworks.id,{onDelete:'restrict'}), tokenId:uuid('token_id').notNull(), kind:text('kind').notNull(), performedAt:timestamp('performed_at',{withTimezone:true}).notNull(), observationId:uuid('observation_id').notNull(), version:integer('version').notNull(), supersedesId:uuid('supersedes_id').unique(), createdAt:time('created_at'),
},t=>[unique('submission_homework_key').on(t.id,t.homeworkId),unique('observation_version_key').on(t.observationId,t.version),unique('submission_observation_key').on(t.id,t.homeworkId,t.observationId),foreignKey({columns:[t.tokenId,t.homeworkId],foreignColumns:[tokens.id,tokens.homeworkId]}).onDelete('restrict'),index('submission_token_idx').on(t.tokenId,t.homeworkId),index('submission_homework_idx').on(t.homeworkId,t.performedAt,t.id),check('submission_kind',sql`${t.kind} in ('complete','cant')`),check('submission_initial',sql`(${t.version}=1 and ${t.supersedesId} is null and ${t.observationId}=${t.id}) or (${t.version}>1 and ${t.supersedesId} is not null)`)]);
export const feedback = app.table('feedback', {
  submissionId:uuid('submission_id').primaryKey(), homeworkId:uuid('homework_id').notNull(), hasPain:boolean('has_pain').notNull(), note:text('note'), painArea:text('pain_area'),
},t=>[foreignKey({columns:[t.submissionId,t.homeworkId],foreignColumns:[submissions.id,submissions.homeworkId]}).onDelete('restrict'),index('feedback_homework_idx').on(t.homeworkId),check('feedback_lengths',sql`length(${t.note})<=1000 and length(${t.painArea})<=100`),check('feedback_pain',sql`${t.hasPain} or ${t.painArea} is null`)]);
export const notes = app.table('session_notes', { id:id(), trainerId:uuid('trainer_id').notNull(), memberId:uuid('member_id').notNull(), note:text('note').notNull(), version:integer('version').notNull().default(1), createdAt:time('created_at'), updatedAt:time('updated_at') },t=>[foreignKey({columns:[t.memberId,t.trainerId],foreignColumns:[members.id,members.trainerId]}).onDelete('restrict'),index('notes_member_idx').on(t.memberId,t.trainerId),check('note_length',sql`length(${t.note}) between 1 and 2000`)]);
export const requests = app.table('write_requests', { actorScope:text('actor_scope').notNull(), operation:text('operation').notNull(), aggregateKey:uuid('aggregate_key').notNull(), requestId:uuid('request_id').notNull(), payloadHash:bytes('payload_hash').notNull(), result:jsonb('result').notNull(), createdAt:time('created_at') },t=>[unique('request_idempotency_key').on(t.actorScope,t.operation,t.aggregateKey,t.requestId),check('request_hash_size',sql`octet_length(${t.payloadHash})=32`)]);
export const rateLimits = app.table('rate_limit_buckets', { key:bytes('key').primaryKey(), windowStart:time('window_start'), count:integer('count').notNull(), expiresAt:timestamp('expires_at',{withTimezone:true}).notNull() },t=>[check('rate_count',sql`${t.count}>=0`),index('rate_expiry_idx').on(t.expiresAt)]);
