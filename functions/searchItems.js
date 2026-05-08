import { searchBestBuyResults } from "../utils/bestBuySearchResults.js";
import { clusterProductGroups } from "../utils/productCluster.js";
import { searchWalmart } from "../retailers/walmart.js";

const DEFAULT_RETAILER_LIMIT = 10;
const IDENTIFIER_FIELDS = [
  "upc",
  "gtin",
  "ean",
  "modelNumber",
  "brand",
  "manufacturer",
  "itemId",
  "usItemId"
];

function getSearchProvider() {
  return String(process.env.SEARCH_PROVIDER || "combined").toLowerCase();
}

function toSearchResult(product, sourceInput) {
  const identifiers = Object.fromEntries(
    IDENTIFIER_FIELDS
      .filter(field => product?.[field])
      .map(field => [field, product[field]])
  );
  const offer = {
    retailer: product.retailer,
    retailerId: product.retailerId,
    name: product.name,
    price: product.price,
    ...(product.originalPrice ? { originalPrice: product.originalPrice } : {}),
    url: product.url || null,
    image: product.image || null,
    ...identifiers
  };

  return {
    name: product.name,
    image: product.image || null,
    url: product.url || null,
    sourceInput,
    lowestPrice: product.price,
    ...(product.originalPrice ? { originalPrice: product.originalPrice } : {}),
    cheapestRetailer: product.retailer,
    ...identifiers,
    offers: [offer]
  };
}

function getItemsFromSearchResponse(response) {
  return Array.isArray(response) ? response : response?.items || [];
}

function getDebugFromSearchResponse(response) {
  return Array.isArray(response) ? null : response?.debug || null;
}

function getItemOffers(item) {
  if (Array.isArray(item?.offers) && item.offers.length > 0) {
    return item.offers;
  }

  if (typeof item?.lowestPrice === "number" || typeof item?.cheapestPrice === "number") {
    return [{
      retailer: item.cheapestRetailer,
      retailerId: item.retailerId,
      name: item.name,
      price: item.lowestPrice ?? item.cheapestPrice,
      ...(item.originalPrice ? { originalPrice: item.originalPrice } : {}),
      url: item.url || null,
      image: item.image || null
    }];
  }

  return [];
}

function getOfferRetailers(offers) {
  return [...new Set(offers.map(offer => offer?.retailer).filter(Boolean))];
}

function summarizeClusterItem(cluster) {
  const {
    title: _title,
    cheapestPrice: _cheapestPrice,
    ...primaryItem
  } = cluster[0];
  const offers = cluster
    .flatMap(item => getItemOffers(item))
    .filter(offer => typeof offer?.price === "number")
    .sort((a, b) => a.price - b.price);
  const cheapestOffer = offers[0];

  if (!cheapestOffer) {
    return primaryItem;
  }

  return {
    ...primaryItem,
    lowestPrice: cheapestOffer.price,
    ...(cheapestOffer.originalPrice ? { originalPrice: cheapestOffer.originalPrice } : {}),
    cheapestRetailer: cheapestOffer.retailer,
    offers
  };
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

function clusterCombinedResults(bestBuyItems, walmartItems, input) {
  const allItems = interleaveResults(bestBuyItems, walmartItems);
  const clusters = clusterProductGroups(allItems, input);
  const items = clusters.map(summarizeClusterItem);
  const matches = clusters
    .map(cluster => {
      const offers = cluster.flatMap(item => getItemOffers(item));
      const retailers = getOfferRetailers(offers);

      return {
        names: cluster.map(item => item.name),
        retailers,
        offerCount: offers.length
      };
    })
    .filter(match => match.retailers.length > 1);

  return {
    items,
    matches,
    clusterCount: clusters.length
  };
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
          cheapestRetailer: item.cheapestRetailer,
          upc: item.upc,
          gtin: item.gtin,
          ean: item.ean,
          modelNumber: item.modelNumber,
          brand: item.brand,
          manufacturer: item.manufacturer,
          itemId: item.itemId,
          usItemId: item.usItemId
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

  const clustered = clusterCombinedResults(bestBuyItems, walmartItems, input);
  const items = clustered.items;

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
        clusterCount: clustered.clusterCount,
        crossRetailerMatchCount: clustered.matches.length,
        crossRetailerMatches: clustered.matches,
        returnedItemCount: items.length,
        returnedItems: items.map(item => ({
          name: item.name,
          lowestPrice: item.lowestPrice,
          cheapestRetailer: item.cheapestRetailer,
          upc: item.upc,
          gtin: item.gtin,
          ean: item.ean,
          modelNumber: item.modelNumber,
          brand: item.brand,
          manufacturer: item.manufacturer,
          itemId: item.itemId,
          usItemId: item.usItemId
        }))
      }
    };
  }

  return items;
}

async function searchProducts(input, options = {}) {
  const provider = getSearchProvider();

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
    const input = body.query;
    const debug = body.debug === true || body.debug === "true";

    if (!input) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({ error: "Missing query" })
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
