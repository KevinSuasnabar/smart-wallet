import { Stack, CfnOutput, Tags } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { SingleTable } from '../constructs/SingleTable.js';
import { UserPool } from '../constructs/UserPool.js';
import { SsmParameters } from '../constructs/SsmParameters.js';
import { GithubOidcRole } from '../constructs/GithubOidcRole.js';
import { WebDistribution } from '../constructs/WebDistribution.js';

export interface SmartWalletStackProps extends StackProps {
  stage: 'prod';
}

export class SmartWalletStack extends Stack {
  constructor(scope: Construct, id: string, props: SmartWalletStackProps) {
    super(scope, id, props);

    Tags.of(this).add('project', 'smart-wallet');
    Tags.of(this).add('stage', props.stage);
    Tags.of(this).add('managed-by', 'cdk');

    const tableName = `smart-wallet-${props.stage}`;
    const userPoolName = `smart-wallet-${props.stage}`;
    const prefix = `/smart-wallet/${props.stage}`;

    const singleTable = new SingleTable(this, 'SingleTable', { tableName });
    const userPool = new UserPool(this, 'UserPool', { userPoolName });

    // PITR disabled by design — MVP cost constraint (NFR-COST-01).
    // Enable pointInTimeRecovery in SmartWalletStack when moving to production
    // beyond MVP. Manual DynamoDB on-demand backups are the mitigation.
    new SsmParameters(this, 'SsmParameters', {
      table: singleTable.table,
      userPool: userPool.userPool,
      userPoolClient: userPool.userPoolClient,
      issuerUrl: userPool.issuerUrl,
      region: this.region,
      prefix,
    });

    // OIDC-federated IAM role for GitHub Actions deploys. The trust policy
    // restricts assume to this exact repo + main branch — the role's broad
    // AdministratorAccess is acceptable because nothing outside main can
    // get into it.
    new GithubOidcRole(this, 'GithubOidc', {
      repository: 'KevinSuasnabar/smart-wallet',
      ssmParameterName: `${prefix}/github-actions-role-arn`,
    });

    new WebDistribution(this, 'WebDistribution', { prefix });

    new CfnOutput(this, 'TableName', {
      value: singleTable.table.tableName,
      description: 'DynamoDB single-table name',
    });

    new CfnOutput(this, 'UserPoolId', {
      value: userPool.userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new CfnOutput(this, 'UserPoolClientId', {
      value: userPool.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID (public — no secret)',
    });

    new CfnOutput(this, 'IssuerUrl', {
      value: userPool.issuerUrl,
      description: 'Cognito JWT issuer URL for JWT authorizer',
    });
  }
}
