import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { withAuth, withErrorHandler } from '../../middleware/index.js';
import type { AuthenticatedEvent } from '../../middleware/index.js';
import { container } from '../../composition/container.js';
import { ok as responseOk } from '../../shared/response.js';
import { domainErrorToResponse } from '../../shared/errors.js';
import { formatCentsForResponse } from '../../shared/boundary/index.js';

const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const result = await container.getMonthlyDashboard({ userId: event.userId });
  if (!result.ok) return domainErrorToResponse(result.error);

  return responseOk({
    range: {
      from: result.value.range.from.toISOString(),
      to: result.value.range.to.toISOString(),
    },
    totalsByCurrency: result.value.totalsByCurrency.map(({ currency, balanceCents }) => ({
      currency,
      balance: formatCentsForResponse(balanceCents, currency),
    })),
    summariesByCurrency: result.value.summariesByCurrency.map((summary) => ({
      currency: summary.currency,
      monthlyIncome: formatCentsForResponse(summary.incomeCents, summary.currency),
      monthlyExpenses: formatCentsForResponse(summary.expenseCents, summary.currency),
      monthlyNet: formatCentsForResponse(summary.netCents, summary.currency),
      topCategories: summary.topCategories.map((category) => ({
        categoryId: category.categoryId,
        amount: formatCentsForResponse(category.amountCents, summary.currency),
        share: category.share,
      })),
    })),
  });
};

export const main = withErrorHandler(withAuth(handler));
