import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import type { DomainError } from '@smart-wallet/domain';

/**
 * Maps any `DomainError` instance to an `APIGatewayProxyResultV2`.
 *
 * Uses the `httpStatus` and `tag` fields from `DomainError` — no instanceof
 * branching needed because every subclass declares those abstract fields.
 *
 * The `message` field is included for developer-facing context (API docs
 * describe it as non-user-facing).
 */
export const domainErrorToResponse = (error: DomainError): APIGatewayProxyResultV2 => ({
  statusCode: error.httpStatus,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ error: error.tag, message: error.message }),
});
