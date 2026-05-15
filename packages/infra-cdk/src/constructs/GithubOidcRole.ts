import { Construct } from 'constructs';
import { CfnOutput } from 'aws-cdk-lib';
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
 * AWS only allows ONE OIDC provider per URL per account. If another stack
 * in this account already created the GitHub provider, this construct will
 * fail at deploy time — swap to `OpenIdConnectProvider.fromOpenIdConnectProviderArn`
 * to look up the existing one instead.
 */
export class GithubOidcRole extends Construct {
  readonly role: Role;
  readonly ssmParameter: StringParameter;

  constructor(scope: Construct, id: string, props: GithubOidcRoleProps) {
    super(scope, id);

    const provider = new OpenIdConnectProvider(this, 'Provider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

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
