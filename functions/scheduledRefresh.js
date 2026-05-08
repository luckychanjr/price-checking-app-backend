import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { refreshStoredItem } from "../utils/refreshStoredItem.js";

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME;

async function scanAllItems(maxItems) {
  const items = [];
  let exclusiveStartKey;

  do {
    const data = await dynamo.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        ExclusiveStartKey: exclusiveStartKey
      })
    );

    if (Array.isArray(data.Items)) {
      items.push(...data.Items);
    }

    exclusiveStartKey = data.LastEvaluatedKey;
  } while (exclusiveStartKey && (!maxItems || items.length < maxItems));

  return maxItems ? items.slice(0, maxItems) : items;
}

export const handler = async (event = {}) => {
  try {
    const maxItems =
      typeof event.maxItems === "number" && event.maxItems > 0 ? event.maxItems : null;

    const items = await scanAllItems(maxItems);
    const failures = [];
    let refreshedCount = 0;

    for (const item of items) {
      try {
        const updatedItem = await refreshStoredItem(item);

        await dynamo.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: updatedItem
          })
        );

        refreshedCount += 1;
      } catch (err) {
        failures.push({
          itemId: item?.itemId || item?.id || "unknown",
          error: err.message || "Unknown refresh error"
        });
      }
    }

    console.log("scheduledRefresh result", {
      scannedCount: items.length,
      refreshedCount,
      failedCount: failures.length,
      failures
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        scannedCount: items.length,
        refreshedCount,
        failedCount: failures.length,
        failures
      })
    };
  } catch (err) {
    console.error("ERROR:", err);

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: err.message || "Internal server error"
      })
    };
  }
};
