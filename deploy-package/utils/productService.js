import { searchBestBuy, getBestBuyById } from "../retailers/bestbuy.js";
import { searchEbay } from "../retailers/ebay.js";
import { getWalmartById, getWalmartByUrl, searchWalmart } from "../retailers/walmart.js";
import { parseRetailerUrl } from "./parseUrl.js";
import { clusterProductGroups } from "./productCluster.js";

const isUrl = (str) => {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
};

async function resolveSearchContext(input) {
  let query = input;
  let seedProductName = null;

  if (isUrl(input)) {
    try {
      const parsed = parseRetailerUrl(input);

      if (parsed?.retailer === "BestBuy" && parsed?.id) {
        try {
          const product = await getBestBuyById(parsed.id);
          if (product?.name) {
            seedProductName = product.name;
            query = product.name;
          }
        } catch {
          // Fall back to the original input when a retailer lookup is unavailable.
        }
      }

      if (parsed?.retailer === "Walmart" && parsed?.id) {
        try {
          const product = await getWalmartByUrl(input);
          if (product?.name) {
            seedProductName = product.name;
            query = product.name;
          }
        } catch {
          // Fall back to the original input when a retailer lookup is unavailable.
        }
      }
    } catch {
      // Unsupported URLs can continue as plain search input.
    }
  }

  return {
    query,
    seedProductName
  };
}

function summarizeCluster(cluster, sourceInput) {
  const sortedOffers = cluster
    .filter(product => typeof product.price === "number")
    .sort((a, b) => a.price - b.price);

  if (sortedOffers.length === 0) {
    return null;
  }

  const bestOffer = sortedOffers[0];

  return {
    title: bestOffer.name,
    name: bestOffer.name,
    image: bestOffer.image || null,
    url: bestOffer.url || null,
    sourceInput,
    cheapestPrice: bestOffer.price,
    lowestPrice: bestOffer.price,
    cheapestRetailer: bestOffer.retailer,
    offers: sortedOffers
  };
}

export async function searchProductsAcrossRetailers(input, options = {}) {
  const { limit = 5 } = options;
  const { query, seedProductName } = await resolveSearchContext(input);

  const retailerLabels = ["BestBuy", "eBay", "Walmart"];
  const results = await Promise.allSettled([
    searchBestBuy(query),
    searchEbay(query),
    searchWalmart(query)
  ]);

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(`${retailerLabels[index]} search failed:`, result.reason);
    }
  });

  const bestbuy = results[0].status === "fulfilled" ? results[0].value : [];
  const ebay = results[1].status === "fulfilled" ? results[1].value : [];
  const walmart = results[2].status === "fulfilled" ? results[2].value : [];

  const allResults = [...bestbuy, ...ebay, ...walmart].filter(Boolean);

  if (allResults.length === 0) {
    throw new Error("No results from any retailer");
  }

  const clusters = clusterProductGroups(allResults, seedProductName || query);

  if (!clusters || clusters.length === 0) {
    throw new Error("No product offers found after clustering");
  }

  const summarizedResults = clusters
    .map(cluster => summarizeCluster(cluster, input))
    .filter(Boolean)
    .slice(0, limit);

  if (summarizedResults.length === 0) {
    throw new Error("No valid priced offers found");
  }

  return summarizedResults;
}

export async function getProductAcrossRetailers(input) {
  const results = await searchProductsAcrossRetailers(input, { limit: 1 });
  return results[0];
}

export function buildWishlistItemFromProduct(product) {
  if (!product || !(product.title || product.name) || !Array.isArray(product.offers)) {
    throw new Error("Invalid selected product");
  }

  const sortedOffers = product.offers
    .filter(offer => typeof offer?.price === "number")
    .sort((a, b) => a.price - b.price);

  if (sortedOffers.length === 0) {
    throw new Error("Selected product does not contain valid offers");
  }

  const bestOffer = sortedOffers[0];

  return {
    title: product.title || product.name || bestOffer.name,
    name: product.name || product.title || bestOffer.name,
    image: product.image || bestOffer.image || null,
    url: product.url || bestOffer.url || null,
    sourceInput: product.sourceInput || product.url || product.name || product.title || "",
    cheapestPrice: Number(product.cheapestPrice ?? product.lowestPrice ?? bestOffer.price),
    lowestPrice: Number(product.lowestPrice ?? product.cheapestPrice ?? bestOffer.price),
    cheapestRetailer: product.cheapestRetailer || bestOffer.retailer,
    offers: sortedOffers
  };
}
