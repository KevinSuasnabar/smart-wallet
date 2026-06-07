import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import type {
  TransactionEvent,
  TransactionEventPublisher,
} from '../../events/transactionEvents.js';

class NoopTransactionEventPublisher implements TransactionEventPublisher {
  async publish(): Promise<void> {
    // Local/offline mode intentionally does not require SQS or LocalStack.
  }
}

class SqsTransactionEventPublisher implements TransactionEventPublisher {
  private readonly client = new SQSClient({});

  constructor(private readonly queueUrl: string) {}

  async publish(event: TransactionEvent): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(event),
      }),
    );
  }
}

export const makeTransactionEventPublisher = (queueUrl: string): TransactionEventPublisher =>
  queueUrl.length === 0
    ? new NoopTransactionEventPublisher()
    : new SqsTransactionEventPublisher(queueUrl);
