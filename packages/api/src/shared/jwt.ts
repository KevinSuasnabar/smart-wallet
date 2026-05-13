/**
 * Decode a JWT payload without verifying the signature.
 *
 * SECURITY: Only safe for offline/local development. In production the JWT is
 * validated by API Gateway's JWT authorizer BEFORE the Lambda runs — this
 * function is never called there. We accept unverified tokens locally so the
 * web frontend can hit `localhost:3000` with the same `Authorization: Bearer`
 * header it uses against production.
 */
export interface JwtPayload {
  sub?: string;
  email?: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

export const decodeJwtPayloadUnsafe = (token: string): JwtPayload | null => {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const encodedPayload = parts[1];
  if (!encodedPayload) return null;
  try {
    const json = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed as JwtPayload;
  } catch {
    return null;
  }
};
