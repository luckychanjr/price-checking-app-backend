import { DescribeTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

const keySchemaCache = new Map();

function normalizeItemIdentifier(item) {
  return String(item?.itemId ?? item?.id ?? "");
}

export async function getWishlistTableKeySchema(tableName) {
  if (!tableName) {
    throw new Error("Missing TABLE_NAME environment variable");
  }

  if (keySchemaCache.has(tableName)) {
    return keySchemaCache.get(tableName);
  }

  const response = await client.send(
    new DescribeTableCommand({
      TableName: tableName
    })
  );

  const keySchema = response?.Table?.KeySchema ?? [];
  const partitionKey = keySchema.find(entry => entry.KeyType === "HASH")?.AttributeName;
  const sortKey = keySchema.find(entry => entry.KeyType === "RANGE")?.AttributeName ?? null;

  if (!partitionKey) {
    throw new Error(`Unable to determine partition key for table ${tableName}`);
  }

  const schema = {
    partitionKey,
    sortKey
  };

  keySchemaCache.set(tableName, schema);
  return schema;
}

export async function findWishlistItemById(tableName, itemId) {
  if (!tableName) {
    throw new Error("Missing TABLE_NAME environment variable");
  }

  let exclusiveStartKey;

  do {
    const response = await dynamo.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: exclusiveStartKey
      })
    );

    const match = response.Items?.find(item => normalizeItemIdentifier(item) === String(itemId));
    if (match) {
      return match;
    }

    exclusiveStartKey = response.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return null;
}

export function buildWishlistItemKey(item, keySchema) {
  const key = {};
  const partitionValue =
    item?.[keySchema.partitionKey] ??
    item?.itemId ??
    item?.id;

  if (partitionValue === undefined || partitionValue === null) {
    throw new Error(`Missing partition key value for ${keySchema.partitionKey}`);
  }

  key[keySchema.partitionKey] = partitionValue;

  if (keySchema.sortKey) {
    const sortValue = item?.[keySchema.sortKey];

    if (sortValue === undefined || sortValue === null) {
      throw new Error(`Missing sort key value for ${keySchema.sortKey}`);
    }

    key[keySchema.sortKey] = sortValue;
  }

  return key;
}

export { dynamo };
