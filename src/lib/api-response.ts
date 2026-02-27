/**
 * Standardized API Response Helpers
 * Use these in API routes for consistent response format
 */

import { NextResponse } from "next/server";

interface ApiMeta {
  total?: number;
  page?: number;
  perPage?: number;
  timestamp?: string;
  [key: string]: unknown;
}

interface SuccessResponse<T> {
  data: T;
  meta?: ApiMeta;
}

interface ErrorResponse {
  error: string;
  code: string;
  details?: unknown;
}

/**
 * Return a successful JSON response
 */
export function success<T>(
  data: T,
  meta?: ApiMeta,
  status = 200
): NextResponse<SuccessResponse<T>> {
  return NextResponse.json(
    {
      data,
      meta: meta ? { ...meta, timestamp: new Date().toISOString() } : undefined,
    },
    { status }
  );
}

/**
 * Return a created (201) response
 */
export function created<T>(data: T, meta?: ApiMeta): NextResponse<SuccessResponse<T>> {
  return success(data, meta, 201);
}

/**
 * Return an error response
 */
export function error(
  message: string,
  code: string,
  status = 400,
  details?: unknown
): NextResponse<ErrorResponse> {
  return NextResponse.json(
    {
      error: message,
      code,
      ...(details ? { details } : {}),
    },
    { status }
  );
}

/**
 * Common error helpers
 */
export const errors = {
  badRequest: (message: string, details?: unknown) =>
    error(message, "BAD_REQUEST", 400, details),
  
  unauthorized: (message = "Unauthorized") =>
    error(message, "UNAUTHORIZED", 401),
  
  forbidden: (message = "Forbidden") =>
    error(message, "FORBIDDEN", 403),
  
  notFound: (resource = "Resource") =>
    error(`${resource} not found`, "NOT_FOUND", 404),
  
  conflict: (message: string) =>
    error(message, "CONFLICT", 409),
  
  tooManyRequests: (message = "Too many requests") =>
    error(message, "TOO_MANY_REQUESTS", 429),
  
  internal: (message = "Internal server error") =>
    error(message, "INTERNAL_ERROR", 500),
};
