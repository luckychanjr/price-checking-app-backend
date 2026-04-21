import { searchBestBuy, getBestBuyById } from "../retailers/bestbuy.js";
import { searchWalmart, getWalmartById } from "../retailers/walmart.js";
import { parseRetailerUrl } from "./parseUrl.js";
import { clusterProducts } from "./productCluster.js";

// Helper: safer URL detection
const isUrl = (str) => {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
};

export async function getProductAcrossRetailers(input) {
  let query = input;
  let seedProductName = null;

  // 🔍 1. If input is a URL → extract product info
  if (isUrl(input)) {
    const parsed = parseRetailerUrl(input);

    if (parsed?.retailer === "BestBuy" && parsed?.id) {
      const product = await getBestBuyById(parsed.id);
      if (product?.name) {
        seedProductName = product.name;
        query = product.name;
      }
    }

    if (parsed?.retailer === "Walmart" && parsed?.id) {
      const product = await getWalmartById(parsed.id);
      if (product?.name) {
        seedProductName = product.name;
        query = product.name;
      }
    }
  }

  // 🔥 2. Query retailers (fail-safe)
  const results = await Promise.allSettled([
    searchBestBuy(query),
    searchWalmart(query)
  ]);

  const bestbuy = results[0].status === "fulfilled" ? results[0].value : [];
  const walmart = results[1].status === "fulfilled" ? results[1].value : [];

  const allResults = [...bestbuy, ...walmart].filter(Boolean);

  if (allResults.length === 0) {
    throw new Error("No results from any retailer");
  }

  // 🔗 3. Cluster products
  const cluster = clusterProducts(allResults, seedProductName || query);

  if (!cluster || cluster.length === 0) {
    throw new Error("No product offers found after clustering");
  }

  // 💰 4. Sort by price (safe)
  const sortedOffers = cluster
    .filter(p => typeof p.price === "number")
    .sort((a, b) => a.price - b.price);

  if (sortedOffers.length === 0) {
    throw new Error("No valid priced offers found");
  }

  // 🧾 5. Return normalized structure
  return {
    title: sortedOffers[0].name,
    cheapestPrice: sortedOffers[0].price,
    cheapestRetailer: sortedOffers[0].retailer,
    offers: sortedOffers
  };
}
