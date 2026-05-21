import { Construct } from 'constructs';
import {
  Table,
  AttributeType,
  BillingMode,
  TableEncryption,
} from 'aws-cdk-lib/aws-dynamodb';
import { RemovalPolicy } from 'aws-cdk-lib';

export interface TelegramSessionsTableProps {
  tableName: string;
}

export class TelegramSessionsTable extends Construct {
  readonly table: Table;

  constructor(scope: Construct, id: string, props: TelegramSessionsTableProps) {
    super(scope, id);

    // Sessions are ephemeral (TTL 10 min). RemovalPolicy.RETAIN keeps the empty
    // table on stack destroy to avoid accidental re-creation races; cost is $0.
    this.table = new Table(this, 'Table', {
      tableName: props.tableName,
      partitionKey: { name: 'chatId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      encryption: TableEncryption.AWS_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
    });
  }
}
