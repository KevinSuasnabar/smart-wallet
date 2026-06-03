# Deploy frontend — Design

## 1. File tree

```
packages/infra-cdk/src/
├── constructs/
│   └── WebDistribution.ts                       # NEW
└── stacks/
    └── SmartWalletStack.ts                      # MODIFY: instantiate WebDistribution

.github/workflows/
└── deploy-frontend.yml                          # NEW
```

## 2. `WebDistribution` construct

```ts
import { Construct } from 'constructs';
import { CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import {
  Bucket,
  BucketAccessControl,
  BlockPublicAccess,
  BucketEncryption,
} from 'aws-cdk-lib/aws-s3';
import {
  Distribution,
  ViewerProtocolPolicy,
  CachePolicy,
  PriceClass,
  AllowedMethods,
  CachedMethods,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';

export interface WebDistributionProps {
  /** SSM parameter prefix (e.g. '/smart-wallet/prod'). */
  prefix: string;
}

export class WebDistribution extends Construct {
  readonly bucket: Bucket;
  readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: WebDistributionProps) {
    super(scope, id);

    // S3 bucket suffix with the account id avoids global-namespace collisions
    // when other people fork this repo. The bucket is private — only the
    // CloudFront distribution's OAC principal can read.
    this.bucket = new Bucket(this, 'Bucket', {
      bucketName: `smart-wallet-web-prod-${Stack.of(this).account}`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      accessControl: BucketAccessControl.PRIVATE,
      encryption: BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      versioned: false,
    });

    // S3BucketOrigin.withOriginAccessControl uses the modern OAC pattern.
    // CDK auto-generates the bucket policy granting cloudfront.amazonaws.com
    // s3:GetObject scoped to this distribution's ARN.
    const origin = S3BucketOrigin.withOriginAccessControl(this.bucket);

    this.distribution = new Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      priceClass: PriceClass.PRICE_CLASS_100, // US, Canada, Europe — sufficient
      defaultBehavior: {
        origin,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
      },
      additionalBehaviors: {
        // /index.html ALWAYS served fresh — combined with invalidation, deploy
        // is visible to users within seconds (not the default 24h cache TTL).
        '/index.html': {
          origin,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: CachedMethods.CACHE_GET_HEAD,
          compress: true,
        },
      },
      // SPA fallback — React Router routes resolve client-side.
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.minutes(5),
        },
      ],
      comment: 'smart-wallet web prod',
    });

    // SSM params consumed by the deploy-frontend.yml workflow.
    new StringParameter(this, 'BucketNameSsm', {
      parameterName: `${props.prefix}/web/bucket-name`,
      stringValue: this.bucket.bucketName,
      description: 'S3 bucket holding the web app static files',
    });
    new StringParameter(this, 'DistributionIdSsm', {
      parameterName: `${props.prefix}/web/distribution-id`,
      stringValue: this.distribution.distributionId,
      description: 'CloudFront distribution id for cache invalidation',
    });
    new StringParameter(this, 'DistributionDomainSsm', {
      parameterName: `${props.prefix}/web/distribution-domain`,
      stringValue: this.distribution.distributionDomainName,
      description: 'CloudFront default domain (no scheme prefix)',
    });

    new CfnOutput(this, 'WebDistributionUrl', {
      value: `https://${this.distribution.distributionDomainName}`,
      description: 'Public URL of the deployed web app',
    });
  }
}
```

**Notes on construct**:

- `S3BucketOrigin.withOriginAccessControl` (from `aws-cdk-lib/aws-cloudfront-origins`) is the canonical CDK API for OAC since CDK v2.150. CDK auto-creates the distribution-scoped bucket policy.
- `RemovalPolicy.RETAIN` on the bucket means `cdk destroy` does NOT delete the bucket. This is intentional — the bucket can be re-attached to a new stack later. If you ever want to truly delete it, do it manually via S3 console or `aws s3 rb`.
- Tags are inherited from the stack (`Tags.of(this).add('project', 'smart-wallet')` etc.). No need to repeat them inside the construct.

## 3. `SmartWalletStack` change

```ts
// existing imports...
import { WebDistribution } from '../constructs/WebDistribution.js';

// inside the constructor, after GithubOidcRole:
new WebDistribution(this, 'WebDistribution', { prefix });
```

That's it. ~3 lines.

## 4. `.github/workflows/deploy-frontend.yml`

```yaml
name: Deploy frontend

on:
  push:
    branches: [main]

