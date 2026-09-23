import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test, { after } from 'node:test';
import pg from 'pg';
import { connectionConfig } from './database.mjs';

const { Pool }=pg;
const hasDatabase=Boolean(process.env.HW_PG_DATABASE && process.env.HW_PG_PORT);
const databaseTest=hasDatabase ? test : test.skip;
const pool=hasDatabase ? new Pool(connectionConfig()) : null;
after(()=>pool?.end());

const A='00000000-0000-4000-8000-000000000001', B='00000000-0000-4000-8000-000000000002';
const memberA='00000000-0000-4000-8000-000000000101', memberB='00000000-0000-4000-8000-000000000102';
const homeworkA='00000000-0000-4000-8000-000000000301', homeworkB='00000000-0000-4000-8000-000000000302';
const tokenA='00000000-0000-4000-8000-000000000501', tokenB='00000000-0000-4000-8000-000000000502';
const submission='00000000-0000-4000-8000-000000000601';

async function expectState(c, text, values, state) {
  const savepoint=`p_${randomUUID().replaceAll('-','')}`;
  await c.query(`SAVEPOINT ${savepoint}`);
  await assert.rejects(c.query(text,values), error=>error.code===state);
  await c.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
}
async function transaction(pool, run) {
  const c=await pool.connect();
  await c.query('BEGIN');
  try { await run(c); } finally { await c.query('ROLLBACK'); c.release(); }
}

databaseTest('all target tables and migration levels exist', async () => {
    const {rows}=await pool.query(`select table_schema||'.'||table_name name from information_schema.tables where table_schema in ('app','authn') order by 1`);
    assert.deepEqual(rows.map(r=>r.name),['app.exercises','app.feedback','app.homework_exercises','app.homeworks','app.member_access_tokens','app.members','app.rate_limit_buckets','app.session_notes','app.submissions','app.trainers','app.write_requests','authn.account','authn.rate_limit','authn.session','authn.signup_allowlist','authn.user','authn.verification']);
    assert.equal((await pool.query('select count(*)::int count from drizzle.__drizzle_migrations')).rows[0].count,2);
});

databaseTest('cross-trainer homework and note references are rejected', async () => transaction(pool,async c=>{
    await expectState(c,`insert into app.homeworks(trainer_id,member_id,why) values($1,$2,'Synthetic forged')`,[A,memberB],'23503');
    await expectState(c,`insert into app.session_notes(trainer_id,member_id,note) values($1,$2,'Synthetic forged')`,[A,memberB],'23503');
    assert.equal((await c.query('select count(*)::int count from app.homeworks where trainer_id=$1 and member_id=$2',[A,memberB])).rows[0].count,0);
}));

databaseTest('member and exercise value checks reject invalid data', async () => transaction(pool,async c=>{
    await expectState(c,`update app.members set name='  ' where id=$1`,[memberA],'23514');
    await expectState(c,`update app.members set remaining=-1 where id=$1`,[memberA],'23514');
    await expectState(c,`update app.members set remaining=package_total+1 where id=$1`,[memberA],'23514');
    await expectState(c,`insert into app.exercises(name) values(' ')`,[],'23514');
}));

databaseTest('homework requires contiguous one-to-three exercises', async () => transaction(pool,async c=>{
    await expectState(c,`insert into app.homework_exercises(homework_id,order_index,name,sets,target_reps,effort_kind,reps) values($1,1,'Duplicate',1,'1 rep','reps',1)`,[homeworkA],'23505');
    await expectState(c,`insert into app.homework_exercises(homework_id,order_index,name,sets,target_reps,effort_kind,reps) values($1,4,'Fourth',1,'1 rep','reps',1)`,[homeworkA],'23514');
    const empty=randomUUID();
    await c.query(`insert into app.homeworks(id,trainer_id,member_id,why) values($1,$2,$3,'Synthetic empty')`,[empty,A,memberA]);
    await expectState(c,'SET CONSTRAINTS ALL IMMEDIATE',[],'23514');
}));

databaseTest('a gap in exercise order fails at the transaction boundary', async () => transaction(pool,async c=>{
    const id=randomUUID();
    await c.query(`insert into app.homeworks(id,trainer_id,member_id,why) values($1,$2,$3,'Synthetic gap')`,[id,A,memberA]);
    for(const order of [1,3]) await c.query(`insert into app.homework_exercises(homework_id,order_index,name,sets,target_reps,effort_kind,reps) values($1,$2,'Synthetic',1,'1 rep','reps',1)`,[id,order]);
    await expectState(c,'SET CONSTRAINTS ALL IMMEDIATE',[],'23514');
}));

