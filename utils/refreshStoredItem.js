import { getProductAcrossRetailers } from "./productService.js";

export async function refreshStoredItem(currentItem) {
  const refreshInput =
    currentItem?.sourceInput ||
    currentItem?.url ||
    currentItem?.name ||
    currentItem?.title;

  if (!refreshInput) {
    throw new Error("Item does not have refreshable input");
  }

  const result = await getProductAcrossRetailers(refreshInput);

  if (!result || !result.title || !result.offers) {
    throw new Error("Invalid product data returned");
  }

  const lastUpdated = new Date().toISOString();

  return {
    ...currentItem,
    itemId: currentItem.itemId || currentItem.id,
    title: result.title,
    name: result.title,
    sourceInput: currentItem.sourceInput || refreshInput,
    image: result.offers?.[0]?.image || null,
    url: result.offers?.[0]?.url || currentItem.url || null,
    cheapestPrice: result.cheapestPrice,
    lowestPrice: result.cheapestPrice,
    cheapestRetailer: result.cheapestRetailer,
    lastUpdated,
    offers: result.offers
  };
}
