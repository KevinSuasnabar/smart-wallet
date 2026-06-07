import type { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { container } from '../../composition/container.js';
import { TransactionEventSchema } from '../../events/transactionEvents.js';

export const main = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];

  for (const record of event.Records) {
    try {
      const raw = JSON.parse(record.body) as unknown;
      const parsed = TransactionEventSchema.safeParse(raw);
      if (!parsed.success) {
        console.error('[transaction-events] invalid message', {
          messageId: record.messageId,
          error: parsed.error.format(),
        });
        batchItemFailures.push({ itemIdentifier: record.messageId });
        continue;
      }

      await container.monthlyAggregateRepo.applyTransactionEvent(parsed.data);
    } catch (error) {
      console.error('[transaction-events] processing failed', {
        messageId: record.messageId,
        error,
      });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
