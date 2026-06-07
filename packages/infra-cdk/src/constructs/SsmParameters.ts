import { Construct } from 'constructs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import type { Table } from 'aws-cdk-lib/aws-dynamodb';
import type { TelegramSessionsTable } from './TelegramSessionsTable.js';
import type { TransactionEventsQueue } from './TransactionEventsQueue.js';
import type { UserPool, UserPoolClient } from 'aws-cdk-lib/aws-cognito';

export interface SsmParametersProps {
  table: Table;
  telegramSessionsTable: TelegramSessionsTable;
  transactionEventsQueue: TransactionEventsQueue;
  userPool: UserPool;
  userPoolClient: UserPoolClient;
  issuerUrl: string;
  region: string;
  /** Parameter prefix, e.g. '/smart-wallet/prod' */
  prefix: string;
}

export class SsmParameters extends Construct {
  constructor(scope: Construct, id: string, props: SsmParametersProps) {
    super(scope, id);

    new StringParameter(this, 'TableName', {
      parameterName: `${props.prefix}/dynamo/table-name`,
      stringValue: props.table.tableName,
    });

    new StringParameter(this, 'TableArn', {
      parameterName: `${props.prefix}/dynamo/table-arn`,
      stringValue: props.table.tableArn,
    });

    new StringParameter(this, 'Gsi1Name', {
      parameterName: `${props.prefix}/dynamo/gsi1-name`,
      stringValue: 'GSI1',
    });

    new StringParameter(this, 'UserPoolId', {
      parameterName: `${props.prefix}/cognito/user-pool-id`,
      stringValue: props.userPool.userPoolId,
    });

    new StringParameter(this, 'UserPoolArn', {
      parameterName: `${props.prefix}/cognito/user-pool-arn`,
      stringValue: props.userPool.userPoolArn,
    });

    new StringParameter(this, 'UserPoolClientId', {
      parameterName: `${props.prefix}/cognito/user-pool-client-id`,
      stringValue: props.userPoolClient.userPoolClientId,
    });

    new StringParameter(this, 'IssuerUrl', {
      parameterName: `${props.prefix}/cognito/issuer-url`,
      stringValue: props.issuerUrl,
    });

    new StringParameter(this, 'Region', {
      parameterName: `${props.prefix}/region`,
      stringValue: props.region,
    });

    new StringParameter(this, 'TelegramSessionsTableName', {
      parameterName: `${props.prefix}/dynamo/telegram-sessions-table-name`,
      stringValue: props.telegramSessionsTable.table.tableName,
    });

    new StringParameter(this, 'TelegramSessionsTableArn', {
      parameterName: `${props.prefix}/dynamo/telegram-sessions-table-arn`,
      stringValue: props.telegramSessionsTable.table.tableArn,
    });

    new StringParameter(this, 'TransactionEventsQueueUrl', {
      parameterName: `${props.prefix}/sqs/transaction-events-url`,
      stringValue: props.transactionEventsQueue.queue.queueUrl,
    });

    new StringParameter(this, 'TransactionEventsQueueArn', {
      parameterName: `${props.prefix}/sqs/transaction-events-arn`,
      stringValue: props.transactionEventsQueue.queue.queueArn,
    });

    new StringParameter(this, 'TransactionEventsDlqArn', {
      parameterName: `${props.prefix}/sqs/transaction-events-dlq-arn`,
      stringValue: props.transactionEventsQueue.dlq.queueArn,
    });
  }
}
