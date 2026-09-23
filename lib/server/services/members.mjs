import { z } from 'zod';
import { notFound } from '../errors.mjs';

const trainerContext = z.object({ trainerId: z.string().uuid() }).strict();
const memberId = z.string().uuid();
const memberPatch = z.object({ name: z.string().trim().min(1).max(100) }).strict();

export function createMemberService(repository) {
  return {
    async get(context, id) {
      const actor = trainerContext.parse(context);
      const member = await repository.findOwnedById(actor.trainerId, memberId.parse(id));
      if (!member) throw notFound();
      return member;
    },

    async update(context, id, input) {
      const actor = trainerContext.parse(context);
      const patch = memberPatch.parse(input);
      const member = await repository.updateOwnedName(actor.trainerId, memberId.parse(id), patch.name);
      if (!member) throw notFound();
      return member;
    },
  };
}
