import { z } from 'zod';
import type { Transaction } from '@smart-wallet/domain';

const TransactionSnapshotSchema = z.object({
  type: z.enum(['income', 'expense']),
  amountCents: z.number().int().positive(),
  currency: z.enum(['USD', 'PEN']),
  categoryId: z.string().min(1),
  occurredAt: z.string().datetime(),
});

export const TransactionEventSchema = z.discriminatedUnion('eventType', [
  z.object({
    version: z.literal(1),
    eventId: z.string().uuid(),
    eventType: z.literal('TransactionCreated'),
    occurredAt: z.string().datetime(),
    userId: z.string().min(1),
    transactionId: z.string().min(1),
    walletId: z.string().min(1),
    after: TransactionSnapshotSchema,
  }),
  z.object({
    version: z.literal(1),
    eventId: z.string().uuid(),
    eventType: z.literal('TransactionUpdated'),
    occurredAt: z.string().datetime(),
    userId: z.string().min(1),
    transactionId: z.string().min(1),
    walletId: z.string().min(1),
    before: TransactionSnapshotSchema,
    after: TransactionSnapshotSchema,
  }),
  z.object({
    version: z.literal(1),
    eventId: z.string().uuid(),
    eventType: z.literal('TransactionDeleted'),
    occurredAt: z.string().datetime(),
    userId: z.string().min(1),
    transactionId: z.string().min(1),
    walletId: z.string().min(1),
    before: TransactionSnapshotSchema,
  }),
]);

export type TransactionSnapshot = z.infer<typeof TransactionSnapshotSchema>;
export type TransactionEvent = z.infer<typeof TransactionEventSchema>;

export interface TransactionEventPublisher {
  publish(event: TransactionEvent): Promise<void>;
}

export const transactionSnapshotFromEntity = (transaction: Transaction): TransactionSnapshot => ({
  type: transaction.type,
  amountCents: transaction.amount.amount,
  currency: transaction.amount.currency,
  categoryId: transaction.categoryId,
  occurredAt: transaction.occurredAt.toISOString(),
});
