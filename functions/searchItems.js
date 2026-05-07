import { searchBestBuyResults } from "../utils/bestBuySearchResults.js";
import { searchMeiliBestBuyResults } from "../utils/meiliSearchResults.js";
import { scoreProductSimilarity } from "../utils/productCluster.js";
import { searchWalmart } from "../retailers/walmart.js";

const DEFAULT_RETAILER_LIMIT = 10;
const CROSS_RETAILER_MERGE_THRESHOLD = 6;
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
    url: product.url || null,
    image: product.image || null,
    ...identifiers
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

function normalizeIdentifier(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getSharedIdentifierMatch(a, b) {
  const aIdentifiers = [
    a?.upc,
    a?.gtin,
    a?.ean,
    ...(Array.isArray(a?.offers) ? a.offers.flatMap(offer => [offer?.upc, offer?.gtin, offer?.ean]) : [])
  ].map(normalizeIdentifier).filter(Boolean);
  const bIdentifiers = [
    b?.upc,
    b?.gtin,
    b?.ean,
    ...(Array.isArray(b?.offers) ? b.offers.flatMap(offer => [offer?.upc, offer?.gtin, offer?.ean]) : [])
  ].map(normalizeIdentifier).filter(Boolean);
  const bSet = new Set(bIdentifiers);

  return aIdentifiers.find(identifier => bSet.has(identifier)) || null;
}

function getModelNumberHint(a, b) {
  const values = [
    a?.modelNumber,
    ...(Array.isArray(a?.offers) ? a.offers.map(offer => offer?.modelNumber) : [])
  ].map(normalizeIdentifier).filter(Boolean);
  const bName = normalizeIdentifier(b?.name);

  return values.find(value => value.length >= 4 && bName.includes(value)) || null;
}

function getOfferPrice(offer) {
  return typeof offer?.price === "number" ? offer.price : Number.POSITIVE_INFINITY;
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
      url: item.url || null,
      image: item.image || null
    }];
  }

  return [];
}

function summarizeMergedItem(primaryItem, mergedOffers) {
  const offers = mergedOffers
    .filter(offer => typeof offer?.price === "number")
    .sort((a, b) => a.price - b.price);
  const cheapestOffer = offers[0];

  if (!cheapestOffer) {
    return primaryItem;
  }

  return {
    ...primaryItem,
    cheapestPrice: cheapestOffer.price,
    lowestPrice: cheapestOffer.price,
    cheapestRetailer: cheapestOffer.retailer,
    offers
  };
}

function findBestCrossRetailerMatch(walmartItem, bestBuyItems) {
  let bestMatch = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestReason = null;

  for (const bestBuyItem of bestBuyItems) {
    const sharedIdentifier = getSharedIdentifierMatch(bestBuyItem, walmartItem);
    const modelNumberHint = getModelNumberHint(bestBuyItem, walmartItem);
    const similarity = scoreProductSimilarity(bestBuyItem.name, walmartItem.name);
    const score = similarity + (sharedIdentifier ? 10 : 0) + (modelNumberHint ? 2.5 : 0);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = bestBuyItem;
      bestReason = sharedIdentifier
        ? "shared_identifier"
        : modelNumberHint
          ? "model_number_in_name"
          : "name_similarity";
    }
  }

  if (!bestMatch || bestScore < CROSS_RETAILER_MERGE_THRESHOLD) {
    return null;
  }

  return {
    item: bestMatch,
    score: bestScore,
    reason: bestReason
  };
}

function mergeCrossRetailerResults(bestBuyItems, walmartItems) {
  const mergedByBestBuyItem = new Map();
  const unmatchedWalmartItems = [];
  const matches = [];

  for (const walmartItem of walmartItems) {
    const match = findBestCrossRetailerMatch(walmartItem, bestBuyItems);

    if (!match) {
      unmatchedWalmartItems.push(walmartItem);
      continue;
    }

    const existingOffers = mergedByBestBuyItem.get(match.item) || getItemOffers(match.item);
    mergedByBestBuyItem.set(match.item, [
      ...existingOffers,
      ...getItemOffers(walmartItem)
    ]);
    matches.push({
      bestBuyName: match.item.name,
      walmartName: walmartItem.name,
      score: Number(match.score.toFixed(3)),
      reason: match.reason
    });
  }

  return {
    bestBuyItems: bestBuyItems.map(item => (
      mergedByBestBuyItem.has(item)
        ? summarizeMergedItem(item, mergedByBestBuyItem.get(item))
        : item
    )),
    walmartItems: unmatchedWalmartItems,
    matches
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

  const merged = mergeCrossRetailerResults(bestBuyItems, walmartItems);
  const items = interleaveResults(merged.bestBuyItems, merged.walmartItems);

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
        crossRetailerMatchCount: merged.matches.length,
        crossRetailerMatches: merged.matches,
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
