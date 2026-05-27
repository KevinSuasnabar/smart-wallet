import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { withAuth, withErrorHandler } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';

const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const userId = event.userId;
  const link = await container.telegramLinkRepo.findByUserId(userId);

  if (!link) {
    return { statusCode: 200, body: JSON.stringify({ linked: false }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ linked: true, linkedAt: link.linkedAt }),
  };
};

export const main = withErrorHandler(withAuth(handler));
