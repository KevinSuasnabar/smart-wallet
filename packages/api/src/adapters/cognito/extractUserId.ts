import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

/**
 * Extracts the `sub` claim from an API Gateway JWT Authorizer context.
 *
 * Returns `undefined` if the claim is absent or not a string — `withAuth`
 * middleware treats this as an unauthenticated request and returns 401.
 *
 * NOTE: This helper assumes the JWT has already been validated by API Gateway.
 *       Do NOT call this in offline mode — use the mock header path instead.
 */
export const extractUserId = (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): string | undefined => {
  const sub = event.requestContext.authorizer?.jwt?.claims?.sub;
  return typeof sub === 'string' ? sub : undefined;
};
