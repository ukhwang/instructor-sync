import { customType, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Drizzle (SQLite/D1) mapping of the Better Auth core tables created by
 * migrations/0001_init.sql. Timestamps are stored as ISO-8601 TEXT to match the
 * rest of the schema; Better Auth works with Date objects.
 */
const isoTimestamp = customType<{ data: Date; driverData: string }>({
  dataType: () => 'text',
  toDriver: (value) => value.toISOString(),
  fromDriver: (value) => new Date(value),
});

const flag = customType<{ data: boolean; driverData: number }>({
  dataType: () => 'integer',
  toDriver: (value) => (value ? 1 : 0),
  fromDriver: (value) => value === 1,
});

export const users = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: flag('email_verified').notNull(),
  image: text('image'),
  createdAt: isoTimestamp('created_at').notNull(),
  updatedAt: isoTimestamp('updated_at').notNull(),
});

export const accounts = sqliteTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  password: text('password'),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: isoTimestamp('access_token_expires_at'),
  refreshTokenExpiresAt: isoTimestamp('refresh_token_expires_at'),
  scope: text('scope'),
  createdAt: isoTimestamp('created_at').notNull(),
  updatedAt: isoTimestamp('updated_at').notNull(),
});

export const sessions = sqliteTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  token: text('token').notNull().unique(),
  expiresAt: isoTimestamp('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: isoTimestamp('created_at').notNull(),
  updatedAt: isoTimestamp('updated_at').notNull(),
});

export const verifications = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: isoTimestamp('expires_at').notNull(),
  createdAt: isoTimestamp('created_at').notNull(),
  updatedAt: isoTimestamp('updated_at').notNull(),
});

export const rateLimits = sqliteTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: integer('last_request').notNull(),
});

export const authSchema = {
  user: users,
  account: accounts,
  session: sessions,
  verification: verifications,
  rateLimit: rateLimits,
};
