import type { APIGatewayProxyResultV2 } from 'aws-lambda';

const JSON_CONTENT_TYPE = { 'Content-Type': 'application/json' } as const;

/**
 * Build an HTTP API v2 JSON response with a 200 (or custom) status code.
 * REQ-VAL-01
 */
export function ok<T>(body: T, statusCode = 200): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: JSON_CONTENT_TYPE,
    body: JSON.stringify(body),
  };
}

/**
 * Build an HTTP 201 Created response.
 */
export function created<T>(body: T): APIGatewayProxyResultV2 {
  return ok(body, 201);
}

/**
 * Build an HTTP 204 No Content response (no body).
 */
export function noContent(): APIGatewayProxyResultV2 {
  return { statusCode: 204 };
}

/**
 * Build an HTTP 400 Bad Request response.
 * `details` is optional — omitted when undefined (exactOptionalPropertyTypes-safe).
 */
export function badRequest(error: string, details?: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode: 400,
    headers: JSON_CONTENT_TYPE,
    body: JSON.stringify({
      error,
      ...(details !== undefined ? { details } : {}),
    }),
  };
}

/**
 * Build an HTTP 404 Not Found response.
 */
export function notFound(error = 'not_found'): APIGatewayProxyResultV2 {
  return {
    statusCode: 404,
    headers: JSON_CONTENT_TYPE,
    body: JSON.stringify({ error }),
  };
}

/**
 * Build an HTTP 409 Conflict response.
 */
export function conflict(error: string): APIGatewayProxyResultV2 {
  return {
    statusCode: 409,
    headers: JSON_CONTENT_TYPE,
    body: JSON.stringify({ error }),
  };
}

/**
 * Build an HTTP 500 Internal Server Error response.
 * Does NOT expose internal error details — always returns a generic message.
 */
export function serverError(): APIGatewayProxyResultV2 {
  return {
    statusCode: 500,
    headers: JSON_CONTENT_TYPE,
    body: JSON.stringify({ error: 'internal_error' }),
  };
}
