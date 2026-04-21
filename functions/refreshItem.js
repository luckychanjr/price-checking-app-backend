import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { refreshStoredItem } from "../utils/refreshStoredItem.js";

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME;

export const handler = async (event) => {
  try {
    const itemId = event?.pathParameters?.itemId;

    if (!itemId) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({ error: "Missing itemId path parameter" })
      };
    }

    const existing = await dynamo.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          id: itemId
        }
      })
    );

    if (!existing.Item) {
      return {
        statusCode: 404,
        headers: {
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({ error: "Item not found" })
      };
    }

    const updatedItem = await refreshStoredItem(existing.Item);

    await dynamo.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: updatedItem
      })
    );

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(updatedItem)
    };
  } catch (err) {
    console.error("ERROR:", err);

    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        error: err.message || "Internal server error"
      })
    };
  }
};
