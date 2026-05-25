import crypto from 'node:crypto';
import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { withAuth, withErrorHandler } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';

/**
 * POST /telegram/link-token — generate a one-time token for linking a Telegram account.
 *
 * Token format: `<userId>.<32-hex-chars>` (16 random bytes).
 * TTL: 15 minutes (900 seconds). The /start command in the bot consumes this token.
 *
 * REQ-LINK-01
 */
const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const userId = event.userId;
  const randomHex = crypto.randomBytes(16).toString('hex');
  const token = `${userId}.${randomHex}`;
  await container.telegramLinkTokenRepo.create(userId, token, 900);
  return { statusCode: 200, body: JSON.stringify({ token }) };
};

// Lambda entry point — middleware applied outside-in: error boundary wraps auth
export const main = withErrorHandler(withAuth(handler));
