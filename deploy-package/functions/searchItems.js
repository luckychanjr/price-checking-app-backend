import { searchProductsAcrossRetailers } from "../utils/productService.js";

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
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

    const results = await searchProductsAcrossRetailers(input);

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ items: results })
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
