export function extractBestBuySku(value) {
  if (typeof value !== "string") {
    return null;
  }

  const patterns = [
    /[?&]skuId=(\d+)/i,
    /\/(\d+)\.p(?:[/?#]|$)/i,
    /\/sku\/(\d+)(?:[/?#]|$)/i,
    /\/click\/[^/]+\/(\d+)\/pdp(?:[/?#]|$)/i
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

export function buildBestBuyProductUrl(sku) {
  if (!sku) {
    return null;
  }

  return `https://api.bestbuy.com/click/-/${sku}/pdp`;
}

export function normalizeBestBuyUrl(url, sku = null) {
  const resolvedSku = sku || extractBestBuySku(url);

  if (!resolvedSku) {
    return url || null;
  }

  if (typeof url !== "string") {
    return buildBestBuyProductUrl(resolvedSku);
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return buildBestBuyProductUrl(resolvedSku);
  }

  const host = parsed.hostname.toLowerCase();
  const isBestBuyHost = host === "bestbuy.com" || host.endsWith(".bestbuy.com");

  if (!isBestBuyHost) {
    return url;
  }

  if (host === "api.bestbuy.com" || parsed.pathname.includes("/click/")) {
    return url;
  }

  if (parsed.pathname.includes("/site/") && !parsed.searchParams.has("skuId")) {
    return buildBestBuyProductUrl(resolvedSku);
  }

  if (parsed.pathname.includes("/site/-/")) {
    return buildBestBuyProductUrl(resolvedSku);
  }

  return url;
}
