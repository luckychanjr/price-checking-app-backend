import { searchBestBuy, getBestBuyById } from "../retailers/bestbuy.js";
import { searchWalmart, getWalmartById } from "../retailers/walmart.js";
import { parseRetailerUrl } from "./parseUrl.js";

export async function getProductAcrossRetailers(input) {
  let query = input;
  let seedProductName = null;

  // 1. If it's a URL → extract ID + retailer
  if (input.includes("http")) {
    const parsed = parseRetailerUrl(input);

    if (parsed.retailer === "BestBuy") {
      const product = await getBestBuyById(parsed.id);
      seedProductName = product.name;
      query = product.name;
    }

    if (parsed.retailer === "Walmart") {
      const product = await getWalmartById(parsed.id);
      seedProductName = product.name;
      query = product.name;
    }
  }

  // 2. Query ALL retailers in parallel
  const [bestbuy, walmart] = await Promise.all([
    searchBestBuy(query),
    searchWalmart(query)
  ]);

  const allResults = [...bestbuy, ...walmart];

  // 3. Cluster matches into one product group
  const cluster = clusterProducts(allResults, seedProductName || query);

  // 4. Sort offers by price
  const sortedOffers = cluster.sort((a, b) => a.price - b.price);

  return {
    title: sortedOffers[0].name,
    cheapestPrice: sortedOffers[0].price,
    cheapestRetailer: sortedOffers[0].retailer,
    offers: sortedOffers
  };
}