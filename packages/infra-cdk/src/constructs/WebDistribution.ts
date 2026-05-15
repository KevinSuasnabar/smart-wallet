import { Construct } from 'constructs';
import { CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import {
  Bucket,
  BucketAccessControl,
  BlockPublicAccess,
  BucketEncryption,
  type IBucket,
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

/**
 * Public web distribution: a private S3 bucket fronted by CloudFront with
 * Origin Access Control. SPA-aware (403/404 fall back to `/index.html`),
 * cache-aware (HTML is uncached, hashed assets get long TTLs), and HTTPS-only.
 *
 * The bucket is RETAINed on stack destroy so accidental `cdk destroy` does
 * not nuke uploaded assets. Manual cleanup via S3 console or `aws s3 rb` is
 * required if you ever want the bucket gone.
 */
export class WebDistribution extends Construct {
  readonly bucket: Bucket;
  readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: WebDistributionProps) {
    super(scope, id);

    // Account-suffixed name avoids global S3 namespace collisions when
    // someone forks this repo and deploys to their own account.
    this.bucket = new Bucket(this, 'Bucket', {
      bucketName: `smart-wallet-web-prod-${Stack.of(this).account}`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      accessControl: BucketAccessControl.PRIVATE,
      encryption: BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      versioned: false,
    });

    // OAC (Origin Access Control) is AWS's recommended successor to OAI
    // since 2022. CDK auto-generates the bucket policy restricting reads
    // to this exact distribution's principal. The `as IBucket` cast is a
    // workaround for `exactOptionalPropertyTypes: true` — CDK's `IBucket`
    // has `isWebsite: boolean` (non-optional) but `Bucket` infers it as
    // optional from the omitted constructor prop.
    const origin = S3BucketOrigin.withOriginAccessControl(
      this.bucket as IBucket,
    );

    this.distribution = new Distribution(this, 'Distribution', {
      comment: 'smart-wallet web prod',
      defaultRootObject: 'index.html',
      priceClass: PriceClass.PRICE_CLASS_100, // US + Canada + Europe
      defaultBehavior: {
        origin,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
      },
      additionalBehaviors: {
        // /index.html ALWAYS bypasses the edge cache. Combined with the
        // post-deploy invalidation, users see new HTML within seconds.
        '/index.html': {
          origin,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: CachedMethods.CACHE_GET_HEAD,
          compress: true,
        },
      },
      // SPA fallback — React Router routes (e.g. /dashboard) only exist on
      // the client. Refreshing them returns 404 from S3; rewrite to
      // /index.html with HTTP 200 so the SPA boots and resolves the path.
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
    });

    // SSM parameters consumed by the deploy-frontend.yml workflow.
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
