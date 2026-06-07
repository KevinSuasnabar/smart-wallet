import { UuidIdGenerator } from '../adapters/system/UuidIdGenerator.js';
import type { MaterializedRecurringTransaction } from '@smart-wallet/domain';
import { makeTransactionEventPublisher } from '../adapters/sqs/TransactionEventPublisher.js';
import { container } from '../composition/container.js';
import { env } from '../env.js';
import {
  transactionSnapshotFromEntity,
  type TransactionEvent,
} from '../events/transactionEvents.js';

const idGen = new UuidIdGenerator();
const publisher = makeTransactionEventPublisher(env.transactionEventsQueueUrl);

type AddInput = Parameters<typeof container.addTransaction>[0];
type UpdateInput = Parameters<typeof container.updateTransaction>[0];
type DeleteInput = Parameters<typeof container.deleteTransaction>[0];

export const addTransactionWithEvents = async (input: AddInput) => {
  const result = await container.addTransaction(input);
  if (result.ok && !result.value.replay) {
    await publishSafely({
      version: 1,
      eventId: idGen.uuid(),
      eventType: 'TransactionCreated',
      occurredAt: new Date().toISOString(),
      userId: input.userId,
      transactionId: result.value.transaction.id.toString(),
      walletId: input.walletId,
      after: transactionSnapshotFromEntity(result.value.transaction),
    });
  }
  return result;
};

export const updateTransactionWithEvents = async (input: UpdateInput) => {
  const beforeResult = await container.getTransaction({
    userId: input.userId,
    walletId: input.walletId,
    transactionId: input.transactionId,
  });
  if (!beforeResult.ok) return beforeResult;

  const result = await container.updateTransaction(input);
  if (result.ok && !result.value.replay) {
    await publishSafely({
      version: 1,
      eventId: idGen.uuid(),
      eventType: 'TransactionUpdated',
      occurredAt: new Date().toISOString(),
      userId: input.userId,
      transactionId: input.transactionId,
      walletId: input.walletId,
      before: transactionSnapshotFromEntity(beforeResult.value),
      after: transactionSnapshotFromEntity(result.value.transaction),
    });
  }
  return result;
};

export const deleteTransactionWithEvents = async (input: DeleteInput) => {
  const beforeResult = await container.getTransaction({
    userId: input.userId,
    walletId: input.walletId,
    transactionId: input.transactionId,
  });
  if (!beforeResult.ok) return beforeResult;

  const result = await container.deleteTransaction(input);
  if (result.ok) {
    await publishSafely({
      version: 1,
      eventId: idGen.uuid(),
      eventType: 'TransactionDeleted',
      occurredAt: new Date().toISOString(),
      userId: input.userId,
      transactionId: input.transactionId,
      walletId: input.walletId,
      before: transactionSnapshotFromEntity(beforeResult.value),
    });
  }
  return result;
};

const publishSafely = async (event: TransactionEvent): Promise<void> => {
  try {
    await publisher.publish(event);
  } catch (error) {
    console.error('[transaction-events] publish failed', {
      eventId: event.eventId,
      eventType: event.eventType,
      userId: event.userId,
      transactionId: event.transactionId,
      error,
    });
  }
};

export const publishMaterializedTransactionEvents = async (
  userId: string,
  transactions: MaterializedRecurringTransaction[],
): Promise<void> => {
  for (const transaction of transactions) {
    await publishSafely({
      version: 1,
      eventId: idGen.uuid(),
      eventType: 'TransactionCreated',
      occurredAt: new Date().toISOString(),
      userId,
      transactionId: transaction.transactionId,
      walletId: transaction.walletId,
      after: {
        type: transaction.type,
        amountCents: transaction.amountCents,
        currency: transaction.currency,
        categoryId: transaction.categoryId,
        occurredAt: transaction.occurredAt.toISOString(),
      },
    });
  }
};
