export class ServiceError extends Error {
  constructor(code, status) {
    super(code);
    this.name = 'ServiceError';
    this.code = code;
    this.status = status;
  }
}

export const notFound = () => new ServiceError('NOT_FOUND', 404);
export const authRequired = () => new ServiceError('AUTH_REQUIRED', 401);
export const forbidden = () => new ServiceError('FORBIDDEN', 403);
