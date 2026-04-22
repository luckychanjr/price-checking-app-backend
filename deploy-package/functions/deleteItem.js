import { DeleteCommand } from "@aws-sdk/lib-dynamodb";
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

    await dynamo.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: buildWishlistItemKey(existingItem, keySchema)
      })
    );

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        success: true,
        itemId
      })
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
