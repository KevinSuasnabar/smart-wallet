import type { z, ZodTypeAny } from 'zod';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { badRequest } from '../shared/response.js';

interface ValidationOk<T> {
  ok: true;
  data: T;
}

interface ValidationFail {
  ok: false;
  response: APIGatewayProxyResultV2;
}

type ValidationResult<T> = ValidationOk<T> | ValidationFail;

/**
 * Parses and validates `event.body` against the provided Zod schema.
 *
 * Returns `{ ok: true, data }` on success or `{ ok: false, response }` with
 * an appropriate 400 response that can be returned directly from the handler.
 */
export const validateBody = <Schema extends ZodTypeAny>(
  schema: Schema,
  event: APIGatewayProxyEventV2,
): ValidationResult<z.infer<Schema>> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(event.body ?? '{}');
  } catch {
    return { ok: false, response: badRequest('invalid_json') };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      response: badRequest('validation_failed', result.error.format()),
    };
  }
  return { ok: true, data: result.data as z.infer<Schema> };
};

/**
 * Validates `event.queryStringParameters` against the provided Zod schema.
 *
 * Treats missing query string as an empty object (graceful degradation for
 * schemas with all-optional fields).
 */
export const validateQuery = <Schema extends ZodTypeAny>(
  schema: Schema,
  event: APIGatewayProxyEventV2,
): ValidationResult<z.infer<Schema>> => {
  const result = schema.safeParse(event.queryStringParameters ?? {});
  if (!result.success) {
    return {
      ok: false,
      response: badRequest('validation_failed', result.error.format()),
    };
  }
  return { ok: true, data: result.data as z.infer<Schema> };
};

/**
 * Validates `event.pathParameters` against the provided Zod schema.
 *
 * Treats missing path parameters as an empty object so downstream schemas
 * can provide meaningful error messages for missing required fields.
 */
export const validatePath = <Schema extends ZodTypeAny>(
  schema: Schema,
  event: APIGatewayProxyEventV2,
): ValidationResult<z.infer<Schema>> => {
  const result = schema.safeParse(event.pathParameters ?? {});
  if (!result.success) {
    return {
      ok: false,
      response: badRequest('validation_failed', result.error.format()),
    };
  }
  return { ok: true, data: result.data as z.infer<Schema> };
};
