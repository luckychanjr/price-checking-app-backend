const WALMART_RAPIDAPI_HOST = "walmart-api4.p.rapidapi.com";
const WALMART_SEARCH_TIMEOUT_MS = 12000;
const WALMART_PRODUCT_TIMEOUT_MS = 12000;
const DEBUG_SCAN_MAX_DEPTH = 8;
const DEBUG_SCAN_MAX_MATCHES = 100;
const DEBUG_PRODUCT_DETAIL_LIMIT = 3;
const DEBUG_SCAN_KEY_PATTERNS = [
  /upc/i,
  /gtin/i,
  /ean/i,
  /model/i,
  /brand/i,
  /manufacturer/i,
  /itemid/i,
  /usitemid/i,
  /productid/i,
  /identifier/i,
  /^specifications?$/i,
  /^specificationGroups?$/i
];

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

function firstParsedPrice(...values) {
  for (const value of values) {
    const parsed = parseWalmartPrice(value);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function getNestedValue(source, path) {
  return path.split(".").reduce((value, key) => value?.[key], source);
}

function getWalmartCurrentPrice(item) {
  return firstParsedPrice(
    item.price?.currentPrice,
    item.price?.salePrice,
    item.price?.price,
    item.currentPrice,
    item.salePrice,
    item.price
  );
}

function getWalmartOriginalPrice(item, currentPrice) {
  const originalPrice = firstParsedPrice(
    item.price?.wasPrice,
    item.price?.listPrice,
    item.price?.regularPrice,
    item.price?.retailPrice,
    item.price?.comparisonPrice,
    item.wasPrice,
    item.listPrice,
    item.regularPrice,
    item.retailPrice,
    item.msrp,
    getNestedValue(item, "priceInfo.wasPrice.price"),
    getNestedValue(item, "priceInfo.listPrice.price"),
    getNestedValue(item, "priceInfo.linePrice.price"),
    getNestedValue(item, "priceInfo.comparisonPrice.price"),
    getNestedValue(item, "priceInfo.currentPrice.price")
  );

  return typeof currentPrice === "number" &&
    typeof originalPrice === "number" &&
    originalPrice > currentPrice
    ? originalPrice
    : null;
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

function buildProductDetailsUrl(productUrl) {
  return `https://${WALMART_RAPIDAPI_HOST}/product-details.php?url=${encodeURIComponent(productUrl)}`;
}

function normalizeSearchItem(item) {
  const productUrl = item.link || item.url || item.productUrl || item.canonicalUrl || null;
  const price = getWalmartCurrentPrice(item);
  const originalPrice = getWalmartOriginalPrice(item, price);

  return {
    retailer: "Walmart",
    retailerId: String(item.id ?? item.productId ?? item.usItemId ?? extractWalmartIdFromUrl(productUrl) ?? productUrl ?? ""),
    name: item.title || item.name || item.productName,
    price,
    ...(originalPrice ? { originalPrice } : {}),
    url: productUrl,
    image: item.image || item.thumbnail || item.imageUrl || item.productImage || null,
    ...(item.upc ? { upc: item.upc } : {}),
    ...(item.gtin ? { gtin: item.gtin } : {}),
    ...(item.ean ? { ean: item.ean } : {}),
    ...(item.modelNumber ? { modelNumber: item.modelNumber } : {}),
    ...(item.brand ? { brand: item.brand } : {}),
    ...(item.manufacturer ? { manufacturer: item.manufacturer } : {}),
    ...(item.itemId ? { itemId: item.itemId } : {}),
    ...(item.usItemId ? { usItemId: item.usItemId } : {})
  };
}

function findProductArray(value) {
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
    value.searchResult,
    value.searchResult?.products,
    value.searchResult?.results,
    value.searchResult?.items,
    value.searchResult?.itemStacks?.[0]?.items
  ];

  return candidates
    .filter(Array.isArray)
    .flatMap(candidate => collectProductCandidates(candidate));
}

function getObjectKeys(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value)
    : [];
}

function isProductCandidate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Boolean(
    value.title ||
    value.name ||
    value.productName ||
    value.price ||
    value.salePrice ||
    value.currentPrice ||
    value.link ||
    value.url ||
    value.productUrl ||
    value.canonicalUrl ||
    value.id ||
    value.productId ||
    value.usItemId
  );
}

function collectProductCandidates(value) {
  if (Array.isArray(value)) {
    return value.flatMap(item => collectProductCandidates(item));
  }

  if (isProductCandidate(value)) {
    return [value];
  }

  return [];
}

function getValueType(value) {
  if (Array.isArray(value)) {
    return "array";
  }

  return value === null ? "null" : typeof value;
}

function summarizeValue(value) {
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      firstItemKeys: getObjectKeys(value[0])
    };
  }

  if (value && typeof value === "object") {
    return {
      type: "object",
      keys: Object.keys(value).slice(0, 25)
    };
  }

  return {
    type: getValueType(value),
    value
  };
}

function formatDebugPath(parentPath, key) {
  if (/^\d+$/.test(String(key))) {
    return `${parentPath}[${key}]`;
  }

  return parentPath ? `${parentPath}.${key}` : String(key);
}

function summarizeDebugMatchValue(value) {
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      firstItemKeys: getObjectKeys(value[0])
    };
  }

  if (value && typeof value === "object") {
    return {
      type: "object",
      keys: Object.keys(value).slice(0, 20)
    };
  }

  return value;
}

