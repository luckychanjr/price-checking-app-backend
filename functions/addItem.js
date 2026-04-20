import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { getProductAcrossRetailers } from "./productService.js";
import crypto from "crypto";

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

// Use environment variable in Lambda
const TABLE_NAME = process.env.TABLE_NAME;

// Safer unique ID
const generateId = () => crypto.randomUUID();

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");

    // ✅ Support BOTH url and query inputs
    const input = body.url || body.query;

    if (!input) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({ error: "Missing url or query" })
      };
    }

    // 🔥 1. Fetch product data
    const result = await getProductAcrossRetailers(input);

    // ✅ Validate result before using it
    if (!result || !result.title || !result.offers) {
      throw new Error("Invalid product data returned");
    }

    // 🔥 2. Build DynamoDB item
    const item = {
      id: generateId(),
      title: result.title,
      image: result.offers?.[0]?.image || null, // safe optional chaining
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
      headers: {
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(item)
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