permissions:
  id-token: write
  contents: read

# A frontend deploy in flight should NOT be cancelled by a newer push:
# S3 sync mid-flight + invalidation may leave assets in a half-state if
# aborted. Newer pushes queue until current finishes.
concurrency:
  group: deploy-frontend
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
          aws-region: us-east-1
          role-session-name: smart-wallet-frontend-${{ github.run_id }}-${{ github.run_attempt }}

      - name: Read SSM parameters
        id: ssm
        run: |
          set -euo pipefail
          P=/smart-wallet/prod
          get() { aws ssm get-parameter --name "$1" --query Parameter.Value --output text; }
          {
            echo "bucket=$(get $P/web/bucket-name)"
            echo "distribution_id=$(get $P/web/distribution-id)"
            echo "api_url=$(get $P/api/url)"
            echo "user_pool_id=$(get $P/cognito/user-pool-id)"
            echo "client_id=$(get $P/cognito/user-pool-client-id)"
            echo "region=$(get $P/region)"
          } >> "$GITHUB_OUTPUT"

      - name: Build web
        env:
          VITE_API_BASE_URL: ${{ steps.ssm.outputs.api_url }}
          VITE_COGNITO_USER_POOL_ID: ${{ steps.ssm.outputs.user_pool_id }}
          VITE_COGNITO_CLIENT_ID: ${{ steps.ssm.outputs.client_id }}
          VITE_COGNITO_REGION: ${{ steps.ssm.outputs.region }}
        run: pnpm --filter @smart-wallet/web build

      - name: Sync to S3
        run: |
          aws s3 sync packages/web/dist/ "s3://${{ steps.ssm.outputs.bucket }}/" \
            --delete \
            --cache-control "public, max-age=31536000, immutable" \
            --exclude "index.html" \
            --exclude "*.html"
          # HTML files get short cache (CloudFront behavior also disables cache, but
          # this is a second layer of defense for direct S3 fetches in the future).
          aws s3 sync packages/web/dist/ "s3://${{ steps.ssm.outputs.bucket }}/" \
            --cache-control "no-cache, must-revalidate, max-age=0" \
            --exclude "*" \
            --include "*.html"

      - name: Invalidate CloudFront
        run: |
          aws cloudfront create-invalidation \
            --distribution-id ${{ steps.ssm.outputs.distribution_id }} \
            --paths "/*"
```

**Notes**:

- The double `aws s3 sync` with different cache-control headers is the standard pattern for static SPA hosting: assets get aggressive caching, HTML gets none. CloudFront's path-specific behavior is a second layer.
- The first sync uses `--delete` to remove stale assets; the second omits it (HTML files were already synced in the first pass at a different cache header — without `--include` filter exclusion, they'd be uploaded twice with conflicting cache-control headers; the second sync's content overrides).
- `--include "*.html"` after `--exclude "*"` is the canonical pattern to scope sync to a specific file type.
- `pnpm --filter @smart-wallet/web build` is the focused build; turbo's cache picks up the upstream packages instantly.

## 5. Cognito callback URLs

**Verified**: the app uses `USER_PASSWORD_AUTH` direct (per `packages/infra-cdk/src/constructs/UserPool.ts`). The `oAuth.callbackUrls` is configured for Cognito's hosted UI flow, which the SPA does NOT use.

**Conclusion**: no changes needed to Cognito config. The web app authenticates via `cognito-idp` SDK calls directly. The CloudFront URL works as a deploy target without any Cognito-side update.

If future versions add SAML/social login via Cognito hosted UI, the CloudFront URL would need to be added to `callbackUrls` and `logoutUrls` in UserPool.ts.

## 6. CORS

The backend (`serverless.yml`) configures:

```yaml
httpApi:
  cors:
    allowedOrigins:
      - '*'
