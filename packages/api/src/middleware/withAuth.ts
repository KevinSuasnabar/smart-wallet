import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { env } from '../env.js';
import { unauthorized } from '../shared/response.js';

export interface AuthenticatedEvent {
  userId: string;
  raw: APIGatewayProxyEventV2;
}

export type AuthenticatedHandler = (
  event: AuthenticatedEvent,
) => Promise<APIGatewayProxyResultV2>;

/**
 * Extracts `userId` from JWT claims.
 *
 * In production, API Gateway HTTP API JWT Authorizer has already validated
 * the token — we just read `requestContext.authorizer.jwt.claims.sub`.
 *
 * In offline mode (`env.isOffline === true`) we read the `X-Mock-User-Id`
 * header so local development works without a real Cognito pool.
 *
 * Falls back to `LOCAL_USER_ID` env var when the header is absent in offline
 * mode.
 */
export const withAuth =
  (handler: AuthenticatedHandler) =>
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    let userId: string | undefined;

    if (env.isOffline) {
      // Offline mode: accept mock header (case-insensitive via API GW normalisation)
      userId =
        event.headers?.['x-mock-user-id'] ??
        event.headers?.['X-Mock-User-Id'] ??
        env.localUserId;
    } else {
      // Production: API Gateway has already validated the JWT
      const evt = event as APIGatewayProxyEventV2WithJWTAuthorizer;
      const sub = evt.requestContext.authorizer?.jwt?.claims?.sub;
      userId = typeof sub === 'string' ? sub : undefined;
    }

    if (!userId) return unauthorized();

    return handler({ userId, raw: event });
  };