function keyMatchesDebugScan(key) {
  return DEBUG_SCAN_KEY_PATTERNS.some(pattern => pattern.test(String(key)));
}

function scanDebugFields(value, path = "$", depth = 0, matches = [], seen = new WeakSet()) {
  if (
    matches.length >= DEBUG_SCAN_MAX_MATCHES ||
    depth > DEBUG_SCAN_MAX_DEPTH ||
    !value ||
    typeof value !== "object"
  ) {
    return matches;
  }

  if (seen.has(value)) {
    return matches;
  }

  seen.add(value);

  const entries = Array.isArray(value)
    ? value.entries()
    : Object.entries(value);

  for (const [key, child] of entries) {
    if (matches.length >= DEBUG_SCAN_MAX_MATCHES) {
      break;
    }

    const childPath = formatDebugPath(path, key);

    if (keyMatchesDebugScan(key)) {
      matches.push({
        path: childPath,
        key: String(key),
        type: getValueType(child),
        value: summarizeDebugMatchValue(child)
      });
    }

    scanDebugFields(child, childPath, depth + 1, matches, seen);
  }

  return matches;
}

async function scanProductDetailsForDebug(products, normalizedProducts, apiKey) {
  const urls = [];
  const seen = new Set();

  for (let index = 0; index < normalizedProducts.length; index += 1) {
    const productUrl = normalizedProducts[index]?.url;

    if (!productUrl || seen.has(productUrl)) {
      continue;
    }

    seen.add(productUrl);
    urls.push({
      index,
      url: productUrl,
      name: normalizedProducts[index]?.name || products[index]?.title || products[index]?.name || null
    });

    if (urls.length >= DEBUG_PRODUCT_DETAIL_LIMIT) {
      break;
    }
  }

  const scans = [];
  const fieldMatches = [];

  for (const item of urls) {
    const detailUrl = buildProductDetailsUrl(item.url);

    try {
      const response = await fetchWithTimeout(
        detailUrl,
        {
          headers: buildRapidApiHeaders(apiKey)
        },
        WALMART_PRODUCT_TIMEOUT_MS,
        "Walmart product details debug request"
      );

      await ensureOk(response, "Walmart product details debug request");

      const data = await response.json();
      const matches = scanDebugFields(data);
      const scan = {
        index: item.index,
        name: item.name,
        url: item.url,
        detailUrl,
        topLevelKeys: getObjectKeys(data),
        bodyKeys: getObjectKeys(data?.body),
        fieldMatchCount: matches.length
      };

      scans.push(scan);
      fieldMatches.push(
        ...matches.map(match => ({
          index: item.index,
          name: item.name,
          url: item.url,
          ...match
        }))
      );
    } catch (err) {
      scans.push({
        index: item.index,
        name: item.name,
        url: item.url,
        detailUrl,
        error: err.message || String(err)
      });
    }
  }

  return {
    limit: DEBUG_PRODUCT_DETAIL_LIMIT,
    scannedCount: scans.length,
    scans,
    fieldMatches
  };
}

function summarizeRawProduct(item) {
  if (!item || typeof item !== "object") {
    return item;
  }

  return {
    keys: Object.keys(item).slice(0, 25),
    id: item.id,
    productId: item.productId,
    itemId: item.itemId,
    usItemId: item.usItemId,
    upc: item.upc,
    gtin: item.gtin,
    ean: item.ean,
    modelNumber: item.modelNumber,
    brand: item.brand,
    manufacturer: item.manufacturer,
    title: item.title,
    name: item.name,
    productName: item.productName,
    price: item.price,
    wasPrice: item.wasPrice,
    listPrice: item.listPrice,
    regularPrice: item.regularPrice,
    retailPrice: item.retailPrice,
    msrp: item.msrp,
    priceInfo: item.priceInfo,
    salePrice: item.salePrice,
    currentPrice: item.currentPrice,
    link: item.link,
    url: item.url,
    productUrl: item.productUrl,
    canonicalUrl: item.canonicalUrl
  };
}

export async function searchWalmart(query, options = {}) {
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
  const normalizedProducts = products
    .slice(0, 20)
    .map(normalizeSearchItem);
  const items = normalizedProducts
    .filter((item) => item.name && typeof item.price === "number");

  if (options.debug) {
    const productDetailsDebug = await scanProductDetailsForDebug(
      products,
      normalizedProducts,
      apiKey
    );

    return {
      items,
      debug: {
        url: walmartSearchUrl,
        aggregatedCount: data?.aggregatedCount,
        topLevelKeys: getObjectKeys(data),
        bodyKeys: getObjectKeys(data?.body),
        dataKeys: getObjectKeys(data?.data),
        searchResultKeys: getObjectKeys(data?.searchResult),
        searchResultSummary: summarizeValue(data?.searchResult),
        identifierFieldMatches: scanDebugFields(data),
        productDetailScans: productDetailsDebug.scans,
        productDetailFieldMatches: productDetailsDebug.fieldMatches,
        productDetailScanLimit: productDetailsDebug.limit,
        productDetailScannedCount: productDetailsDebug.scannedCount,
        productArrayCount: products.length,
        normalizedCount: normalizedProducts.length,
        validItemCount: items.length,
        droppedAfterNormalizeCount: normalizedProducts.length - items.length,
        sampleRawProducts: products.slice(0, 5).map(summarizeRawProduct),
        sampleNormalizedProducts: normalizedProducts.slice(0, 5)
      }
    };
  }

  return items;
}
