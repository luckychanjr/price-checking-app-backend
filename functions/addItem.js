import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  buildWishlistItemFromProduct,
  getProductAcrossRetailers
} from "../utils/productService.js";
import crypto from "crypto";

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME;

const generateId = () => crypto.randomUUID();

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const input = body.url || body.query;
    const selectedProduct = body.selectedProduct;

    if (!input && !selectedProduct) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({ error: "Missing url or query" })
      };
    }

    const result = selectedProduct
      ? buildWishlistItemFromProduct(selectedProduct)
      : await getProductAcrossRetailers(input);

    if (!result || !result.title || !result.offers) {
      throw new Error("Invalid product data returned");
    }

    const id = generateId();
    const createdAt = new Date().toISOString();
    const item = {
      id,
      itemId: id,
      title: result.title,
      name: result.name || result.title,
      sourceInput: result.sourceInput || input || result.url || result.title,
      image: result.image || result.offers?.[0]?.image || null,
      url: result.url || result.offers?.[0]?.url || null,
      cheapestPrice: result.cheapestPrice,
      lowestPrice: result.lowestPrice ?? result.cheapestPrice,
      cheapestRetailer: result.cheapestRetailer,
      createdAt,
      lastUpdated: createdAt,
      offers: result.offers
    };

    await dynamo.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item
      })
    );

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
