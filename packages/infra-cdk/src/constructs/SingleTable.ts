import { Construct } from 'constructs';
import {
  Table,
  AttributeType,
  BillingMode,
  ProjectionType,
  TableEncryption,
} from 'aws-cdk-lib/aws-dynamodb';
import { RemovalPolicy } from 'aws-cdk-lib';

export interface SingleTableProps {
  tableName: string;
}

export class SingleTable extends Construct {
  readonly table: Table;

  constructor(scope: Construct, id: string, props: SingleTableProps) {
    super(scope, id);

    this.table = new Table(this, 'Table', {
      tableName: props.tableName,
      partitionKey: { name: 'PK', type: AttributeType.STRING },
      sortKey: { name: 'SK', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      // PITR disabled — MVP cost constraint (NFR-COST-01).
      // Trade-off: no point-in-time recovery; manual backups must be done
      // before any destructive migration in later releases.
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: false },
      encryption: TableEncryption.AWS_MANAGED,
      // RETAIN: never auto-delete user financial data on stack updates/destroys.
      removalPolicy: RemovalPolicy.RETAIN,
    });

    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });
  }
}
