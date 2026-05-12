import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  UpdateTimeToLiveCommand,
} from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({
  endpoint: 'http://localhost:8000',
  region: 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});

const TABLE = 'smart-wallet-local';

const run = async (): Promise<void> => {
  try {
    await client.send(new DescribeTableCommand({ TableName: TABLE }));
    console.log(`table ${TABLE} already exists`);
    return;
  } catch {
    // Table does not exist — proceed to create it
  }

  await client.send(
    new CreateTableCommand({
      TableName: TABLE,
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
        { AttributeName: 'GSI1PK', AttributeType: 'S' },
        { AttributeName: 'GSI1SK', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'GSI1',
          KeySchema: [
            { AttributeName: 'GSI1PK', KeyType: 'HASH' },
            { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    }),
  );

  await client.send(
    new UpdateTimeToLiveCommand({
      TableName: TABLE,
      TimeToLiveSpecification: { Enabled: true, AttributeName: 'ttl' },
    }),
  );

  console.log(`table ${TABLE} created`);
};

run().catch(console.error);
