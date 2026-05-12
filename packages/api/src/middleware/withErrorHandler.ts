import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DomainError } from '@smart-wallet/domain';
import { serverError } from '../shared/response.js';
import { isTransactionCanceledException } from '../adapters/dynamodb/index.js';
import { notFound, conflict } from '../shared/response.js';

/**
 * Top-level error boundary for Lambda handlers.
 *
 * Priority order:
 *  1. `DomainError` subclasses → use `httpStatus` + `tag` from the error.
 *  2. DynamoDB `TransactionCanceledException` → map CancellationReasons by
 *     index (index 0 = transaction put, index 1 = wallet update).
 *  3. Any other thrown value → 500 `internal_error`, full error logged.
 */
export const withErrorHandler =
  (
    handler: (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2>,
  ) =>
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    try {
      return await handler(event);
    } catch (e) {
      // DomainError — map via its own httpStatus / tag fields
      if (e instanceof DomainError) {
        return {
          statusCode: e.httpStatus,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: e.tag, message: e.message }),
        };
      }

      // TransactWriteItems cancellation — map by CancellationReasons index
      //   Index 0 = transaction Put  (ConditionalCheckFailed → duplicate)
      //   Index 1 = wallet Update    (ConditionalCheckFailed → wallet gone / soft-deleted)
      if (isTransactionCanceledException(e)) {
        const reasons = e.CancellationReasons ?? [];
        if (reasons[1]?.Code === 'ConditionalCheckFailed') {
          return notFound('wallet_not_found');
        }
        if (reasons[0]?.Code === 'ConditionalCheckFailed') {
          return conflict('duplicate_transaction');
        }
      }

      // Unhandled — log and return generic 500
      console.error(
        'unhandled error',
        e instanceof Error ? { message: e.message, stack: e.stack } : e,
      );
      return serverError();
    }
  };
