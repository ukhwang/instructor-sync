import { createHash } from 'node:crypto';
import { withPool } from './database.mjs';

const ids = {
  A:'00000000-0000-4000-8000-000000000001', B:'00000000-0000-4000-8000-000000000002',
  memberA:'00000000-0000-4000-8000-000000000101', memberB:'00000000-0000-4000-8000-000000000102',
  exercise:'00000000-0000-4000-8000-000000000201', homeworkA:'00000000-0000-4000-8000-000000000301', homeworkB:'00000000-0000-4000-8000-000000000302',
  itemA:'00000000-0000-4000-8000-000000000401', itemB:'00000000-0000-4000-8000-000000000402',
  tokenA:'00000000-0000-4000-8000-000000000501', tokenB:'00000000-0000-4000-8000-000000000502',
  submission:'00000000-0000-4000-8000-000000000601', note:'00000000-0000-4000-8000-000000000701',
};
const at = '2026-09-13T00:00:00.000Z';
const hash = value => createHash('sha256').update(value).digest();

await withPool(async pool => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`insert into authn."user"(id,name,email,email_verified,created_at,updated_at) values
      ($1,'Synthetic Trainer A','trainer-a@example.invalid',true,$3,$3),($2,'Synthetic Trainer B','trainer-b@example.invalid',true,$3,$3)`,[ids.A,ids.B,at]);
    await c.query(`insert into app.trainers(id,name,active,created_at,updated_at) values
      ($1,'Synthetic Trainer A',true,$3,$3),($2,'Synthetic Trainer B',true,$3,$3)`,[ids.A,ids.B,at]);
    await c.query(`insert into app.members(id,trainer_id,name,package_total,remaining,end_state,created_at,updated_at) values
      ($1,$2,'Synthetic Member A',10,8,'Synthetic goal',$5,$5),($3,$4,'Synthetic Member B',20,19,'Synthetic goal',$5,$5)`,[ids.memberA,ids.A,ids.memberB,ids.B,at]);
    await c.query(`insert into app.exercises(id,name,cue,created_at) values($1,'Synthetic Bridge','Synthetic cue',$2)`,[ids.exercise,at]);
    await c.query(`insert into app.homeworks(id,trainer_id,member_id,why,created_at,updated_at) values
      ($1,$2,$3,'Synthetic reason A',$7,$7),($4,$5,$6,'Synthetic reason B',$7,$7)`,[ids.homeworkA,ids.A,ids.memberA,ids.homeworkB,ids.B,ids.memberB,at]);
    await c.query(`insert into app.homework_exercises(id,homework_id,exercise_id,order_index,name,cue,sets,target_reps,effort_kind,reps) values
      ($1,$2,$3,1,'Synthetic Bridge','Synthetic cue',3,'10 reps','reps',10),($4,$5,$3,1,'Synthetic Bridge','Synthetic cue',3,'10 reps','reps',10)`,[ids.itemA,ids.homeworkA,ids.exercise,ids.itemB,ids.homeworkB]);
    await c.query(`insert into app.member_access_tokens(id,homework_id,token_hash,issued_at,expires_at) values
      ($1,$2,$3,$7,$8),($4,$5,$6,$7,$8)`,[ids.tokenA,ids.homeworkA,hash('synthetic-token-a'),ids.tokenB,ids.homeworkB,hash('synthetic-token-b'),at,'2026-09-27T00:00:00.000Z']);
    await c.query(`insert into app.submissions(id,homework_id,token_id,kind,performed_at,observation_id,version,created_at) values($1,$2,$3,'complete',$4,$1,1,$4)`,[ids.submission,ids.homeworkA,ids.tokenA,at]);
    await c.query(`insert into app.feedback(submission_id,homework_id,has_pain,note) values($1,$2,false,'Synthetic feedback')`,[ids.submission,ids.homeworkA]);
    await c.query(`insert into app.session_notes(id,trainer_id,member_id,note,created_at,updated_at) values($1,$2,$3,'Synthetic session note',$4,$4)`,[ids.note,ids.A,ids.memberA,at]);
    await c.query(`insert into app.write_requests(actor_scope,operation,aggregate_key,request_id,payload_hash,result,created_at) values('trainer:create','seed',$1,$2,$3,'{"id":"synthetic-receipt"}',$4)`,[ids.homeworkA,'00000000-0000-4000-8000-000000000801',hash('synthetic-payload'),at]);
    await c.query('COMMIT');
  } catch (error) { await c.query('ROLLBACK'); throw error; } finally { c.release(); }
});
console.log('Synthetic A/B seed committed. No raw access token stored.');
