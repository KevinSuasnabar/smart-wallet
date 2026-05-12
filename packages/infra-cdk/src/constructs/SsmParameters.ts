import { Construct } from 'constructs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import type { Table } from 'aws-cdk-lib/aws-dynamodb';
import type { UserPool, UserPoolClient } from 'aws-cdk-lib/aws-cognito';

export interface SsmParametersProps {
  table: Table;
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
  }
}
