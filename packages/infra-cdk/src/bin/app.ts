import { App } from 'aws-cdk-lib';
import { SmartWalletStack } from '../stacks/SmartWalletStack.js';

const app = new App();

const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION ?? 'us-east-1';

new SmartWalletStack(app, 'SmartWalletProdStack', {
  stage: 'prod',
  env: {
    ...(account !== undefined ? { account } : {}),
    region,
  },
});
