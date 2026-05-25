import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { env } from '../env.js';
import { unauthorized } from '../shared/response.js';
import { decodeJwtPayloadUnsafe } from '../shared/jwt.js';

export interface AuthenticatedEvent {
  userId: string;
  raw: APIGatewayProxyEventV2;
}

export type AuthenticatedHandler = (
  event: AuthenticatedEvent,
) => Promise<APIGatewayProxyResultV2>;

/**
 * Extracts `userId` from the request.
 *
 * Production: API Gateway HTTP API JWT Authorizer has already validated the
 * Cognito token — we just read `requestContext.authorizer.jwt.claims.sub`.
 *
 * Offline (`env.isOffline === true`): we accept three sources, in priority
 * order, so any client can hit `localhost:3000` without a real Cognito pool:
 *   1. `X-Mock-User-Id` header — fast path for curl/smoke.sh tests
 *   2. `Authorization: Bearer <JWT>` — payload decoded WITHOUT signature
 *      verification (the web frontend and Postman use this against prod
 *      Cognito, and we want the same client to also work against local)
 *   3. `LOCAL_USER_ID` env var — final fallback for headless dev scenarios
 */
export const withAuth =
  (handler: AuthenticatedHandler) =>
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    let userId: string | undefined;

    if (env.isOffline) {
      userId = resolveOfflineUserId(event);
    } else {
      const evt = event as APIGatewayProxyEventV2WithJWTAuthorizer;
      const sub = evt.requestContext.authorizer?.jwt?.claims?.sub;
      userId = typeof sub === 'string' ? sub : undefined;
    }

    if (!userId) return unauthorized();

    return handler({ userId, raw: event });
  };

const resolveOfflineUserId = (event: APIGatewayProxyEventV2): string | undefined => {
  const headers = event.headers ?? {};

  const mockHeader = headers['x-mock-user-id'] ?? headers['X-Mock-User-Id'];
  if (typeof mockHeader === 'string' && mockHeader.length > 0) {
    return mockHeader;
  }

  const authHeader = headers.authorization ?? headers.Authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const payload = decodeJwtPayloadUnsafe(authHeader.slice('Bearer '.length));
    if (payload && typeof payload.sub === 'string' && payload.sub.length > 0) {
      return payload.sub;
    }
  }

  return env.localUserId;
};
