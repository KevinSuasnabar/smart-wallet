import { GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ok, err } from '@smart-wallet/domain';
import type {
  ParticipantRepository,
  Participant,
  ParticipantId,
  ParticipantError,
  UserId,
  Result,
} from '@smart-wallet/domain';
import { ParticipantNotFound, ParticipantAlreadyDeleted } from '@smart-wallet/domain';
import { ddb, TABLE_NAME } from '../DynamoDBClient.js';
import { userPK, participantSK, participantSKPrefix } from '../keyBuilders.js';
import { participantToItem, itemToParticipant } from '../mappers/ParticipantMapper.js';
import type { ParticipantItem } from '../mappers/ParticipantMapper.js';

export class DynamoDBParticipantRepository implements ParticipantRepository {
  async save(participant: Participant): Promise<void> {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: participantToItem(participant),
      }),
    );
  }

  async findById(userId: UserId, participantId: ParticipantId): Promise<Participant | null> {
    const response = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: userPK(userId.toString()),
          SK: participantSK(participantId.toString()),
        },
      }),
    );

    if (!response.Item) return null;

    const result = itemToParticipant(response.Item as ParticipantItem);
    return result.ok ? result.value : null;
  }

  async listByUser(userId: UserId): Promise<Participant[]> {
    const response = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skp)',
        FilterExpression: 'attribute_not_exists(deletedAt)',
        ExpressionAttributeValues: {
          ':pk': userPK(userId.toString()),
          ':skp': participantSKPrefix(),
        },
      }),
    );

    return (response.Items ?? [])
      .map((raw) => itemToParticipant(raw as ParticipantItem))
      .filter((res) => res.ok)
      .map((res) => res.value);
  }

  async update(participant: Participant): Promise<void> {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: participantToItem(participant),
        ConditionExpression: 'attribute_exists(PK)',
      }),
    );
  }

  async softDelete(participant: Participant): Promise<void> {
    if (participant.deletedAt === null) return;

    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: userPK(participant.userId.toString()),
          SK: participantSK(participant.id.toString()),
        },
        UpdateExpression: 'SET deletedAt = :deletedAt, updatedAt = :updatedAt',
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeValues: {
          ':deletedAt': participant.deletedAt.toISOString(),
          ':updatedAt': participant.updatedAt.toISOString(),
        },
      }),
    );
  }

  async validateParticipantForUser(input: {
    userId: UserId;
    participantId: ParticipantId;
  }): Promise<Result<void, ParticipantError>> {
    const participant = await this.findById(input.userId, input.participantId);

    // findById is partition-scoped to USER#<userId>, so "not found" already
    // covers "owned by someone else".
    if (participant === null) return err(new ParticipantNotFound());
    if (participant.deletedAt !== null) return err(new ParticipantAlreadyDeleted());

    return ok(undefined);
  }
}
