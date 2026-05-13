import { Construct } from 'constructs';
import {
  UserPool as CognitoUserPool,
  AccountRecovery,
  OAuthScope,
  UserPoolClientIdentityProvider,
} from 'aws-cdk-lib/aws-cognito';
import type { UserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { RemovalPolicy } from 'aws-cdk-lib';

export interface UserPoolProps {
  userPoolName: string;
}

export class UserPool extends Construct {
  readonly userPool: CognitoUserPool;
  readonly userPoolClient: UserPoolClient;
  readonly issuerUrl: string;

  constructor(scope: Construct, id: string, props: UserPoolProps) {
    super(scope, id);

    this.userPool = new CognitoUserPool(this, 'UserPool', {
      userPoolName: props.userPoolName,
      // Closed signup: only admins create users via `aws cognito-idp admin-create-user`.
      // Personal-scale app — invitation-only model. See LOCAL_DEV.md → "Crear un usuario".
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      // autoVerify: email-only verification is irrelevant when self-signup is closed.
      // Kept to satisfy `accountRecovery: EMAIL_ONLY` which still uses email codes for forgot-password.
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 10,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      // RETAIN: never auto-delete user accounts on stack updates/destroys.
      removalPolicy: RemovalPolicy.RETAIN,
    });

    this.userPoolClient = this.userPool.addClient('AppClient', {
      authFlows: {
        userSrp: true,
        // USER_PASSWORD_AUTH enabled for simple frontend integration (MVP).
        // SRP is preferred for production — both are active for flexibility.
        userPassword: true,
      },
      preventUserExistenceErrors: true,
      // Public client: web SPA + mobile app — no client secret.
      generateSecret: false,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
        // Placeholder callback URL — update when web package is built (Slice 14).
        callbackUrls: ['http://localhost:5173/auth/callback'],
        logoutUrls: ['http://localhost:5173/'],
      },
      supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO],
    });

    this.issuerUrl = `https://cognito-idp.${process.env.CDK_DEFAULT_REGION ?? 'us-east-1'}.amazonaws.com/${this.userPool.userPoolId}`;
  }
}
