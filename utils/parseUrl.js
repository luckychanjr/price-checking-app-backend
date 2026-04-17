/*export function parseUrl(url) {
  if (url.includes("bestbuy.com")) {
    const parts = url.split("/");
    const last = parts[parts.length - 1];
    const productId = last.replace(".p", "");

    return { retailer: "bestbuy", productId };
  }

  if (url.includes("walmart.com")) {
    const match = url.match(/\/ip\/(\d+)/);
    return {
      retailer: "walmart",
      productId: match ? match[1] : null
    };
  }

  throw new Error("Unsupported retailer");
}*/

import { extractBestBuyId } from "./bestbuy.js";

export function parseRetailerUrl(url) {
  if (url.includes("bestbuy.com")) {
    return {
      retailer: "BestBuy",
      id: extractBestBuyId(url)
    };
  }

  if (url.includes("walmart.com")) {
    const match = url.match(/\/ip\/(\d+)/);

    return {
      retailer: "Walmart",
      id: match?.[1] || null
    };
  }

  throw new Error("Unsupported retailer");
}