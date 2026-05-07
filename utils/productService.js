import { searchBestBuy, getBestBuyById } from "../retailers/bestbuy.js";
import { getWalmartByUrl, searchWalmart } from "../retailers/walmart.js";
import { parseRetailerUrl } from "./parseUrl.js";
import { scoreProductSimilarity } from "./productCluster.js";

const DEFAULT_SEARCH_LIMIT = 10;
const ACCESSORY_TERMS = [
  "applecare",
  "apple care",
  "protection plan",
  "warranty",
  "case",
  "cover",
  "folio",
  "sleeve",
  "glass",
  "shield",
  "installation",
  "screen protector",
  "protector",
  "keyboard",
  "pencil",
  "stylus",
  "charger",
  "adapter",
  "cable",
  "stand",
  "holder",
  "mount",
  "dock",
  "compatible with",
  "for ipad",
  "for apple ipad"
];

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
  let seedProduct = null;

  if (isUrl(input)) {
    try {
      const parsed = parseRetailerUrl(input);

      if (parsed?.retailer === "BestBuy" && parsed?.id) {
        try {
          const product = await getBestBuyById(parsed.id);
          if (product?.name) {
            seedProduct = product;
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
            seedProduct = product;
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
    seedProductName,
    seedProduct
  };
}

function dedupeProducts(products) {
  const seen = new Set();

  return products.filter((product) => {
    if (!product) {
      return false;
    }

    const key = `${product.retailer || "unknown"}::${product.retailerId || product.url || product.name}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function isLikelyAccessory(productName) {
  const name = String(productName ?? "").toLowerCase();

  return ACCESSORY_TERMS.some(term => name.includes(term));
}

function isAccessorySearch(query) {
  return isLikelyAccessory(query);
}

function getProductRelevance(product, query) {
  const similarity = scoreProductSimilarity(product.name, query);
  const accessoryPenalty = isLikelyAccessory(product.name) ? 6 : 0;

  return similarity - accessoryPenalty;
}

function summarizeProduct(product, sourceInput) {
  if (typeof product?.price !== "number") {
    return null;
  }

  return {
    title: product.name,
    name: product.name,
    image: product.image || null,
    url: product.url || null,
    sourceInput,
    cheapestPrice: product.price,
    lowestPrice: product.price,
    cheapestRetailer: product.retailer,
    offers: [product]
  };
}

export async function searchProductsAcrossRetailers(input, options = {}) {
  const { limit = DEFAULT_SEARCH_LIMIT } = options;
  const { query, seedProductName, seedProduct } = await resolveSearchContext(input);
  const rankingQuery = seedProductName || query;

  const retailerLabels = ["BestBuy", "Walmart"];
  const results = await Promise.allSettled([
    searchBestBuy(query),
    searchWalmart(query)
  ]);

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(`${retailerLabels[index]} search failed:`, result.reason);
    }
  });

  const bestbuy = results[0].status === "fulfilled" ? results[0].value : [];
  const walmart = results[1].status === "fulfilled" ? results[1].value : [];

  const allResults = dedupeProducts([seedProduct, ...bestbuy, ...walmart])
    .filter(product => isAccessorySearch(rankingQuery) || !isLikelyAccessory(product.name));

  if (allResults.length === 0) {
    throw new Error("No results from any retailer");
  }

  const summarizedResults = allResults
    .sort((a, b) => getProductRelevance(b, rankingQuery) - getProductRelevance(a, rankingQuery))
    .map(product => summarizeProduct(product, input))
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
