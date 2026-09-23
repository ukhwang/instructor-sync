export class DataAccessError extends Error {
  readonly code = "data_unavailable";

  constructor(readonly operation: string) {
    super("데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    this.name = "DataAccessError";
  }
}

export function isNotFoundDatabaseError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "PGRST116");
}

export function asDataAccessError(operation: string, error?: unknown): DataAccessError {
  if (error instanceof DataAccessError) return error;
  return new DataAccessError(operation);
}

