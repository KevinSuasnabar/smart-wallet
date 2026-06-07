import { Duration } from 'aws-cdk-lib';
import { Alarm, ComparisonOperator } from 'aws-cdk-lib/aws-cloudwatch';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export interface TransactionEventsQueueProps {
  queueName: string;
  dlqName: string;
}

export class TransactionEventsQueue extends Construct {
  readonly queue: Queue;
  readonly dlq: Queue;
  readonly dlqVisibleMessagesAlarm: Alarm;

  constructor(scope: Construct, id: string, props: TransactionEventsQueueProps) {
    super(scope, id);

    this.dlq = new Queue(this, 'Dlq', {
      queueName: props.dlqName,
      retentionPeriod: Duration.days(14),
    });

    this.queue = new Queue(this, 'Queue', {
      queueName: props.queueName,
      retentionPeriod: Duration.days(4),
      visibilityTimeout: Duration.seconds(60),
      deadLetterQueue: {
        queue: this.dlq,
        maxReceiveCount: 5,
      },
    });

    this.dlqVisibleMessagesAlarm = new Alarm(this, 'DlqVisibleMessagesAlarm', {
      metric: this.dlq.metricApproximateNumberOfMessagesVisible(),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      alarmDescription:
        'Transaction events are stuck in the DLQ and need manual inspection/replay.',
    });
  }
}
