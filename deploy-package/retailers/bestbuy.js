const BESTBUY_SEARCH_TIMEOUT_MS = 4000;
const BESTBUY_PRODUCT_TIMEOUT_MS = 4000;
const BESTBUY_CANDIDATE_LIMIT = 50;
const SERVICE_OR_ACCESSORY_TERMS = [
  "applecare",
  "apple care",
  "geek squad protection",
  "protection plan",
  "service plan",
  "warranty",
  "accidental damage",
  "glass",
  "shield",
  "installation",
  "screen protector",
  "case",
  "cover",
  "stand",
  "holder",
  "mount",
  "dock",
  "compatible with",
  "keyboard",
  "charger",
  "adapter",
  "cable"
];
const TABLET_TERMS = ["ipad", "tablet"];
const BESTBUY_FIELDS = [
  "sku",
  "name",
  "salePrice",
  "url",
  "image"
];

async function fetchWithTimeout(url, timeoutMs, label) {
  try {
    return await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      throw new Error(`${label} timed out after ${timeoutMs}ms`);
    }

    throw err;
  }
}

export function extractBestBuyId(url) {
  let match = url.match(/\/(\d+)\.p/);
  if (match) return match[1];

  match = url.match(/\/sku\/(\d+)/);
  if (match) return match[1];

  return null;
}

function isServiceOrAccessorySearch(query) {
  const normalizedQuery = String(query ?? "").toLowerCase();

  return SERVICE_OR_ACCESSORY_TERMS.some(term => normalizedQuery.includes(term));
}

function isServiceOrAccessoryProduct(productName) {
  const normalizedName = String(productName ?? "").toLowerCase();

  return SERVICE_OR_ACCESSORY_TERMS.some(term => normalizedName.includes(term));
}

function shouldRunTabletRetry(query) {
  const normalizedQuery = String(query ?? "").toLowerCase();

  return TABLET_TERMS.some(term => normalizedQuery.includes(term)) &&
    !normalizedQuery.includes("tablet");
}

function normalizeProduct(p) {
  return {
    retailer: "BestBuy",
    retailerId: p.sku,
    name: p.name,
    price: p.salePrice,
    url: p.url,
    image: p.image
  };
}

function getSearchTerms(query) {
  return String(query ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map(term => term.trim())
    .filter(Boolean);
}

function buildBestBuySearchUrl(query, apiKey) {
  const searchTerms = getSearchTerms(query);
  const searchExpression = searchTerms.length > 0
    ? searchTerms.map(term => `search=${encodeURIComponent(term)}`).join("&")
    : `search=${encodeURIComponent(query)}`;

  return `https://api.bestbuy.com/v1/products(${searchExpression})?apiKey=${apiKey}&format=json&pageSize=${BESTBUY_CANDIDATE_LIMIT}&show=${BESTBUY_FIELDS.join(",")}`;
}

async function fetchBestBuyProducts(query) {
  const API_KEY = process.env.BESTBUY_API_KEY;

  const url = buildBestBuySearchUrl(query, API_KEY);

  const res = await fetchWithTimeout(url, BESTBUY_SEARCH_TIMEOUT_MS, "BestBuy search request");
  const data = await res.json();

  return data.products || [];
}

function filterBestBuyProducts(products, query) {
  return products
    .filter((p) => isServiceOrAccessorySearch(query) || !isServiceOrAccessoryProduct(p.name))
    .map(normalizeProduct);
}

function dedupeBySku(products) {
  const seen = new Set();

  return products.filter(product => {
    if (!product?.retailerId || seen.has(product.retailerId)) {
      return false;
    }

    seen.add(product.retailerId);
    return true;
  });
}

export async function searchBestBuy(query) {
  const primaryProducts = await fetchBestBuyProducts(query);
  const primaryMatches = filterBestBuyProducts(primaryProducts, query);

  if (primaryMatches.length > 0 || !shouldRunTabletRetry(query)) {
    return primaryMatches;
  }

  const tabletProducts = await fetchBestBuyProducts(`${query} tablet`);
  return dedupeBySku(filterBestBuyProducts(tabletProducts, query));
}

export async function getBestBuyById(sku) {
  const API_KEY = process.env.BESTBUY_API_KEY;

  const url = `https://api.bestbuy.com/v1/products(sku=${sku})?apiKey=${API_KEY}&format=json`;

  const res = await fetchWithTimeout(url, BESTBUY_PRODUCT_TIMEOUT_MS, "BestBuy product request");
  const data = await res.json();

  const p = data.products?.[0];

  if (!p) throw new Error("Best Buy product not found");

  return {
    retailer: "BestBuy",
    retailerId: p.sku,
    name: p.name,
    price: p.salePrice,
    url: p.url,
    image: p.image
  };
}
