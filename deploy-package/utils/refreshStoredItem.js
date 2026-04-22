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
  const currentDisplayName =
    currentItem?.name && currentItem.name !== "Unknown Item"
      ? currentItem.name
      : currentItem?.title && currentItem.title !== "Unknown Item"
        ? currentItem.title
        : "";
  const refreshedDisplayName = result.name || result.title || currentDisplayName || "Unknown Item";
  const refreshedOffers =
    Array.isArray(result.offers) && result.offers.length > 0
      ? result.offers
      : Array.isArray(currentItem?.offers)
        ? currentItem.offers
        : [];
  const cheapestOffer = refreshedOffers.find(offer => typeof offer?.price === "number") || refreshedOffers[0] || null;
  const refreshedImage =
    currentItem?.image ||
    result.image ||
    cheapestOffer?.image ||
    null;
  const refreshedUrl =
    currentItem?.url ||
    result.url ||
    cheapestOffer?.url ||
    null;
  const refreshedPrice =
    result.cheapestPrice ??
    result.lowestPrice ??
    cheapestOffer?.price ??
    currentItem?.cheapestPrice ??
    currentItem?.lowestPrice ??
    0;

  return {
    ...currentItem,
    id: currentItem.id || currentItem.itemId,
    itemId: currentItem.itemId || currentItem.id,
    title: currentItem.title || refreshedDisplayName,
    name: currentDisplayName || refreshedDisplayName,
    sourceInput: currentItem.sourceInput || refreshInput,
    image: refreshedImage,
    url: refreshedUrl,
    cheapestPrice: refreshedPrice,
    lowestPrice: result.lowestPrice ?? result.cheapestPrice ?? refreshedPrice,
    cheapestRetailer:
      result.cheapestRetailer ||
      cheapestOffer?.retailer ||
      currentItem.cheapestRetailer ||
      "Unknown",
    lastUpdated,
    offers: refreshedOffers
  };
}
