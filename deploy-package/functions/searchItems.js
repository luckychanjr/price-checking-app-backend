import { searchBestBuyResults } from "../utils/bestBuySearchResults.js";
import { searchMeiliBestBuyResults } from "../utils/meiliSearchResults.js";

function getSearchProvider() {
  return String(process.env.SEARCH_PROVIDER || "bestbuy").toLowerCase();
}

async function searchProducts(input, options = {}) {
  if (getSearchProvider() === "meilisearch") {
    return searchMeiliBestBuyResults(input, options);
  }

  return searchBestBuyResults(input, options);
}

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const input = body.url || body.query;
    const debug = body.debug === true || body.debug === "true";

    if (!input) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({ error: "Missing url or query" })
      };
    }

    let results = [];

    try {
      results = await searchProducts(input, { debug });
    } catch (err) {
      if (err.message !== "No results from Best Buy") {
        throw err;
      }
    }

    const responseBody = Array.isArray(results)
      ? { items: results }
      : results;

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(responseBody)
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
