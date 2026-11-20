#!/usr/bin/env node
// Prints EXPLAIN QUERY PLAN for the hot D1 queries against the real migrations
// (node:sqlite, in-memory). Used to verify every request-path query is index-driven.
//   node --no-warnings scripts/cf/explain-queries.mjs
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = path.join(root, 'migrations');
const db = new DatabaseSync(':memory:');
for (const file of readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()) db.exec(readFileSync(path.join(dir, file), 'utf8'));
db.exec('ANALYZE');

const T = 'trainer', M = 'member', H = 'homework', X = 'x'.repeat(64), NOW = '2026-11-20T00:00:00.000Z';
const queries = {
  'auth: session by token (every /app request)': ['SELECT * FROM session WHERE token = ?', [X]],
  'members: list for trainer': ['SELECT * FROM members WHERE trainer_id = ? ORDER BY created_at DESC, id', [T]],
  'members: get owned': ['SELECT * FROM members WHERE id = ? AND trainer_id = ?', [M, T]],
  'members: free-plan trigger count': ['SELECT count(*) FROM members WHERE trainer_id = ?', [T]],
  'homework: list for trainer': [`SELECT h.id FROM homework h JOIN members m ON m.id = h.member_id AND m.trainer_id = h.trainer_id WHERE h.trainer_id = ? ORDER BY h.created_at DESC, h.id LIMIT 200`, [T]],
  'homework: list for member': [`SELECT h.id FROM homework h WHERE h.trainer_id = ? AND h.member_id = ? ORDER BY h.created_at DESC, h.id LIMIT 200`, [T, M]],
  'homework: items for scoped list': [`SELECT * FROM homework_items WHERE homework_id IN (SELECT h.id FROM homework h WHERE h.trainer_id = ? ORDER BY h.created_at DESC LIMIT 200) ORDER BY order_index, id`, [T]],
  'public: homework by token hash (/h)': ['SELECT * FROM homework WHERE token_hash = ?', [X]],
  'public: items by token hash': ['SELECT * FROM homework_items WHERE homework_id = (SELECT id FROM homework WHERE token_hash = ?) ORDER BY order_index', [X]],
  'public: logs by token hash': ['SELECT * FROM homework_logs WHERE homework_id = (SELECT id FROM homework WHERE token_hash = ?) ORDER BY created_at, id', [X]],
  'public: submission exists': ['SELECT id FROM homework_submissions WHERE homework_id = (SELECT id FROM homework WHERE token_hash = ?)', [X]],
  'public: report by token hash (/report)': ['SELECT * FROM milestone_reports WHERE token_hash = ?', [X]],
  'schedule: week lessons': [`SELECT l.id FROM lessons l JOIN members m ON m.id = l.member_id AND m.trainer_id = l.trainer_id WHERE l.trainer_id = ? AND l.starts_at >= ? AND l.starts_at < ? AND l.status <> 'cancelled' ORDER BY l.starts_at`, [T, NOW, NOW]],
  'schedule: overlap trigger probe': [`SELECT 1 FROM lessons l WHERE l.trainer_id = ? AND l.status <> 'cancelled' AND l.starts_at < ? AND l.ends_at > ?`, [T, NOW, NOW]],
  'schedule: week homework + submissions': [`SELECT h.id FROM homework h LEFT JOIN homework_submissions s ON s.homework_id = h.id WHERE h.trainer_id = ? AND h.member_id IN (SELECT DISTINCT member_id FROM lessons WHERE trainer_id = ? AND starts_at >= ? AND starts_at < ?) AND h.created_at >= ? AND h.created_at < ? ORDER BY h.created_at DESC LIMIT 500`, [T, T, NOW, NOW, NOW, NOW]],
  'briefing: latest submission for member': [`SELECT s.submitted_at FROM homework_submissions s JOIN homework h ON h.id = s.homework_id WHERE h.member_id = ? AND h.trainer_id = ? ORDER BY s.submitted_at DESC LIMIT 1`, [M, T]],
  'notes: for member': ['SELECT * FROM session_notes WHERE trainer_id = ? AND member_id = ? ORDER BY created_at DESC, id', [T, M]],
  'idempotency: assignment request': ['SELECT * FROM homework_assignment_requests WHERE trainer_id = ? AND request_id = ?', [T, H]],
  'rate limit: key lookup': ['SELECT * FROM rate_limit WHERE key = ?', ['k']],
};

let fullScans = 0;
for (const [label, [sql, params]] of Object.entries(queries)) {
  const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params).map((row) => row.detail);
  const scans = plan.filter((detail) => /^SCAN (?!.*USING (COVERING )?INDEX)/.test(detail) && !/^SCAN CONSTANT ROW/.test(detail));
  fullScans += scans.length;
  console.log(`\n## ${label}${scans.length ? '  ⚠ FULL SCAN' : ''}\n${plan.map((detail) => `   ${detail}`).join('\n')}`);
}
console.log(`\nfull table scans on request paths: ${fullScans}`);
process.exitCode = fullScans ? 1 : 0;
