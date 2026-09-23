import { getTrainerAccess, type TrainerAccess } from '@/lib/server/auth/trainer-access';
import { appDatabase } from '@/lib/server/db/pools';
import { createTrainerMutationHandler } from '@/lib/server/http/trainer-mutation.mjs';
import { createHomeworkRepository } from '@/lib/server/repositories/homeworks.mjs';
import { createMemberRepository } from '@/lib/server/repositories/members.mjs';
import { createHomeworkService } from '@/lib/server/services/homeworks.mjs';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };

const service = () => createHomeworkService(
  createHomeworkRepository(appDatabase()),
  createMemberRepository(appDatabase()),
);

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return createTrainerMutationHandler({
    getTrainerAccess,
    mutate: (actor: TrainerAccess) => service().get(actor, id),
  })(request);
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  return createTrainerMutationHandler({
    getTrainerAccess,
    mutate: async (actor: TrainerAccess) => service().update(actor, id, await request.json()),
  })(request);
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  return createTrainerMutationHandler({
    getTrainerAccess,
    mutate: (actor: TrainerAccess) => service().remove(actor, id),
  })(request);
}
