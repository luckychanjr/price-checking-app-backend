import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { refreshStoredItem } from "../utils/refreshStoredItem.js";
import {
  buildWishlistItemKey,
  dynamo,
  findWishlistItemById,
  getWishlistTableKeySchema
} from "../utils/dynamoWishlist.js";

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

    const existingItem = await findWishlistItemById(TABLE_NAME, itemId);

    if (!existingItem) {
      return {
        statusCode: 404,
        headers: {
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({ error: "Item not found" })
      };
    }

    const keySchema = await getWishlistTableKeySchema(TABLE_NAME);
    const updatedItem = await refreshStoredItem(existingItem);

    updatedItem[keySchema.partitionKey] = existingItem[keySchema.partitionKey];
    if (keySchema.sortKey) {
      updatedItem[keySchema.sortKey] = existingItem[keySchema.sortKey];
    }
    updatedItem.itemId = existingItem.itemId || existingItem.id || updatedItem.itemId;
    updatedItem.id = existingItem.id || existingItem.itemId || updatedItem.id;

    await dynamo.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...updatedItem,
          ...buildWishlistItemKey(existingItem, keySchema)
        }
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
