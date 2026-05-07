import { resolveBestBuyCategoryIds } from "./bestBuyCategoryResolver.js";

const BESTBUY_SEARCH_TIMEOUT_MS = 4000;
const BESTBUY_RESULT_LIMIT = 10;
const BESTBUY_CANDIDATE_LIMIT = 50;
const BESTBUY_CATEGORY_SEARCH_LIMIT = 3;
const BESTBUY_MAX_CALLS_PER_SEARCH = 5;
const BESTBUY_INTER_CALL_DELAY_MS = 500;
const BESTBUY_RATE_LIMIT_DELAY_MS = 1200;
const BESTBUY_MAX_RETRIES = 2;
const BESTBUY_FIELDS = [
  "sku",
  "name",
  "salePrice",
  "url",
  "image",
  "upc",
  "modelNumber",
  "manufacturer",
  "department",
  "class",
  "subclass",
  "categoryPath.id",
  "categoryPath.name"
];
const QUERY_RELAXATION_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "the",
  "with"
]);
const QUERY_RELAXATION_BRANDS = new Set([
  "apple",
  "bose",
  "microsoft",
  "samsung",
  "sony"
]);
const QUERY_RELAXATION_PRODUCT_WORDS = new Set([
  "console",
  "edition",
  "headphones",
  "tablet",
  "wireless"
]);

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getSearchTerms(query) {
  return String(query ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map(term => term.trim())
    .filter(Boolean);
}

function buildBestBuySearchExpression(query, categoryId = null) {
  const terms = getSearchTerms(query);
  const searchTerms = terms.length > 0
    ? terms.map(term => `search=${encodeURIComponent(term)}`).join("&")
    : `search=${encodeURIComponent(query)}`;
  const categoryTerm = categoryId
    ? `&categoryPath.id=${encodeURIComponent(categoryId)}`
    : "";

  return `${searchTerms}${categoryTerm}`;
}

function buildBestBuySearchUrl(query, apiKey, categoryId = null) {
  const searchExpression = buildBestBuySearchExpression(query, categoryId);

  return `https://api.bestbuy.com/v1/products(${searchExpression})?apiKey=${apiKey}&format=json&pageSize=${BESTBUY_CANDIDATE_LIMIT}&show=${BESTBUY_FIELDS.join(",")}`;
}

async function readJsonOrText(response) {
  if (typeof response.text !== "function" && typeof response.json === "function") {
    return response.json();
  }

  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function getErrorMessage(details) {
  if (!details) {
    return "";
  }

  if (typeof details === "string") {
    return details;
  }

  return details.errorMessage || details.message || JSON.stringify(details);
}

function isRateLimitResponse(response, details) {
  return response.status === 403 && /limit/i.test(getErrorMessage(details));
}

async function fetchBestBuyJsonWithRetry(url, label) {
  const attempts = [];

  for (let attempt = 0; attempt <= BESTBUY_MAX_RETRIES; attempt += 1) {
    const response = await fetchWithTimeout(url, BESTBUY_SEARCH_TIMEOUT_MS, label);
    const details = await readJsonOrText(response);
    attempts.push({
      status: response.status ?? 200,
      ok: response.ok !== false && (response.status === undefined || response.status < 400),
      productCount: Array.isArray(details?.products) ? details.products.length : undefined,
      error: response.ok === false || response.status >= 400 ? getErrorMessage(details) : undefined
    });

    if (response.ok !== false && (response.status === undefined || response.status < 400)) {
      return {
        data: details || {},
        attempts
      };
    }

    if (isRateLimitResponse(response, details) && attempt < BESTBUY_MAX_RETRIES) {
      const waitMs = BESTBUY_RATE_LIMIT_DELAY_MS * (attempt + 1);
      console.warn(`${label} hit Best Buy rate limit. Waiting ${waitMs}ms before retry ${attempt + 1}/${BESTBUY_MAX_RETRIES}.`);
      await sleep(waitMs);
      continue;
    }

    throw new Error(`${label} failed with ${response.status}${getErrorMessage(details) ? `: ${getErrorMessage(details)}` : ""}`);
  }

  throw new Error(`${label} failed after ${BESTBUY_MAX_RETRIES} retries`);
}

function hasValidPrice(product) {
  return typeof product?.salePrice === "number" && Number.isFinite(product.salePrice);
}

function getBestBuyIdentifierFields(product) {
  return {
    ...(product?.upc ? { upc: product.upc } : {}),
    ...(product?.modelNumber ? { modelNumber: product.modelNumber } : {}),
    ...(product?.manufacturer ? { manufacturer: product.manufacturer } : {})
  };
}

function toSearchResult(product, sourceInput) {
  const identifiers = getBestBuyIdentifierFields(product);
  const offer = {
    retailer: "BestBuy",
    retailerId: product.sku,
    name: product.name,
    price: product.salePrice,
    url: product.url || null,
    image: product.image || null,
    ...identifiers
  };

  return {
    title: product.name,
    name: product.name,
    image: product.image || null,
    url: product.url || null,
    sourceInput,
    cheapestPrice: product.salePrice,
    lowestPrice: product.salePrice,
    cheapestRetailer: "BestBuy",
    ...identifiers,
    offers: [offer]
  };
}

async function fetchBestBuyProducts(input, apiKey, categoryId = null) {
  const url = buildBestBuySearchUrl(input, apiKey, categoryId);
  const { data, attempts } = await fetchBestBuyJsonWithRetry(url, "BestBuy search request");
  const products = Array.isArray(data?.products) ? data.products : [];

  return {
    products,
    debug: {
      query: input,
      categoryId,
      url: url.replace(/apiKey=[^&]+/, "apiKey=REDACTED"),
      attempts,
      productCount: products.length,
      sampleProducts: products.slice(0, 5).map(product => ({
        sku: product?.sku,
        name: product?.name,
        salePrice: product?.salePrice,
        upc: product?.upc,
        modelNumber: product?.modelNumber,
        manufacturer: product?.manufacturer,
        categoryPath: Array.isArray(product?.categoryPath)
          ? product.categoryPath.map(category => category?.name).filter(Boolean)
          : []
      }))
    }
  };
}

function dedupeProducts(products) {
  const seen = new Set();

  return products.filter(product => {
    const key = product?.sku || product?.url || product?.name;

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function toQueryString(terms) {
  return terms.join(" ").trim();
}

function getSearchQueryVariants(input) {
  const terms = getSearchTerms(input);
  const variants = [toQueryString(terms)];
  const withoutNumericTerms = terms.filter(term => !/^\d+$/.test(term));
  const withoutStopWords = terms.filter(term => !QUERY_RELAXATION_STOP_WORDS.has(term));
  const withoutBrands = terms.filter(term => !QUERY_RELAXATION_BRANDS.has(term));
  const withoutGenericWords = terms.filter(term => !QUERY_RELAXATION_PRODUCT_WORDS.has(term));

  variants.push(
    toQueryString(withoutNumericTerms),
    toQueryString(withoutStopWords),
    toQueryString(withoutBrands),
    toQueryString(withoutGenericWords)
  );

  if (terms.length > 2) {
    variants.push(
      toQueryString(terms.slice(0, -1)),
      toQueryString(terms.slice(1)),
      toQueryString(terms.slice(-2))
    );
  }

  return unique(variants);
}

function mapProductsToResults(products, input, limit) {
  return products
    .filter(product => product?.name && hasValidPrice(product))
    .slice(0, limit)
    .map(product => toSearchResult(product, input));
}

export async function searchBestBuyResults(input, options = {}) {
  const apiKey = process.env.BESTBUY_API_KEY;
  const limit = options.limit ?? BESTBUY_RESULT_LIMIT;
  const debugCalls = [];

  if (!apiKey) {
    throw new Error("Missing required environment variable: BESTBUY_API_KEY");
  }

  const categoryIds = (await resolveBestBuyCategoryIds(input, apiKey))
    .slice(0, BESTBUY_CATEGORY_SEARCH_LIMIT);
  const queryVariants = getSearchQueryVariants(input);
  const products = [];
  let callCount = 0;

  for (const categoryId of categoryIds) {
    if (callCount >= BESTBUY_MAX_CALLS_PER_SEARCH) {
      break;
    }

    try {
      if (callCount > 0) {
        await sleep(BESTBUY_INTER_CALL_DELAY_MS);
      }

      callCount += 1;
      const result = await fetchBestBuyProducts(input, apiKey, categoryId);
      products.push(...result.products);
      debugCalls.push({
        type: "category",
        ...result.debug
      });
    } catch (err) {
      debugCalls.push({
        type: "category",
        query: input,
        categoryId,
        error: err.message
      });
      console.error("Best Buy category product search failed:", err);
    }
  }

  for (const query of queryVariants) {
    if (callCount >= BESTBUY_MAX_CALLS_PER_SEARCH) {
      break;
    }

    if (callCount > 0) {
      await sleep(BESTBUY_INTER_CALL_DELAY_MS);
    }

    callCount += 1;
    const result = await fetchBestBuyProducts(query, apiKey);
    products.push(...result.products);
    debugCalls.push({
      type: "raw",
      ...result.debug
    });

    if (mapProductsToResults(dedupeProducts(products), input, limit).length >= limit) {
      break;
    }
  }

  const dedupedProducts = dedupeProducts(products);
  const items = mapProductsToResults(dedupedProducts, input, limit);

  if (options.debug) {
    return {
      items,
      debug: {
        provider: "bestbuy",
        input,
        categoryIds,
        queryVariants,
        interCallDelayMs: BESTBUY_INTER_CALL_DELAY_MS,
        callCount,
        rawProductCount: products.length,
        dedupedProductCount: dedupedProducts.length,
        returnedItemCount: items.length,
        returnedItems: items.slice(0, 10).map(item => ({
          name: item.name,
          lowestPrice: item.lowestPrice,
          cheapestRetailer: item.cheapestRetailer,
          upc: item.upc,
          modelNumber: item.modelNumber,
          manufacturer: item.manufacturer
        })),
        calls: debugCalls
      }
    };
  }

  return items;
}
