const memberColumns = `id, trainer_id, name, phone, package_total, remaining,
  expires_on, end_state, version, created_at, updated_at`;

const toMember = row => ({
  id: row.id,
  trainerId: row.trainer_id,
  name: row.name,
  phone: row.phone,
  packageTotal: row.package_total,
  remaining: row.remaining,
  expiresOn: row.expires_on,
  endState: row.end_state,
  version: row.version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export function createMemberRepository(database) {
  return {
    async findOwnedById(trainerId, memberId) {
      const { rows } = await database.query(
        `select ${memberColumns} from app.members where id=$1 and trainer_id=$2`,
        [memberId, trainerId],
      );
      return rows[0] ? toMember(rows[0]) : null;
    },

    async updateOwnedName(trainerId, memberId, name) {
      const { rows } = await database.query(
        `update app.members
         set name=$3, version=version+1, updated_at=now()
         where id=$1 and trainer_id=$2
         returning ${memberColumns}`,
        [memberId, trainerId, name],
      );
      return rows[0] ? toMember(rows[0]) : null;
    },
  };
}
