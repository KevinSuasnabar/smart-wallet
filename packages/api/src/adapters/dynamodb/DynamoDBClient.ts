import { DynamoDBClient as RawDynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { env } from '../../env.js';

const raw = new RawDynamoDBClient({
  region: env.region,
  ...(env.isOffline
    ? {
        endpoint: env.dynamoEndpoint,
        credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
      }
    : {}),
});

export const ddb = DynamoDBDocumentClient.from(raw, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: false,
  },
  unmarshallOptions: {
    wrapNumbers: false,
  },
});

export const TABLE_NAME = env.tableName;
export const GSI1_NAME = env.gsi1Name;
