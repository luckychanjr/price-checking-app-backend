import { searchBestBuyResults } from "../utils/bestBuySearchResults.js";
import { searchMeiliBestBuyResults } from "../utils/meiliSearchResults.js";
import { searchWalmart } from "../retailers/walmart.js";

const DEFAULT_RETAILER_LIMIT = 10;

function getSearchProvider() {
  return String(process.env.SEARCH_PROVIDER || "combined").toLowerCase();
}

function toSearchResult(product, sourceInput) {
  const offer = {
    retailer: product.retailer,
    retailerId: product.retailerId,
    name: product.name,
    price: product.price,
    url: product.url || null,
    image: product.image || null
  };

  return {
    title: product.name,
    name: product.name,
    image: product.image || null,
    url: product.url || null,
    sourceInput,
    cheapestPrice: product.price,
    lowestPrice: product.price,
    cheapestRetailer: product.retailer,
    offers: [offer]
  };
}

function getItemsFromSearchResponse(response) {
  return Array.isArray(response) ? response : response?.items || [];
}

function getDebugFromSearchResponse(response) {
  return Array.isArray(response) ? null : response?.debug || null;
}

function interleaveResults(...resultGroups) {
  const items = [];
  const maxLength = Math.max(...resultGroups.map(group => group.length), 0);

  for (let index = 0; index < maxLength; index += 1) {
    for (const group of resultGroups) {
      if (group[index]) {
        items.push(group[index]);
      }
    }
  }

  return items;
}

async function searchWalmartResults(input, options = {}) {
  const response = await searchWalmart(input, options);
  const products = Array.isArray(response) ? response : response.items;
  const items = products
    .filter(product => product?.name && typeof product.price === "number")
    .slice(0, options.limit ?? DEFAULT_RETAILER_LIMIT)
    .map(product => toSearchResult(product, input));

  if (options.debug) {
    return {
      items,
      debug: {
        provider: "walmart",
        ...(response.debug || {}),
        returnedItemCount: items.length,
        returnedItems: items.map(item => ({
          name: item.name,
          lowestPrice: item.lowestPrice,
          cheapestRetailer: item.cheapestRetailer
        }))
      }
    };
  }

  return items;
}

async function searchCombinedResults(input, options = {}) {
  const [bestBuyResult, walmartResult] = await Promise.allSettled([
    searchBestBuyResults(input, options),
    searchWalmartResults(input, options)
  ]);

  const bestBuyItems = [];
  const walmartItems = [];
  const debug = {
    provider: "combined",
    bestbuy: null,
    walmart: null,
    errors: []
  };

  if (bestBuyResult.status === "fulfilled") {
    bestBuyItems.push(...getItemsFromSearchResponse(bestBuyResult.value));
    debug.bestbuy = getDebugFromSearchResponse(bestBuyResult.value);
  } else {
    debug.errors.push({
      provider: "bestbuy",
      message: bestBuyResult.reason?.message || String(bestBuyResult.reason)
    });
    console.error("Best Buy search failed:", bestBuyResult.reason);
  }

  if (walmartResult.status === "fulfilled") {
    walmartItems.push(...getItemsFromSearchResponse(walmartResult.value));
    debug.walmart = getDebugFromSearchResponse(walmartResult.value);
  } else {
    debug.errors.push({
      provider: "walmart",
      message: walmartResult.reason?.message || String(walmartResult.reason)
    });
    console.error("Walmart search failed:", walmartResult.reason);
  }

  const items = interleaveResults(bestBuyItems, walmartItems);

  if (items.length === 0 && debug.errors.length > 0) {
    throw new Error("No results from any retailer");
  }

  if (options.debug) {
    return {
      items,
      debug: {
        ...debug,
        bestBuyItemCount: bestBuyItems.length,
        walmartItemCount: walmartItems.length,
        returnedItemCount: items.length,
        returnedItems: items.map(item => ({
          name: item.name,
          lowestPrice: item.lowestPrice,
          cheapestRetailer: item.cheapestRetailer
        }))
      }
    };
  }

  return items;
}

async function searchProducts(input, options = {}) {
  const provider = getSearchProvider();

  if (provider === "meilisearch") {
    return searchMeiliBestBuyResults(input, options);
  }

  if (provider === "bestbuy") {
    return searchBestBuyResults(input, options);
  }

  if (provider === "walmart") {
    return searchWalmartResults(input, options);
  }

  if (provider === "combined") {
    return searchCombinedResults(input, options);
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
      if (
        err.message !== "No results from Best Buy" &&
        err.message !== "No results from any retailer"
      ) {
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
