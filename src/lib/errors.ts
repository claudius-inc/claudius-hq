/**
 * Custom Error Types
 * Use for typed error handling across the application
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number = 400,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(message, "BAD_REQUEST", 400, details);
  }

  static unauthorized(message = "Unauthorized"): ApiError {
    return new ApiError(message, "UNAUTHORIZED", 401);
  }

  static forbidden(message = "Forbidden"): ApiError {
    return new ApiError(message, "FORBIDDEN", 403);
  }

  static notFound(resource = "Resource"): ApiError {
    return new ApiError(`${resource} not found`, "NOT_FOUND", 404);
  }

  static conflict(message: string): ApiError {
    return new ApiError(message, "CONFLICT", 409);
  }

  static internal(message = "Internal server error"): ApiError {
    return new ApiError(message, "INTERNAL_ERROR", 500);
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

/**
 * Type guard to check if an error is an ApiError
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Convert unknown errors to ApiError
 */
export function toApiError(error: unknown): ApiError {
  if (isApiError(error)) {
    return error;
  }
  if (error instanceof Error) {
    return new ApiError(error.message, "UNKNOWN_ERROR", 500);
  }
  return new ApiError(String(error), "UNKNOWN_ERROR", 500);
}
