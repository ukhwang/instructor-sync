const homeworkColumns = 'id, trainer_id, member_id, why, status, version, created_at, updated_at';

const toHomework = row => ({
  id: row.id,
  trainerId: row.trainer_id,
  memberId: row.member_id,
  why: row.why,
  status: row.status,
  version: row.version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export function createHomeworkRepository(database) {
  return {
    async findOwnedById(trainerId, homeworkId) {
      const { rows } = await database.query(
        `select ${homeworkColumns} from app.homeworks where id=$1 and trainer_id=$2`,
        [homeworkId, trainerId],
      );
      return rows[0] ? toHomework(rows[0]) : null;
    },

    async updateOwnedWhy(trainerId, homeworkId, why) {
      const { rows } = await database.query(
        `update app.homeworks set why=$3, version=version+1, updated_at=now()
         where id=$1 and trainer_id=$2 returning ${homeworkColumns}`,
        [homeworkId, trainerId, why],
      );
      return rows[0] ? toHomework(rows[0]) : null;
    },

    async findExerciseOwnedById(trainerId, exerciseId) {
      const { rows } = await database.query(
        `select item.id, item.homework_id from app.homework_exercises item
         join app.homeworks homework on homework.id=item.homework_id
         where item.id=$1 and homework.trainer_id=$2`,
        [exerciseId, trainerId],
      );
      return rows[0] ?? null;
    },

    async updateExerciseOwnedName(trainerId, exerciseId, name) {
      const { rows } = await database.query(
        `update app.homework_exercises item set name=$3
         where item.id=$1 and exists (
           select 1 from app.homeworks homework
           where homework.id=item.homework_id and homework.trainer_id=$2
         ) returning item.id, item.homework_id`,
        [exerciseId, trainerId, name],
      );
      return rows[0] ?? null;
    },

    async findSubmissionOwnedById(trainerId, submissionId) {
      const { rows } = await database.query(
        `select submission.id, submission.homework_id from app.submissions submission
         join app.homeworks homework on homework.id=submission.homework_id
         where submission.id=$1 and homework.trainer_id=$2`,
        [submissionId, trainerId],
      );
      return rows[0] ?? null;
    },

    async findFeedbackOwnedById(trainerId, submissionId) {
      const { rows } = await database.query(
        `select feedback.submission_id as id, feedback.homework_id from app.feedback feedback
         join app.homeworks homework on homework.id=feedback.homework_id
         where feedback.submission_id=$1 and homework.trainer_id=$2`,
        [submissionId, trainerId],
      );
      return rows[0] ?? null;
    },

    async findSessionNoteOwnedById(trainerId, noteId) {
      const { rows } = await database.query(
        'select id, member_id from app.session_notes where id=$1 and trainer_id=$2',
        [noteId, trainerId],
      );
      return rows[0] ?? null;
    },

    async updateSessionNoteOwned(trainerId, noteId, note) {
      const { rows } = await database.query(
        `update app.session_notes set note=$3, version=version+1, updated_at=now()
         where id=$1 and trainer_id=$2 returning id, member_id`,
        [noteId, trainerId, note],
      );
      return rows[0] ?? null;
    },
  };
}
