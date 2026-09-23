import { getTrainerAccess, type TrainerAccess } from '@/lib/server/auth/trainer-access';
import { appDatabase } from '@/lib/server/db/pools';
import { createTrainerMutationHandler } from '@/lib/server/http/trainer-mutation.mjs';
import { createMemberRepository } from '@/lib/server/repositories/members.mjs';
import { createMemberService } from '@/lib/server/services/members.mjs';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };

const service = () => createMemberService(createMemberRepository(appDatabase()));

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