databaseTest('homework and item failure roll back together in one transaction', async () => {
    const c=await pool.connect(), id=randomUUID();
    try {
      await c.query('BEGIN');
      await c.query(`insert into app.homeworks(id,trainer_id,member_id,why) values($1,$2,$3,'Synthetic atomic')`,[id,A,memberA]);
      await c.query(`insert into app.homework_exercises(homework_id,order_index,name,sets,target_reps,effort_kind,reps) values($1,1,'Synthetic',1,'1 rep','reps',1)`,[id]);
      await assert.rejects(c.query(`insert into app.homework_exercises(homework_id,order_index,name,sets,target_reps,effort_kind,reps) values($1,1,'Duplicate',1,'1 rep','reps',1)`,[id]),e=>e.code==='23505');
      await c.query('ROLLBACK');
      assert.equal((await c.query('select count(*)::int count from app.homeworks where id=$1',[id])).rows[0].count,0);
    } finally { if(!c.released){await c.query('ROLLBACK').catch(()=>{});c.release();} }
});

databaseTest('token hash, active-token and replacement ownership constraints hold', async () => transaction(pool,async c=>{
    await expectState(c,`insert into app.member_access_tokens(homework_id,token_hash,expires_at) values($1,$2,now()+interval '1 day')`,[homeworkA,Buffer.alloc(2)],'23514');
    await expectState(c,`insert into app.member_access_tokens(homework_id,token_hash,expires_at) values($1,$2,now()+interval '1 day')`,[homeworkA,randomBytes(32)],'23505');
    await c.query('update app.member_access_tokens set revoked_at=now() where id=$1',[tokenB]);
    await expectState(c,`insert into app.member_access_tokens(homework_id,token_hash,expires_at,replaces_token_id) values($1,$2,now()+interval '1 day',$3)`,[homeworkB,randomBytes(32),tokenA],'23503');
}));

databaseTest('submission token and correction lineage stay in one homework observation', async () => transaction(pool,async c=>{
    const forged=randomUUID();
    await expectState(c,`insert into app.submissions(id,homework_id,token_id,kind,performed_at,observation_id,version) values($1,$2,$3,'complete',now(),$1,1)`,[forged,homeworkA,tokenB],'23503');
    await expectState(c,`insert into app.submissions(id,homework_id,token_id,kind,performed_at,observation_id,version) values($1,$2,$3,'complete',now(),$4,1)`,[forged,homeworkA,tokenA,randomUUID()],'23514');
    await expectState(c,`insert into app.submissions(id,homework_id,token_id,kind,performed_at,observation_id,version,supersedes_id) values($1,$2,$3,'cant',now(),$4,2,$4)`,[randomUUID(),homeworkA,tokenA,submission],'23514');
}));

databaseTest('feedback, idempotency and delete restrictions hold', async () => transaction(pool,async c=>{
    await expectState(c,`update app.feedback set note=$2 where submission_id=$1`,[submission,'x'.repeat(1001)],'23514');
    await expectState(c,`insert into app.write_requests(actor_scope,operation,aggregate_key,request_id,payload_hash,result) select actor_scope,operation,aggregate_key,request_id,payload_hash,result from app.write_requests limit 1`,[],'23505');
    await expectState(c,'delete from app.members where id=$1',[memberA],'23503');
}));

databaseTest('least-privilege roles cannot escalate or delete', async () => {
    const {rows}=await pool.query(`select has_column_privilege('homework_app','app.trainers','name','UPDATE') name_update,
      has_column_privilege('homework_app','app.trainers','is_pro','UPDATE') pro_update,
      has_column_privilege('homework_app','app.trainers','active','UPDATE') active_update,
      has_table_privilege('homework_app','app.members','DELETE') member_delete,
      has_schema_privilege('homework_app','authn','USAGE') auth_access,
      has_schema_privilege('public','app','USAGE') public_access`);
    assert.deepEqual(rows[0],{name_update:true,pro_update:false,active_update:false,member_delete:false,auth_access:false,public_access:false});
    const roles=(await pool.query(`select rolname,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls from pg_roles where rolname in ('homework_app','homework_auth') order by rolname`)).rows;
    assert.equal(roles.length,2); for(const role of roles) assert.deepEqual(Object.values(role).slice(1),[false,false,false,false]);
});

databaseTest('expected ownership and lineage indexes are present', async () => {
    const names=(await pool.query(`select indexname from pg_indexes where schemaname='app'`)).rows.map(r=>r.indexname);
    for(const name of ['members_trainer_idx','homework_member_idx','homework_order_key','token_homework_idx','submission_homework_idx','feedback_homework_idx','notes_member_idx']) assert.ok(names.includes(name),name);
    const raw=(await pool.query(`select column_name from information_schema.columns where table_schema='app' and table_name='member_access_tokens' order by column_name`)).rows.map(r=>r.column_name);
    assert.ok(raw.includes('token_hash')); assert.ok(!raw.includes('token'));
});
