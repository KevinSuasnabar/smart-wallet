---
name: sw-cdk
description: "Trigger: CDK, infrastructure, new DynamoDB table, Cognito, SSM parameter, construct, stack, AWS resource. Smart-wallet CDK patterns."
license: MIT
metadata:
  author: smart-wallet
  version: "1.0"
---

## Activation Contract

Load when creating or editing anything in `packages/infra-cdk/`.

## Hard Rules

- **One construct per concern** — never define resources directly in the stack; always extract to a `constructs/` class
- **Stack only assembles** constructs — no `new Table(...)` or `new UserPool(...)` directly in `SmartWalletStack`
- **RETAIN on all data resources** — `removalPolicy: RemovalPolicy.RETAIN` on every DynamoDB table and Cognito UserPool; never auto-delete user financial data
- **All CDK outputs go to SSM** — every value Serverless Framework needs at deploy time lives in SSM under `/smart-wallet/{stage}/{service}/{key}`; never hardcode ARNs or IDs in `serverless.yml`
- **Tags at stack level** — `project`, `stage`, `managed-by: cdk` applied via `Tags.of(this).add()`; individual constructs do not re-tag
- **Only `prod` stage** — the stack `props.stage` type is `'prod'`; there is no staging environment
- **Cognito: closed signup** — `selfSignUpEnabled: false`; users are created by admin via `aws cognito-idp admin-create-user`; never enable self-signup
- **DynamoDB billing**: `BillingMode.PAY_PER_REQUEST` only — no provisioned capacity
- **TTL attribute** named `ttl` on all tables that need auto-expiry
- **PITR disabled** (cost constraint NFR-COST-01) — document this with an inline comment if present; use manual backups before destructive migrations

## Construct Skeleton

```typescript
import { Construct } from 'constructs';

export interface MyResourceProps { name: string }

export class MyResource extends Construct {
  readonly resource: SomeAwsType;   // expose what the stack or other constructs need

  constructor(scope: Construct, id: string, props: MyResourceProps) {
    super(scope, id);
    // define resources here
  }
}
```

## Checklist for a New AWS Resource

- [ ] Create `constructs/MyResource.ts` extending `Construct`
- [ ] Expose needed references as `readonly` properties
- [ ] Add `removalPolicy: RemovalPolicy.RETAIN` for data-bearing resources
- [ ] Wire in `SmartWalletStack` constructor
- [ ] Publish needed values to SSM via `SsmParameters` construct
- [ ] Add `CfnOutput` for values needed in the AWS Console

## SSM Naming Convention

```
/smart-wallet/{stage}/dynamo/table-name
/smart-wallet/{stage}/dynamo/table-arn
/smart-wallet/{stage}/cognito/user-pool-id
/smart-wallet/{stage}/cognito/user-pool-client-id
/smart-wallet/{stage}/cognito/issuer-url
/smart-wallet/{stage}/region
```
