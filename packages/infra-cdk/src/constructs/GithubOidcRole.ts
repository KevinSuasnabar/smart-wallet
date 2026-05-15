import { Construct } from 'constructs';
import { CfnOutput, Stack } from 'aws-cdk-lib';
import {
  OpenIdConnectProvider,
  Role,
  FederatedPrincipal,
  ManagedPolicy,
} from 'aws-cdk-lib/aws-iam';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';

export interface GithubOidcRoleProps {
  /** GitHub owner/repo. Example: "KevinSuasnabar/smart-wallet". */
  repository: string;
  /** SSM parameter name where the role ARN gets published. */
  ssmParameterName: string;
  /**
   * Set `true` if the GitHub OIDC provider does NOT yet exist in the
   * account. AWS only allows ONE provider per URL per account, so this
   * defaults to `false` (import the existing one). For brand-new accounts,
   * set this to `true` on the first deploy and back to `false` afterwards.
   */
  createProvider?: boolean;
}

/**
 * Federated IAM role that GitHub Actions can assume via OpenID Connect.
 *
 * No long-lived AWS credentials are stored in GitHub — each workflow run
 * trades its short-lived OIDC token for a 1-hour STS session.
 *
 * The trust policy is the security boundary. The permissions policy is
 * intentionally broad (AdministratorAccess) because writing a correct
 * least-privilege policy for `serverless deploy` is its own SDD; tightening
 * is a planned follow-up.
 *
 * Trust conditions (both must hold for STS to issue credentials):
 *   - aud claim equals `sts.amazonaws.com`
 *   - sub claim matches `repo:{repository}:ref:refs/heads/main`
 * That means: only workflows running on the `main` branch of this exact
 * repository can assume the role. PRs (including from forks) cannot.
 *
 * AWS only allows ONE OIDC provider per URL per account. By default this
 * construct IMPORTS the existing one at the canonical ARN. If the account
 * does not have it yet (brand-new accounts), pass `createProvider: true`
 * for the first deploy.
 */
export class GithubOidcRole extends Construct {
  readonly role: Role;
  readonly ssmParameter: StringParameter;

  constructor(scope: Construct, id: string, props: GithubOidcRoleProps) {
    super(scope, id);

    const providerArn = `arn:aws:iam::${Stack.of(this).account}:oidc-provider/token.actions.githubusercontent.com`;
    const provider =
      props.createProvider === true
        ? new OpenIdConnectProvider(this, 'Provider', {
            url: 'https://token.actions.githubusercontent.com',
            clientIds: ['sts.amazonaws.com'],
          })
        : OpenIdConnectProvider.fromOpenIdConnectProviderArn(
            this,
            'Provider',
            providerArn,
          );

    this.role = new Role(this, 'Role', {
      roleName: 'smart-wallet-github-actions-deploy',
      description:
        'Assumable by GitHub Actions on push to main of smart-wallet (OIDC federated).',
      assumedBy: new FederatedPrincipal(
        provider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
          StringLike: {
            'token.actions.githubusercontent.com:sub': `repo:${props.repository}:ref:refs/heads/main`,
          },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
      ],
    });

    this.ssmParameter = new StringParameter(this, 'RoleArnSsm', {
      parameterName: props.ssmParameterName,
      stringValue: this.role.roleArn,
      description: 'IAM role ARN for GitHub Actions OIDC deploys',
    });

    new CfnOutput(this, 'GithubActionsRoleArn', {
      value: this.role.roleArn,
      description:
        'Paste into GitHub repo Settings → Variables → AWS_DEPLOY_ROLE_ARN',
    });
  }
}
