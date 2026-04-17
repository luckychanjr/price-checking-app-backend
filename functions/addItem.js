import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { getProductAcrossRetailers } from "./productService.js";

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

const TABLE_NAME = "Wishlist"; // change if needed

const generateId = () => Date.now().toString();

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const input = body.url;

    if (!input) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing URL" })
      };
    }

    // 🔥 1. Get product comparison data
    const result = await getProductAcrossRetailers(input);

    // 🔥 2. Build item for DynamoDB
    const item = {
      id: generateId(),
      title: result.title,
      image: result.offers[0]?.image || null,
      createdAt: new Date().toISOString(),
      offers: result.offers
    };

    // 🔥 3. Save to DynamoDB
    await dynamo.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item
      })
    );

    // 🔥 4. Return response
    return {
      statusCode: 200,
      body: JSON.stringify(item)
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};