```

`*` works from CloudFront. If future hardening narrows this to the CloudFront domain specifically, the workflow could read the SSM `/smart-wallet/prod/web/distribution-domain` and pass it as an `ALLOWED_ORIGIN` env var to serverless. Out of scope.

## 7. CDK destroy semantics

`RemovalPolicy.RETAIN` means `cdk destroy SmartWalletProdStack` does NOT delete:

- The DynamoDB table (already RETAIN per existing code)
- The Cognito user pool (already RETAIN)
- The new S3 web bucket (RETAIN per this construct)

What DOES get deleted by `cdk destroy`:

- The CloudFront distribution (creation can take 15-30 min, destroy is also slow)
- The IAM OIDC role (recreatable from CDK in <1 min)
- The OIDC provider (we import it, so destroy is a no-op for the provider itself)
- The SSM parameters (cheap, no data)

If you destroy and re-create the stack, the web bucket name stays the same (`smart-wallet-web-prod-{accountId}`), the bucket is re-attached to the new distribution, and your static files survive.

## 8. Rollout (one-time post-merge)

Documented in proposal §3. Reproduced for the apply task:

1. **Merge the PR.**
2. **Deploy CDK**:
   ```bash
   AWS_PROFILE=tomishi-account pnpm --filter @smart-wallet/infra-cdk run deploy
   ```
   This creates the S3 bucket, CloudFront distribution, and 3 SSM params.
3. **Publish the API URL to SSM** (one-time, value is stable across redeploys):
   ```bash
   # Read the URL from CloudFormation outputs:
   aws cloudformation describe-stacks \
     --stack-name smart-wallet-api-prod \
     --query 'Stacks[0].Outputs[?OutputKey==`HttpApiUrl`].OutputValue' \
     --output text \
     --region us-east-1 --profile tomishi-account
   # OR — if smoke-prod.sh's hardcoded URL is correct:
   API_URL="https://f4vv2f72ua.execute-api.us-east-1.amazonaws.com"
   aws ssm put-parameter \
     --name /smart-wallet/prod/api/url \
     --value "$API_URL" \
     --type String \
     --region us-east-1 --profile tomishi-account
   ```
4. **Read the CloudFront URL**:
   ```bash
   aws ssm get-parameter \
     --name /smart-wallet/prod/web/distribution-domain \
     --query Parameter.Value --output text \
     --region us-east-1 --profile tomishi-account
   # Returns e.g. d3xy7abc123.cloudfront.net
   ```
5. **First deploy**: trigger the workflow by pushing any trivial commit to main. The frontend deploys to `https://{cloudfront-domain}/`.

## 9. Cross-cutting decisions

| Decision                                      | Rationale                                                                                                                                                                                                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PRICE_CLASS_100`                             | Covers your user base (NA + EU). Other tiers add edges in SA/AU/India — unneeded latency improvement at extra cost.                                                                                                                                                                        |
| `cancel-in-progress: false` for deploy        | S3 sync + invalidation in flight should complete or you risk a half-deployed state.                                                                                                                                                                                                        |
| Two-pass sync for cache headers               | Standard SPA pattern. Single-pass with `--cache-control` applies it to ALL files; we need different policies for HTML vs assets.                                                                                                                                                           |
| Bucket retention                              | Survives stack destroy → resilient to accidental `cdk destroy`. Cost: ~$0 (bucket itself is free; storage is free until you accumulate GBs).                                                                                                                                               |
| `cancel-in-progress: false` vs deploy backend | Same convention (backend already has it). Consistency across deploys.                                                                                                                                                                                                                      |
| No smoke test for frontend yet                | The user visually verifies. Adding a smoke step (curl `/index.html`, grep "Smart Wallet") is a 10-line follow-up if drift becomes an issue.                                                                                                                                                |
| Sync `--delete` flag                          | Without it, deleted assets accumulate in S3 forever (storage cost grows). Acceptable trade-off: if a deploy is mid-flight, briefly some users get the new HTML referencing an asset that's mid-delete from S3 — race window is ~1 second on AWS side, irrelevant for personal app traffic. |

## 10. Risks revisited

- **OAC requires CDK ≥ 2.140**: project uses `^2.189.0` (per packages/infra-cdk/package.json). Safe.
- **API URL stale**: if serverless stack is destroyed and re-created, URL changes. SSM param needs manual update. Documented in §8.
- **CloudFront cold-start**: first request to a new edge location may be ~2-3s slower while CloudFront pulls from S3. Subsequent requests are sub-100ms.
- **Build-time env vars baked in**: if you change `VITE_API_BASE_URL` in SSM, you MUST redeploy the frontend for it to take effect. There's no runtime env var loading.
- **OIDC role permissions**: `AdministratorAccess` covers S3 sync + CloudFront invalidation + SSM read. No new role permissions needed.

## 11. LOC estimate (refined)

| File                           | LOC      |
| ------------------------------ | -------- |
| `WebDistribution.ts`           | ~120     |
| `SmartWalletStack.ts` (modify) | +5       |
| `deploy-frontend.yml`          | ~85      |
| **Total**                      | **~210** |

Single PR.
