import { CognitoUserPool } from 'amazon-cognito-identity-js';
import { env } from '../env.js';

export const userPool = new CognitoUserPool({
  UserPoolId: env.cognito.userPoolId,
  ClientId: env.cognito.clientId,
});
