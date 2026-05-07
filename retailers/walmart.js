const WALMART_RAPIDAPI_HOST = "walmart-api4.p.rapidapi.com";
const WALMART_SEARCH_TIMEOUT_MS = 4000;
const WALMART_PRODUCT_TIMEOUT_MS = 4000;

function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function buildRapidApiHeaders(apiKey) {
  return {
    "Content-Type": "application/json",
    "x-rapidapi-host": WALMART_RAPIDAPI_HOST,
    "x-rapidapi-key": apiKey
  };
}

async function readJsonOrText(response) {
  const text = await response.text();

  if (!text) {
    return "";
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function formatErrorDetails(details) {
  if (!details) {
    return "";
  }

  if (typeof details === "string") {
    return details;
  }

  return details.message || JSON.stringify(details);
}

async function ensureOk(response, label) {
  if (response.ok) {
    return;
  }

  const details = await readJsonOrText(response);
  const suffix = formatErrorDetails(details);

  throw new Error(
    `${label} failed with ${response.status}${suffix ? `: ${suffix}` : ""}`
  );
}

async function fetchWithTimeout(url, options, timeoutMs, label) {
  try {
    return await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      throw new Error(`${label} timed out after ${timeoutMs}ms`);
    }

    throw err;
  }
}

function parseWalmartPrice(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/[^0-9.]/g, "");
  const parsed = Number.parseFloat(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function extractWalmartIdFromUrl(url) {
  if (typeof url !== "string" || !url) {
    return null;
  }

  try {
    const { pathname } = new URL(url);
    const segments = pathname.split("/").filter(Boolean);
    const ipIndex = segments.indexOf("ip");

    if (ipIndex === -1) {
      return null;
    }

    const tail = segments.slice(ipIndex + 1);
    return tail.length > 0 ? tail[tail.length - 1] : null;
  } catch {
    return null;
  }
}

function normalizeSearchItem(item) {
  const productUrl = item.link || item.url || item.productUrl || item.canonicalUrl || null;
  const price =
    parseWalmartPrice(item.price?.currentPrice) ??
    parseWalmartPrice(item.price?.price) ??
    parseWalmartPrice(item.price) ??
    parseWalmartPrice(item.salePrice) ??
    parseWalmartPrice(item.currentPrice);

  return {
    retailer: "Walmart",
    retailerId: String(item.id ?? item.productId ?? item.usItemId ?? extractWalmartIdFromUrl(productUrl) ?? productUrl ?? ""),
    name: item.title || item.name || item.productName,
    price,
    url: productUrl,
    image: item.image || item.thumbnail || item.imageUrl || item.productImage || null
  };
}

function findProductArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const candidates = [
    value.body?.products,
    value.body?.results,
    value.body?.items,
    value.products,
    value.results,
    value.items,
    value.data?.products,
    value.data?.results,
    value.data?.items,
    value.searchResult?.itemStacks?.[0]?.items
  ];

  const arrayCandidate = candidates.find(Array.isArray);
  return arrayCandidate || [];
}

export async function searchWalmart(query) {
  const apiKey = getRequiredEnv("WALMART_RAPIDAPI_KEY");
  const walmartSearchUrl =
    `https://${WALMART_RAPIDAPI_HOST}/search?q=${encodeURIComponent(query)}&page=1`;

  const res = await fetchWithTimeout(
    walmartSearchUrl,
    {
      headers: buildRapidApiHeaders(apiKey)
    },
    WALMART_SEARCH_TIMEOUT_MS,
    "Walmart search request"
  );

  await ensureOk(res, "Walmart search request");

  const data = await res.json();
  const products = findProductArray(data);

  return products
    .slice(0, 20)
    .map(normalizeSearchItem)
    .filter((item) => item.name && typeof item.price === "number");
}

export async function getWalmartByUrl(productUrl) {
  const apiKey = getRequiredEnv("WALMART_RAPIDAPI_KEY");
  const retailerId = extractWalmartIdFromUrl(productUrl) || productUrl;

  const res = await fetchWithTimeout(
    `https://${WALMART_RAPIDAPI_HOST}/product-details.php?url=${encodeURIComponent(productUrl)}`,
    {
      headers: buildRapidApiHeaders(apiKey)
    },
    WALMART_PRODUCT_TIMEOUT_MS,
    "Walmart product details request"
  );

  await ensureOk(res, "Walmart product details request");

  const data = await res.json();
  const item = data.body;

  if (!item?.title) throw new Error("Walmart product not found");

  return {
    retailer: "Walmart",
    retailerId,
    name: item.title,
    price: parseWalmartPrice(item.price),
    url: productUrl,
    image: item.images?.[0] || null
  };
}

export async function getWalmartById(id) {
  const productUrl = `https://www.walmart.com/ip/${id}`;
  return getWalmartByUrl(productUrl);
}
