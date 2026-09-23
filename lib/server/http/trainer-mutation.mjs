import { authRequired, forbidden, ServiceError } from '../errors.mjs';
import { ZodError } from 'zod';

const errorResponse = error => {
  if (error instanceof ServiceError) return Response.json({ code: error.code }, { status: error.status });
  if (error instanceof ZodError) return Response.json({ code: 'INVALID_INPUT' }, { status: 400 });
  return Response.json({ code: 'DB_UNAVAILABLE' }, { status: 503 });
};

export function createTrainerMutationHandler({ getTrainerAccess, mutate }) {
  return async request => {
    try {
      const access = await getTrainerAccess(request);
      if (!access) throw authRequired();
      if (!access.active) throw forbidden();
      const body = await mutate(Object.freeze({ trainerId: access.trainerId }));
      return Response.json(body, { status: 200 });
    } catch (error) {
      return errorResponse(error);
    }
  };
}
