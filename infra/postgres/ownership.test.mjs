import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { withPool } from './database.mjs';

const hasDatabase=Boolean(process.env.HW_PG_DATABASE && process.env.HW_PG_PORT);

test('P0 OWN-parent: trainer A cannot create homework for trainer B member', { skip:hasDatabase ? false : 'local PostgreSQL target not selected' }, async () => {
  await withPool(async pool => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const A = randomUUID(), B = randomUUID(), memberA = randomUUID(), memberB = randomUUID();
      await client.query(`insert into authn."user"(id,name,email,email_verified) values($1,'Synthetic A',$2,true),($3,'Synthetic B',$4,true)`, [A, `${A}@example.invalid`, B, `${B}@example.invalid`]);
      await client.query(`insert into app.trainers(id,name,active) values($1,'Synthetic A',true),($2,'Synthetic B',true)`, [A, B]);
      await client.query(`insert into app.members(id,trainer_id,name,package_total,remaining) values($1,$2,'Synthetic A member',10,10),($3,$4,'Synthetic B member',10,10)`, [memberA, A, memberB, B]);
      const positive = await client.query(`insert into app.homeworks(trainer_id,member_id,why) values($1,$2,'Synthetic own member') returning id`, [A, memberA]);
      assert.equal(positive.rowCount, 1, 'positive control must create own homework');
      await client.query('SAVEPOINT forged_owner');
      await assert.rejects(client.query(`insert into app.homeworks(trainer_id,member_id,why) values($1,$2,'Synthetic forged member')`, [A, memberB]), error => error.code === '23503');
      await client.query('ROLLBACK TO SAVEPOINT forged_owner');
      assert.equal((await client.query(`select count(*)::int count from app.homeworks where trainer_id=$1 and member_id=$2`, [A, memberB])).rows[0].count, 0);
      await client.query('ROLLBACK');
    } finally { client.release(); }
  });
});
